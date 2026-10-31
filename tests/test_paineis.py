"""Painéis do Data Mart (Visão geral, Pacientes, Medicamentos, Reações) vistos pela API.

Base SINTÉTICA do gerador. Os invariantes são os do CLAUDE.md, seção 1: nenhuma proporção
sem denominador e IC, nada de percentual abaixo do n mínimo.
"""

import os
import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path

from medplan import datamart, db, paineis, stats, synth
from medplan.stats import Episodio
from tests.test_api import CHAVES_IC, ComBanco, objetos, pct_python

CHAVES_TAXA = {"taxa", "pct", "n"} | CHAVES_IC


class InvariantesDeProporcao:
    def verificar_proporcoes(self, corpo: dict, n_minimo: int):
        vistos = 0
        for obj in objetos(corpo):
            if "suficiente" not in obj:
                continue
            vistos += 1
            if obj["suficiente"]:
                self.assertLessEqual(CHAVES_TAXA, set(obj))
                self.assertGreaterEqual(obj["n_base"], n_minimo)
                self.assertEqual(obj["pct"], pct_python(obj["taxa"]))
                self.assertEqual(obj["ic_inferior_pct"], pct_python(obj["ic_inferior"]))
                self.assertEqual(obj["ic_superior_pct"], pct_python(obj["ic_superior"]))
                # 1e-12: com 0 casos, ic_wilson devolve um limite inferior de ~1e-18
                self.assertLessEqual(obj["ic_inferior"], obj["taxa"] + 1e-12)
                self.assertLessEqual(obj["taxa"], obj["ic_superior"] + 1e-12)
            else:
                self.assertFalse(set(obj) & CHAVES_TAXA, f"percentual abaixo do n mínimo: {sorted(obj)}")
                self.assertLess(obj["n_base"], max(n_minimo, 1))
        self.assertGreater(vistos, 0)


