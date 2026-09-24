"""Contrato da API HTTP (fase 0).

Tudo roda sobre bancos temporários com dados SINTÉTICOS: o gerador de
medplan/synth.py ou linhas montadas à mão com os helpers de test_engine.

Os invariantes aqui são os do CLAUDE.md, seção 1, vistos do lado do JSON:
nenhuma proporção sem denominador e IC, nada de percentual abaixo do n mínimo,
aviso de viés sempre presente e relaxamento sempre explicado.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from medplan import db, engine, synth
from medplan.api import app, criar_app
from medplan.matching import NIVEIS, PerfilAlvo, construir_consulta
from tests.test_engine import HOSPITAL, criar_episodio, criar_perfil

CHAVES_PROPORCAO = {"taxa", "proporcao", "pct"}
CHAVES_IC = {"ic_inferior", "ic_superior", "ic_inferior_pct", "ic_superior_pct"}
MOTIVOS = ["desc_reacao_adversa", "desc_ineficacia", "desc_nao_adesao", "desc_outro"]
CRITERIOS = ["comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária",
             "sexo", "código CID-10"]


def pct_python(x: float) -> int:
    return int(format(x, ".0%")[:-1])


def objetos(no):
    """Todos os objetos JSON, em qualquer profundidade."""
    if isinstance(no, dict):
        yield no
        for valor in no.values():
            yield from objetos(valor)
    elif isinstance(no, list):
        for valor in no:
            yield from objetos(valor)


class ComBanco(unittest.TestCase):
    """Cria um banco temporário (schema + seeds) e aponta MEDPLAN_DB para ele."""

    @classmethod
    def preparar(cls, conn):
        raise NotImplementedError

    @classmethod
    def setUpClass(cls):
        cls.pasta = tempfile.mkdtemp(prefix="medplan_teste_")
        cls.caminho = Path(cls.pasta) / "teste.db"
        conn = db.criar_banco(cls.caminho)
        try:
            cls.preparar(conn)
            conn.commit()
        finally:
            conn.close()
        cls._db_anterior = os.environ.get("MEDPLAN_DB")
        os.environ["MEDPLAN_DB"] = str(cls.caminho)
        cls.cliente = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        if cls._db_anterior is None:
            os.environ.pop("MEDPLAN_DB", None)
        else:
            os.environ["MEDPLAN_DB"] = cls._db_anterior
        shutil.rmtree(cls.pasta, ignore_errors=True)

    def analisar(self, **perfil):
        return self.cliente.post("/api/v1/analises", json=perfil)


# =============================================================================
# Base sintética do gerador
# =============================================================================
class TestReferenciasEAnaliseSintetica(ComBanco):

    CASOS = [
        dict(sexo="feminino", faixa_etaria_cod="26_35", cid10_principal="F31.3",
             comorbidades=[], horizonte_dias=84, n_minimo=20),
        dict(sexo="masculino", faixa_etaria_cod="18_25", cid10_principal="F90.0",
             comorbidades=[], horizonte_dias=84, n_minimo=20),
        dict(sexo="feminino", faixa_etaria_cod="36_50", cid10_principal="F32.1",
             comorbidades=[], horizonte_dias=84, n_minimo=5),
        dict(sexo="masculino", faixa_etaria_cod="51_65", cid10_principal="F41.1",
             comorbidades=["I10", "F10.2"], horizonte_dias=56, n_minimo=10),
    ]

    @classmethod
    def preparar(cls, conn):
        synth.gerar(conn, n_perfis=1500)

    def test_referencias_forma(self):
        r = self.cliente.get("/api/v1/referencias")
        self.assertEqual(r.status_code, 200)
        ref = r.json()
        self.assertEqual(
            set(ref),
            {"ambiente", "clinico_atual", "limites", "diagnosticos", "cid10", "faixas_etarias",
             "faixas_imc", "medicamentos", "reacoes_adversas", "opcoes"},
        )
        self.assertIs(ref["ambiente"]["dados_sinteticos"], True)
        self.assertEqual(ref["clinico_atual"]["id"], 1)
        self.assertEqual(set(ref["clinico_atual"]), {"id", "nome", "papel"})
        self.assertEqual(ref["limites"], {
            "horizonte_padrao_dias": 84, "horizonte_min_dias": 28, "horizonte_max_dias": 180,
            "n_minimo_padrao": 20, "n_minimo_min": 5, "n_minimo_max": 100,
        })

        self.assertEqual(len(ref["diagnosticos"]), 19)
        for d in ref["diagnosticos"]:
            self.assertEqual(set(d), {"codigo", "descricao", "grupo", "n_perfis"})
            self.assertTrue(d["grupo"].startswith("F"))
        base = self.cliente.get("/api/v1/base").json()
        self.assertEqual(sum(d["n_perfis"] for d in ref["diagnosticos"]), base["n_perfis"])

        self.assertEqual(len(ref["cid10"]), 27)
        for c in ref["cid10"]:
            esperado = "psiquiatrica" if c["codigo"].startswith("F") else "clinica"
            self.assertEqual(c["tipo"], esperado)
        self.assertEqual([f["codigo"] for f in ref["faixas_etarias"]],
                         ["12_17", "18_25", "26_35", "36_50", "51_65", "66_mais"])
        self.assertEqual(len(ref["faixas_imc"]), 5)
        self.assertEqual(len(ref["medicamentos"]), 23)
        self.assertEqual(set(ref["medicamentos"][0]),
                         {"id", "principio_ativo", "codigo_atc", "classe_terapeutica"})
        self.assertEqual(len(ref["reacoes_adversas"]), 26)
        self.assertEqual(set(ref["reacoes_adversas"][0]),
                         {"id", "termo", "soc", "gravidade_padrao"})

        opcoes = ref["opcoes"]
        self.assertEqual(set(opcoes), {
            "sexo", "tabagismo", "gestacao_lactacao", "funcao_renal", "funcao_hepatica",
            "uso_substancias", "via", "gravidade", "status_tratamento", "unidades_dose",
        })
        self.assertEqual(opcoes["unidades_dose"], ["mg"])
        self.assertEqual([o["codigo"] for o in opcoes["sexo"]],
                         ["feminino", "masculino", "intersexo", "nao_informado"])
        grupos = {o["codigo"]: o["grupo"] for o in opcoes["status_tratamento"]}
        self.assertEqual(grupos, {
            "em_uso": "censura", "perdido_seguimento": "censura",
            "concluido_sucesso": "sucesso", "desc_reacao_adversa": "descontinuacao",
            "desc_ineficacia": "descontinuacao", "desc_nao_adesao": "descontinuacao",
            "desc_outro": "descontinuacao",
        })

    def test_base(self):
        r = self.cliente.get("/api/v1/base")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()), {"n_perfis", "n_tratamentos", "n_reacoes_registradas"})
        self.assertEqual(r.json()["n_perfis"], 1500)

    def verificar_invariantes(self, res: dict):
        # Toda proporção carrega denominador e os dois limites do IC (float e inteiro).
        for obj in objetos(res):
            chaves = set(obj)
            if chaves & (CHAVES_PROPORCAO | CHAVES_IC):
                self.assertTrue(chaves & CHAVES_PROPORCAO, f"IC solto: {sorted(chaves)}")
                self.assertTrue({"n", "n_base"} & chaves, f"sem denominador: {sorted(chaves)}")
                self.assertIn("n_base", chaves)
                self.assertLessEqual(CHAVES_IC, chaves)
                valor = obj.get("taxa", obj.get("proporcao"))
                self.assertEqual(obj["pct"], pct_python(valor))
                self.assertEqual(obj["ic_inferior_pct"], pct_python(obj["ic_inferior"]))
                self.assertEqual(obj["ic_superior_pct"], pct_python(obj["ic_superior"]))
                self.assertGreaterEqual(obj["n_base"], res["n_minimo"])

        # Abaixo do n mínimo: nenhum campo de taxa, proporção ou IC.
        for item in res["sem_dados_suficientes"]:
            for obj in objetos(item):
                self.assertFalse(set(obj) & (CHAVES_PROPORCAO | CHAVES_IC))
            self.assertLess(item["n_avaliavel"], res["n_minimo"])

        self.assertEqual(res["dados_insuficientes"], res["recomendados"] == [])

        tipos = [a["tipo"] for a in res["avisos"]]
        self.assertEqual(tipos[0], "vies_indicacao")
        self.assertEqual(res["avisos"][0]["texto"], engine.AVISO_VIES_INDICACAO)
        self.assertEqual("relaxamento" in tipos, res["nivel"]["ordem"] > 0)
        self.assertEqual("censura" in tipos, res["total_censurado"] > 0)

        self.assertEqual([e["ordem"] for e in res["escada"]], [0, 1, 2, 3, 4, 5])
        self.assertEqual([e["ordem"] for e in res["escada"] if e["selecionado"]],
                         [res["nivel"]["ordem"]])
        escolhido = res["escada"][res["nivel"]["ordem"]]
        self.assertEqual(res["nivel"]["substituicoes"], escolhido["substituicoes"])
        for degrau in res["escada"]:
            self.assertEqual(len(degrau["substituicoes"]), len(degrau["criterios_relaxados"]))
            self.assertEqual([s["criterio"] for s in degrau["substituicoes"]],
                             CRITERIOS[:degrau["ordem"]])

        limites = [m["permanencia"]["ic_inferior"] for m in res["recomendados"]]
        self.assertEqual(limites, sorted(limites, reverse=True))
        self.assertEqual([m["posicao"] for m in res["recomendados"]],
                         list(range(1, len(res["recomendados"]) + 1)))
        for med in res["recomendados"]:
            self.assertEqual([m["motivo"] for m in med["descontinuacao_por_motivo"]], MOTIVOS)
            for m in med["descontinuacao_por_motivo"]:
                self.assertEqual(m["n_base"], med["permanencia"]["n_avaliavel"])

        self.assertIs(res["proveniencia"]["sintetico"], True)
        self.assertEqual(res["proveniencia"]["n_perfis_base"], 1500)

    def test_invariantes_da_analise(self):
        niveis, insuficientes = set(), set()
        for caso in self.CASOS:
            with self.subTest(cid=caso["cid10_principal"]):
                r = self.analisar(**caso)
                self.assertEqual(r.status_code, 200)
                res = r.json()
                self.verificar_invariantes(res)
                niveis.add(res["nivel"]["ordem"] > 0)
                insuficientes.add(res["dados_insuficientes"])
        # Os casos cobrem os dois lados de cada invariante condicional.
        self.assertEqual(niveis, {True, False})
        self.assertEqual(insuficientes, {True, False})

    def test_validacao_da_analise(self):
        valido = self.CASOS[0]
        casos = [
            ({"horizonte_dias": 27}, "horizonte_dias", None),
            ({"n_minimo": 101}, "n_minimo", None),
            ({"sexo": "sexo_x"}, "sexo", "sexo_x"),
            ({"faixa_etaria_cod": "99_99"}, "faixa_etaria_cod", "99_99"),
            ({"cid10_principal": "Z99.9"}, "cid10_principal", "Z99.9"),
            ({"cid10_principal": "E11.9"}, "cid10_principal", "E11.9"),
            ({"comorbidades": ["Q12.3"]}, "comorbidades.0", "Q12.3"),
            ({"comorbidades": ["F31.3"]}, "comorbidades.0", None),
            ({"comorbidades": ["I10", "I10"]}, "comorbidades.1", None),
            ({"nome": "Paciente Sintetico Teste"}, "nome", "Paciente Sintetico Teste"),
        ]
        for mudanca, campo, valor in casos:
            with self.subTest(campo=campo, mudanca=mudanca):
                r = self.analisar(**{**valido, **mudanca})
                self.assertEqual(r.status_code, 422)
                detalhe = r.json()["detail"]
                self.assertIn(campo, [d["campo"] for d in detalhe])
                for d in detalhe:
                    self.assertEqual(set(d), {"campo", "mensagem"})
                if valor:
                    self.assertNotIn(valor, r.text)

        sem_sexo = {k: v for k, v in valido.items() if k != "sexo"}
        r = self.analisar(**sem_sexo)
        self.assertEqual(r.json()["detail"], [{"campo": "sexo", "mensagem": "Campo obrigatório."}])

        r = self.cliente.post("/api/v1/analises", content=b"{nao e json",
                              headers={"content-type": "application/json"})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["detail"][0]["campo"], "corpo")


# =============================================================================
# Linhas montadas à mão: substituições e arredondamento
# =============================================================================
class TestAnaliseControlada(ComBanco):

    @classmethod
    def preparar(cls, conn):
        conn.execute("INSERT INTO hospital (nome, cidade, uf) VALUES ('Teste','BH','MG')")
        conn.execute("INSERT INTO clinico (hospital_id, nome, papel) "
                     "VALUES (1, 'Clínico sintético', 'medico')")
        diagnosticos = [r[0] for r in conn.execute(
            "SELECT codigo FROM cid10 WHERE grupo LIKE 'F%'")]
        faixas = [r[0] for r in conn.execute("SELECT codigo FROM faixa_etaria")]
        # Um perfil sem tratamento em cada combinação: a coorte de cada degrau
        # mostra exatamente quais códigos, faixas e sexos o SQL alcança.
        for dx in diagnosticos:
            for faixa in faixas:
                for sexo in ("feminino", "masculino"):
                    criar_perfil(conn, f"G-{dx}-{faixa}-{sexo}", sexo=sexo, faixa=faixa, dx=dx)

        # Arredondamento: sertralina com 1 retido e 7 descontinuados (n=8).
        for i in range(8):
            perfil = criar_perfil(conn, f"R{i}")
            if i == 0:
                prescricao = criar_episodio(conn, perfil, "sertralina", "concluido_sucesso", 200)
                desfecho = conn.execute(
                    "SELECT id FROM desfecho_tratamento WHERE prescricao_id = ?", (prescricao,)
                ).fetchone()[0]
                conn.execute(
                    "INSERT INTO desfecho_reacao (desfecho_id, reacao_adversa_id, dias_ate_inicio,"
                    " gravidade_observada, levou_descontinuacao) VALUES (?, 4, 3, 'leve', 0)",
                    (desfecho,),
                )
            else:
                criar_episodio(conn, perfil, "sertralina", "desc_ineficacia", 20)

    def coorte(self, alvo, ordem, coluna):
        conn = db.conectar(self.caminho)
        try:
            sql, params = construir_consulta(alvo, NIVEIS[ordem])
            return {r[0] for r in conn.execute(
                f"SELECT DISTINCT {coluna} FROM paciente_perfil WHERE id IN ({sql})", params)}
        finally:
            conn.close()

    def idades(self, faixas):
        conn = db.conectar(self.caminho)
        try:
            marcas = ", ".join("?" for _ in faixas)
            return tuple(conn.execute(
                f"SELECT MIN(idade_min), MAX(idade_max) FROM faixa_etaria WHERE codigo IN ({marcas})",
                list(faixas)).fetchone())
        finally:
            conn.close()

    def escada(self, **perfil):
        r = self.analisar(**perfil)
        self.assertEqual(r.status_code, 200)
        return {d["ordem"]: d["substituicoes"] for d in r.json()["escada"]}

    def test_substituicoes_espelham_construir_consulta(self):
        perfil = dict(sexo="feminino", faixa_etaria_cod="26_35", cid10_principal="F31.3",
                      comorbidades=["E66.9", "F41.1"], horizonte_dias=84, n_minimo=20)
        alvo = PerfilAlvo(hospital_id=HOSPITAL, sexo="feminino", faixa_etaria_cod="26_35",
                          cid10_principal="F31.3", comorbidades=("E66.9", "F41.1"))
        subs = self.escada(**perfil)

        self.assertEqual(subs[0], [])

        self.assertEqual(subs[3], [
            {"criterio": "comorbidades clínicas", "valor_informado": "E66.9",
             "valor_usado": "não filtradas"},
            {"criterio": "comorbidades psiquiátricas", "valor_informado": "F41.1",
             "valor_usado": "não filtradas"},
            {"criterio": "faixa etária", "valor_informado": "26 a 35 anos",
             "valor_usado": "18 a 50 anos"},
        ])
        faixas = self.coorte(alvo, 3, "faixa_etaria_cod")
        self.assertEqual(faixas, {"18_25", "26_35", "36_50"})
        self.assertEqual(self.idades(faixas), (18, 50))
        self.assertEqual(self.coorte(alvo, 3, "sexo"), {"feminino"})

        cid = subs[5][4]
        self.assertEqual(subs[5][3], {"criterio": "sexo", "valor_informado": "feminino",
                                      "valor_usado": "todos"})
        self.assertEqual(self.coorte(alvo, 5, "sexo"), {"feminino", "masculino"})
        self.assertEqual(cid["criterio"], "código CID-10")
        self.assertEqual(cid["valor_informado"], "F31.3")
        self.assertEqual(cid["valor_usado"], "grupo F30-F39")
        self.assertEqual(cid["codigos_grupo"], sorted(self.coorte(alvo, 5, "cid10_principal")))
        self.assertEqual(cid["codigos_grupo"],
                         ["F31.1", "F31.3", "F31.9", "F32.1", "F32.2", "F33.1", "F33.2"])
        self.assertIs(cid["grupo_amplia"], True)
        self.assertEqual(self.coorte(alvo, 4, "cid10_principal"), {"F31.3"})

    def test_grupo_cid_de_codigo_unico_nao_amplia(self):
        subs = self.escada(sexo="masculino", faixa_etaria_cod="18_25", cid10_principal="F90.0",
                           comorbidades=[], horizonte_dias=84, n_minimo=20)
        alvo = PerfilAlvo(hospital_id=HOSPITAL, sexo="masculino", faixa_etaria_cod="18_25",
                          cid10_principal="F90.0")
        self.assertEqual(subs[1], [{"criterio": "comorbidades clínicas",
                                    "valor_informado": "nenhuma", "valor_usado": "não filtradas"}])
        cid = subs[5][4]
        self.assertEqual(cid["codigos_grupo"], ["F90.0"])
        self.assertIs(cid["grupo_amplia"], False)
        self.assertEqual(self.coorte(alvo, 5, "cid10_principal"), {"F90.0"})

    def test_faixa_do_topo_fica_aberta(self):
        subs = self.escada(sexo="feminino", faixa_etaria_cod="66_mais", cid10_principal="F41.1",
                           comorbidades=[], horizonte_dias=84, n_minimo=20)
        alvo = PerfilAlvo(hospital_id=HOSPITAL, sexo="feminino", faixa_etaria_cod="66_mais",
                          cid10_principal="F41.1")
        self.assertEqual(subs[3][2], {"criterio": "faixa etária",
                                      "valor_informado": "66 anos ou mais",
                                      "valor_usado": "51 anos ou mais"})
        self.assertEqual(self.coorte(alvo, 3, "faixa_etaria_cod"), {"51_65", "66_mais"})

    def test_arredondamento_segue_o_python(self):
        r = self.analisar(sexo="feminino", faixa_etaria_cod="26_35", cid10_principal="F32.1",
                          comorbidades=[], horizonte_dias=84, n_minimo=5)
        res = r.json()
        self.assertEqual(res["nivel"]["ordem"], 0)
        self.assertEqual([a["tipo"] for a in res["avisos"]], ["vies_indicacao"])
        self.assertEqual(res["total_censurado"], 0)

        med = res["recomendados"][0]
        perm = med["permanencia"]
        self.assertEqual((perm["n_retidos"], perm["n_avaliavel"], perm["n_base"]), (1, 8, 8))
        self.assertEqual(perm["taxa"], 0.125)
        self.assertEqual(perm["pct"], 12)          # Math.round do JS daria 13

        motivos = {m["motivo"]: m for m in med["descontinuacao_por_motivo"]}
        self.assertEqual(list(motivos), MOTIVOS)
        self.assertEqual((motivos["desc_ineficacia"]["n"], motivos["desc_ineficacia"]["pct"]),
                         (7, 88))
        self.assertEqual((motivos["desc_outro"]["n"], motivos["desc_outro"]["pct"]), (0, 0))
        self.assertGreater(motivos["desc_outro"]["ic_superior_pct"], 0)

        reacao = med["reacoes"][0]
        self.assertEqual((reacao["termo"], reacao["n"], reacao["n_base"], reacao["pct"]),
                         ("Náusea", 1, 8, 12))
        self.assertEqual(reacao["mediana_dias_ate_inicio"], 3.0)

    def test_spa_servida_so_se_existir_e_sem_engolir_api(self):
        pasta = Path(self.pasta) / "dist"
        (pasta / "assets").mkdir(parents=True)
        (pasta / "index.html").write_text("<p>indice</p>", encoding="utf-8")
        (pasta / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
        cliente = TestClient(criar_app(pasta))

        self.assertIn("indice", cliente.get("/").text)
        self.assertIn("indice", cliente.get("/consulta").text)
        self.assertEqual(cliente.get("/assets/app.js").text, "console.log(1)")
        # Asset ausente (aba antiga depois de um rebuild) é 404, não o index.html.
        self.assertEqual(cliente.get("/assets/antigo-123.js").status_code, 404)
        self.assertEqual(cliente.get("/api/v1/base").status_code, 200)
        r = cliente.get("/api/v1/inexistente")
        self.assertEqual(r.status_code, 404)
        self.assertNotIn("indice", r.text)

        sem_front = TestClient(criar_app(Path(self.pasta) / "nao_existe"))
        self.assertEqual(sem_front.get("/consulta").status_code, 404)


if __name__ == "__main__":
    unittest.main()