class TestPaineis(ComBanco, InvariantesDeProporcao):
    @classmethod
    def preparar(cls, conn):
        synth.gerar(conn, n_perfis=1500)

    ROTAS = {"/visao-geral": "visao-geral", "/pacientes": "pacientes", "/reacoes/resumo": "reacoes",
             "/reacoes/peso-por-imc": "peso-por-imc"}
    FILTROS = {"sexo", "faixa_etaria_cod", "diagnostico", "faixa_imc_cod", "data_de", "data_ate"}

    def post(self, painel, **corpo):
        return self.cliente.post(f"/api/v1/paineis/{painel}", json=corpo)

    def get(self, rota, **params):
        """Atalho dos testes: monta o corpo do POST, com os filtros dentro de `filtros`."""
        if rota.startswith("/medicamentos/"):
            painel, params = "medicamento", {**params, "medicamento_id": int(rota.split("/")[2])}
        elif rota.startswith("/pacientes/"):
            painel, params = "paciente", {"chave_pseudonima": rota.split("/")[2]}
        else:
            painel = self.ROTAS[rota]
        if painel != "pacientes":
            filtros = {k: params.pop(k) for k in list(params) if k in self.FILTROS}
            if filtros:
                params["filtros"] = filtros
        r = self.post(painel, **params)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    # ---- visão geral -------------------------------------------------------------
    def test_visao_geral_forma_e_invariantes(self):
        v = self.get("/visao-geral")
        self.assertEqual(set(v["contagens"]), {"n_pacientes", "n_atendimentos", "n_tratamentos", "n_reacoes", "n_medicamentos"})
        self.assertEqual(v["contagens"]["n_pacientes"], 1500)
        self.assertGreater(v["contagens"]["n_atendimentos"], v["contagens"]["n_tratamentos"])
        self.assertEqual(v["desfecho"]["n_avaliavel"] + v["desfecho"]["n_censurado"], v["desfecho"]["n_tratamentos"])
        self.assertEqual([m["motivo"] for m in v["motivos"]],
                         ["desc_reacao_adversa", "desc_ineficacia", "desc_nao_adesao", "desc_outro"])
        self.assertEqual(sum(m["n"] for m in v["motivos"]), v["desfecho"]["descontinuado"]["n"])
        self.assertLessEqual(len(v["recentes"]), 5)
        self.verificar_proporcoes(v, 20)

    def test_filtros_recortam(self):
        tudo = self.get("/visao-geral")
        mulheres = self.get("/visao-geral", sexo="feminino")
        self.assertLess(mulheres["contagens"]["n_atendimentos"], tudo["contagens"]["n_atendimentos"])

    def atendimentos(self):
        conn = db.conectar(self.caminho)
        try:
            return datamart.ler_atendimentos(conn)
        finally:
            conn.close()

    def test_periodo_recorta_pela_data_do_atendimento(self):
        ats = self.atendimentos()
        dia = sorted(a.data for a in ats)[len(ats) // 2]
        ano = self.get("/visao-geral", data_de=f"{dia.year}-01-01", data_ate=f"{dia.year}-12-31")
        self.assertEqual(ano["contagens"]["n_atendimentos"], sum(1 for a in ats if a.data.year == dia.year))
        so_o_dia = self.get("/visao-geral", data_de=dia.isoformat(), data_ate=dia.isoformat())
        self.assertEqual(so_o_dia["contagens"]["n_atendimentos"], sum(1 for a in ats if a.data == dia))
        # pacientes: só quem tem atendimento no período, com a contagem dentro dele
        pagina = self.get("/pacientes", data_de=dia.isoformat(), data_ate=dia.isoformat(), por_pagina=100)
        self.assertEqual(pagina["total"], len({a.chave for a in ats if a.data == dia}))
        self.assertTrue(all(i["ultimo_atendimento"] == dia.isoformat() for i in pagina["itens"]))
        invertido = {"data_de": "2026-02-01", "data_ate": "2026-01-01"}
        self.assertEqual(self.post("visao-geral", filtros=invertido).status_code, 422)
        self.assertEqual(self.post("pacientes", **invertido).status_code, 422)

    def test_pacientes_por_faixa_e_por_imc(self):
        v = self.get("/visao-geral")
        n = v["contagens"]["n_pacientes"]
        # cada paciente entra uma vez em cada gráfico
        self.assertEqual(sum(f["n_pacientes"] for f in v["pacientes_por_faixa"]), n)
        self.assertEqual(sum(f["n_pacientes"] for f in v["pacientes_por_imc"]), n)
        self.assertIsNone(v["pacientes_por_imc"][-1]["codigo"])  # "não informado" por último
        mulheres = self.get("/visao-geral", sexo="feminino")
        self.assertEqual(sum(f["n_pacientes"] for f in mulheres["pacientes_por_faixa"]), mulheres["contagens"]["n_pacientes"])

    def test_tempo_entre_atendimentos(self):
        t = self.get("/visao-geral")["tempo_entre_atendimentos"]
        self.assertGreaterEqual(t["n_intervalos"], 20)
        self.assertLessEqual(t["ic_inferior_dias"], t["media_dias"])
        self.assertLessEqual(t["media_dias"], t["ic_superior_dias"])
        # abaixo do n mínimo: sem média nem IC
        pouco = paineis._tempo_entre_atendimentos(self.atendimentos()[:3], 20)
        self.assertIsNone(pouco["media_dias"])
        self.assertNotIn("ic_inferior_dias", pouco)

    def test_base_em_cache_ate_o_banco_mudar(self):
        copia = Path(self.pasta) / "copia.db"
        shutil.copy(self.caminho, copia)
        conn = db.conectar(copia)
        try:
            base = paineis.base_atual(conn)
            self.assertIs(paineis.base_atual(conn), base)
            conn.execute("DELETE FROM fato_reacao_adversa WHERE rowid = (SELECT MAX(rowid) FROM fato_reacao_adversa)")
            conn.commit()
            nova = paineis.base_atual(conn)
            self.assertIsNot(nova, base)
            self.assertEqual(len(nova.reacoes), len(base.reacoes) - 1)
        finally:
            conn.close()

    def test_painel_ve_atendimento_recem_registrado(self):
        copia = Path(self.pasta) / "copia_api.db"
        shutil.copy(self.caminho, copia)
        self.addCleanup(os.environ.__setitem__, "MEDPLAN_DB", os.environ["MEDPLAN_DB"])
        os.environ["MEDPLAN_DB"] = str(copia)
        antes = self.get("/visao-geral")["contagens"]["n_atendimentos"]
        conn = db.conectar(copia)
        try:
            # duplica o último atendimento: só a contagem importa aqui
            colunas = [r["name"] for r in conn.execute("PRAGMA table_info(fato_atendimento)") if r["name"] != "sk_atendimento"]
            lista = ", ".join(colunas)
            conn.execute(f"INSERT INTO fato_atendimento ({lista}) SELECT {lista} FROM fato_atendimento "
                         "WHERE sk_atendimento = (SELECT MAX(sk_atendimento) FROM fato_atendimento)")
            conn.commit()
        finally:
            conn.close()
        self.assertEqual(self.get("/visao-geral")["contagens"]["n_atendimentos"], antes + 1)

    def test_filtro_desconhecido_e_recusado(self):
        self.assertEqual(self.post("visao-geral", filtros={"faixa_imc_cod": "nao_existe"}).status_code, 422)
        self.assertEqual(self.post("visao-geral", filtros={"comorbidades": 1}).status_code, 422)
        self.assertEqual(self.post("visao-geral", filtros={"tabagista": True}).status_code, 422)
        self.assertEqual(self.post("visao-geral", filtros={"nome": "x"}).status_code, 422)

    # ---- pacientes ------------------------------------------------------------------
    def test_lista_de_pacientes_busca_sem_acento_e_pagina(self):
        pagina = self.get("/pacientes", q="ansiedade", por_pagina=5)
        self.assertGreater(pagina["total"], 0)
        self.assertEqual(len(pagina["itens"]), 5)
        for item in pagina["itens"]:
            self.assertIn("ansiedade", item["descricao_cid"].lower())
        datas = [i["ultimo_atendimento"] for i in pagina["itens"]]
        self.assertEqual(datas, sorted(datas, reverse=True))
        self.assertEqual(self.get("/pacientes", q="F411")["total"], self.get("/pacientes", q="f41.1")["total"])

    def test_ficha_do_paciente(self):
        chave = self.get("/pacientes", por_pagina=1)["itens"][0]["chave_pseudonima"]
        ficha = self.get(f"/pacientes/{chave}")
        self.assertEqual(ficha["chave_pseudonima"], chave)
        datas = [a["data"] for a in ficha["atendimentos"]]
        self.assertEqual(datas, sorted(datas, reverse=True))
        self.assertEqual(sum(t["n_atendimentos"] for t in ficha["tratamentos"]), len(ficha["atendimentos"]))
        self.assertEqual(self.post("paciente", chave_pseudonima="REG-INEXISTENTE").status_code, 404)

    # ---- medicamentos ---------------------------------------------------------------
    def test_ficha_do_medicamento(self):
        med = self.get("/visao-geral")["medicamentos"][0]
        ficha = self.get(f"/medicamentos/{med['medicamento_id']}/ficha")
        c = ficha["contabilidade"]
        self.assertEqual(c["n_tratamentos"], med["n_tratamentos"])
        self.assertEqual(c["n_avaliavel"], c["n_retidos"] + c["n_descontinuados"])
        self.assertEqual(c["n_tratamentos"], c["n_avaliavel"] + c["n_censurado"])
        pontos = ficha["curva"]["pontos"]
        self.assertEqual(pontos[0]["sobrevida"], 1.0)
        for anterior, seguinte in zip(pontos, pontos[1:]):
            self.assertLess(anterior["dia"], seguinte["dia"])
            self.assertLessEqual(seguinte["sobrevida"], anterior["sobrevida"])
            self.assertLessEqual(seguinte["ic_inferior"], seguinte["sobrevida"])
            self.assertLessEqual(seguinte["sobrevida"], seguinte["ic_superior"])
        self.assertEqual(sum(sum(l["n_por_sexo"]) for l in ficha["recebem"]["linhas"]), c["n_tratamentos"])
        self.assertEqual([l["linha"] for l in ficha["por_linha"]], ["1", "2", "3+"])
        self.assertEqual(sum(l["n_tratamentos"] for l in ficha["por_linha"]) + ficha["n_sem_linha"], c["n_tratamentos"])
        self.verificar_proporcoes(ficha, 20)
        self.assertEqual(self.post("medicamento", medicamento_id=99999).status_code, 404)

    def test_curva_some_abaixo_do_n_minimo(self):
        med = self.get("/visao-geral")["medicamentos"][-1]
        ficha = self.get(f"/medicamentos/{med['medicamento_id']}/ficha", n_minimo=100)
        if ficha["contabilidade"]["n_tratamentos"] < 100:
            self.assertIsNone(ficha["curva"])
            self.assertFalse(ficha["permanencia"]["suficiente"])

    # ---- reações ----------------------------------------------------------------------
    def test_resumo_de_reacoes(self):
        r = self.get("/reacoes/resumo")
        total_soc = sum(s["n"] for s in r["por_soc"])
        self.assertEqual(total_soc, r["contagens"]["n_reacoes"])
        self.assertEqual(sum(f["n"] for f in r["dias_por_faixa"]), r["contagens"]["dias_ate_inicio"]["n"])
        self.assertEqual([g["gravidade"] for g in r["gravidade"]], ["leve", "moderada", "grave"])
        self.assertLessEqual(len(r["reacao_x_medicamento"]["medicamentos"]), 6)
        self.verificar_proporcoes(r, 20)

        med = r["reacao_x_medicamento"]["medicamentos"][0]["medicamento_id"]
        so_um = self.get("/reacoes/resumo", medicamento_id=med, linha="1")
        self.assertLess(so_um["contagens"]["n_reacoes"], r["contagens"]["n_reacoes"])

    def test_peso_por_imc(self):
        med = self.get("/visao-geral")["medicamentos"][0]["medicamento_id"]
        p = self.get("/reacoes/peso-por-imc", medicamento_id=med)
        self.assertEqual(p["linhas"][-1]["faixa_imc_cod"], None)
        self.assertEqual([l["faixa_imc_cod"] for l in p["linhas"][:-1]],
                         ["baixo_peso", "eutrofico", "sobrepeso", "obesidade_1", "obesidade_2_3"])
        self.verificar_proporcoes(p, 20)

    # ---- consulta ---------------------------------------------------------------------
    def test_analise_traz_frequencia_de_prescricao(self):
        r = self.cliente.post("/api/v1/analises", json=dict(
            sexo="feminino", faixa_etaria_cod="26_35", cid10_principal="F41.1", comorbidades=[], n_minimo=20))
        self.assertEqual(r.status_code, 200)
        f = r.json()["frequencia_prescricao"]
        self.assertGreater(f["n_atendimentos"], 0)
        self.assertEqual(sum(c["n"] for c in f["classes"] if c["suficiente"]), f["n_atendimentos"])
        self.verificar_proporcoes(f, 20)


class TestKaplanMeier(unittest.TestCase):
    def test_sem_eventos_a_curva_fica_em_um(self):
        inicio = date(2026, 1, 1)
        eps = [Episodio(inicio, "em_uso", date(2026, 3, 1)) for _ in range(5)]
        pontos, censuras = stats.kaplan_meier(eps, 182)
        self.assertEqual([p.sobrevida for p in pontos], [1.0])
        self.assertEqual(censuras, [59])

    def test_estimador_classico(self):
        # 4 tratamentos: evento no dia 10, censura no dia 20, evento no dia 30, censura no dia 40.
        inicio = date(2026, 1, 1)
        def ep(dias, status):
            fim = date.fromordinal(inicio.toordinal() + dias)
            return Episodio(inicio, status, fim, fim if status.startswith("desc") else None)
        eps = [ep(10, "desc_ineficacia"), ep(20, "em_uso"), ep(30, "desc_reacao_adversa"), ep(40, "perdido_seguimento")]
        pontos, censuras = stats.kaplan_meier(eps, 182)
        self.assertEqual([p.dia for p in pontos], [0, 10, 30])
        self.assertAlmostEqual(pontos[1].sobrevida, 3 / 4)
        self.assertAlmostEqual(pontos[2].sobrevida, 3 / 4 * 1 / 2)
        self.assertEqual([p.n_em_risco for p in pontos], [4, 4, 2])
        self.assertEqual(censuras, [20, 40])
        for p in pontos:
            self.assertLessEqual(p.ic[0], p.sobrevida)
            self.assertLessEqual(p.sobrevida, p.ic[1])

    def test_proporcao_abaixo_do_minimo_nao_tem_taxa(self):
        self.assertEqual(stats.proporcao(3, 12, 20), {"n_base": 12, "suficiente": False})
        self.assertEqual(stats.proporcao(0, 0, 5), {"n_base": 0, "suficiente": False})
        p = stats.proporcao(15, 22, 20)
        self.assertEqual((p["n"], p["n_base"], p["pct"], p["ic_inferior_pct"], p["ic_superior_pct"]), (15, 22, 68, 47, 84))


class TestDataMartDoGerador(unittest.TestCase):
    def test_um_tratamento_por_prescricao_e_reacoes_iguais(self):
        caminho = Path(tempfile.mkdtemp()) / "t.db"
        conn = db.criar_banco(caminho)
        try:
            synth.gerar(conn, n_perfis=300)
            tratamentos = datamart.agrupar_tratamentos(datamart.ler_atendimentos(conn))
            self.assertEqual(len(tratamentos), conn.execute("SELECT COUNT(*) FROM prescricao").fetchone()[0])
            self.assertEqual(len(datamart.ler_reacoes(conn)), conn.execute("SELECT COUNT(*) FROM desfecho_reacao").fetchone()[0])
            # o desfecho do tratamento no Data Mart é o mesmo do modelo que o motor lê
            status = dict(conn.execute(
                "SELECT p.chave_pseudonima || '|' || pr.medicamento_id || '|' || pr.data_inicio, d.status FROM prescricao pr"
                "  JOIN desfecho_tratamento d ON d.prescricao_id = pr.id JOIN paciente_perfil p ON p.id = pr.paciente_perfil_id"
            ).fetchall())
            for t in tratamentos:
                self.assertEqual(t.ultimo.status, status[f"{t.chave}|{t.medicamento_id}|{t.data_inicio.isoformat()}"])
        finally:
            conn.close()
