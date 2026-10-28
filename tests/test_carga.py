"""Carga de CSV (POST /api/v1/cargas), qualidade dos dados e adicionar medicamento.

Banco temporário só com catálogos, hospital e clínicos sintéticos. Chaves e datas são
fictícias; códigos e termos vêm da própria lista de referência do banco.
"""

import os
import shutil
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from fastapi.testclient import TestClient

from medplan import db, synth
from medplan.api import app

CAB_AT = ("chave_pseudonima;sexo;data_atendimento;faixa_etaria_cod;faixa_imc_cod;tabagismo;cid10_principal;"
          "comorbidades;codigo_atc;data_inicio_medicamento;linha_tratamento;status")
CAB_RE = ("chave_pseudonima;data_atendimento;termo;codigo_atc_causador;data_inicio_medicamento;data_inicio_reacao;"
          "gravidade_observada;levou_descontinuacao")


class _BancoTemporario(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp(prefix="medplan_carga_")
        self.caminho = Path(self.pasta) / "teste.db"
        conn = db.criar_banco(self.caminho)
        synth.gerar(conn, n_perfis=0)
        atc = dict(conn.execute("SELECT principio_ativo, codigo_atc FROM medicamento"))
        self.atc_a, self.atc_b = atc["sertralina"], atc["escitalopram"]
        self.termo = conn.execute("SELECT termo FROM reacao_adversa ORDER BY id LIMIT 1").fetchone()[0]
        conn.close()
        self._anterior = os.environ.get("MEDPLAN_DB")
        os.environ["MEDPLAN_DB"] = str(self.caminho)
        self.cliente = TestClient(app)

    def tearDown(self):
        if self._anterior is None:
            os.environ.pop("MEDPLAN_DB", None)
        else:
            os.environ["MEDPLAN_DB"] = self._anterior
        shutil.rmtree(self.pasta, ignore_errors=True)

    # ---- apoio --------------------------------------------------------------------
    def linha_at(self, **m):
        v = {"chave_pseudonima": "REG-CARGA01", "sexo": "feminino", "data_atendimento": "2026-01-12",
             "faixa_etaria_cod": "26_35", "faixa_imc_cod": "sobrepeso", "tabagismo": "nunca",
             "cid10_principal": "F41.1", "comorbidades": "I10", "codigo_atc": self.atc_a,
             "data_inicio_medicamento": "2026-01-12", "linha_tratamento": "1", "status": "em_uso"}
        v.update(m)
        return ";".join(v[c] for c in CAB_AT.split(";"))

    def linha_re(self, **m):
        v = {"chave_pseudonima": "REG-CARGA01", "data_atendimento": "2026-01-12", "termo": self.termo,
             "codigo_atc_causador": self.atc_a, "data_inicio_medicamento": "2026-01-12",
             "data_inicio_reacao": "2026-01-12", "gravidade_observada": "leve", "levou_descontinuacao": "nao"}
        v.update(m)
        return ";".join(v[c] for c in CAB_RE.split(";"))

    def enviar(self, linhas_at, linhas_re=None, cab_at=CAB_AT, **extra):
        corpo = {"atendimentos": {"nome": "atendimentos.csv", "conteudo": "\n".join([cab_at, *linhas_at])}, **extra}
        if linhas_re is not None:
            corpo["reacoes"] = {"nome": "reacoes.csv", "conteudo": "\n".join([CAB_RE, *linhas_re])}
        return self.cliente.post("/api/v1/cargas", json=corpo)

    def rejeicao_unica(self, r):
        self.assertEqual(r.status_code, 201, r.text)
        rej = r.json()["rejeicoes"]
        self.assertEqual(len(rej), 1, rej)
        return rej[0]

    def contar(self, tabela):
        with closing(db.conectar(self.caminho)) as conn:
            return conn.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0]

class TestCarga(_BancoTemporario):
    # ---- carga aceita -------------------------------------------------------------
    def test_carga_valida_entra_no_data_mart_e_reconcilia(self):
        r = self.enviar([self.linha_at(), self.linha_at(chave_pseudonima="REG-CARGA02", comorbidades="", linha_tratamento="")],
                        [self.linha_re()], linhas_informadas=2)
        self.assertEqual(r.status_code, 201, r.text)
        c = r.json()
        self.assertEqual((c["lidas"], c["aceitas"], c["rejeitadas"], c["situacao"]), (3, 3, 0, "completa"))
        self.assertEqual(c["linhas_informadas"], 2)
        self.assertEqual({x["entidade"]: (x["origem"], x["banco"], x["situacao"]) for x in c["reconciliacao"]}, {
            "Pacientes": (2, 2, "confere"), "Atendimentos": (2, 2, "confere"),
            "Reações adversas": (1, 1, "confere"), "Comorbidades": (1, 1, "confere")})
        self.assertEqual(self.contar("fato_atendimento"), 2)
        self.assertEqual(self.contar("fato_reacao_adversa"), 1)

    def test_reacao_de_medicamento_anterior_na_mesma_carga(self):
        # a ordem no arquivo não importa: atendimentos são gravados por data
        r = self.enviar(
            [self.linha_at(data_atendimento="2026-03-01", codigo_atc=self.atc_b, data_inicio_medicamento="2026-03-01", linha_tratamento="2"),
             self.linha_at(data_atendimento="2026-01-12", status="desc_reacao_adversa")],
            [self.linha_re(data_atendimento="2026-03-01", data_inicio_reacao="2026-02-01")])
        self.assertEqual(r.json()["rejeitadas"], 0, r.json()["rejeicoes"])

    # ---- carga inteira recusada ---------------------------------------------------
    def test_coluna_fora_do_modelo_recusa_a_carga_inteira(self):
        r = self.enviar([self.linha_at() + ";Fulano"], cab_at=CAB_AT + ";nome")
        c = r.json()
        self.assertEqual(c["situacao"], "recusada")
        self.assertIn("coluna fora do modelo (nome)", c["motivo_recusa"])
        self.assertEqual((c["lidas"], c["aceitas"], c["rejeitadas"]), (1, 0, 1))
        self.assertEqual(self.contar("fato_atendimento"), 0)

    def test_coluna_obrigatoria_ausente_recusa_a_carga_inteira(self):
        cab = CAB_AT.replace("cid10_principal;", "")
        r = self.enviar(["x"], cab_at=cab)
        self.assertIn("faltam as colunas obrigatórias cid10_principal", r.json()["motivo_recusa"])
        self.assertEqual(self.contar("fato_atendimento"), 0)

    # ---- um teste por motivo de rejeição ------------------------------------------
    def test_motivo_registro_incompleto(self):
        rej = self.rejeicao_unica(self.enviar([self.linha_at(faixa_etaria_cod="")]))
        self.assertEqual((rej["campo"], rej["motivo"]), ("faixa_etaria_cod", "incompleto"))

    def test_motivo_codigo_fora_do_vocabulario(self):
        rej = self.rejeicao_unica(self.enviar([self.linha_at(codigo_atc="Z99ZZ99")]))
        self.assertEqual((rej["campo"], rej["motivo"]), ("codigo_atc", "vocabulario"))
        self.assertIn("adicione o medicamento em Medicamentos", rej["mensagem"])

    def test_motivo_data_inconsistente(self):
        rej = self.rejeicao_unica(self.enviar([self.linha_at(data_inicio_medicamento="2026-02-01")]))
        self.assertEqual((rej["campo"], rej["motivo"]), ("data_inicio_medicamento", "data"))
        rej = self.rejeicao_unica(self.enviar([self.linha_at(data_atendimento="2026-02-30")]))
        self.assertEqual((rej["campo"], rej["motivo"]), ("data_atendimento", "data"))

    def test_motivo_valor_fora_do_dominio(self):
        rej = self.rejeicao_unica(self.enviar([self.linha_at(status="suspenso")]))
        self.assertEqual((rej["campo"], rej["motivo"]), ("status", "dominio"))

    def test_motivo_sem_atendimento_correspondente(self):
        rej = self.rejeicao_unica(self.enviar([self.linha_at()], [self.linha_re(data_atendimento="2026-01-13")]))
        self.assertEqual((rej["arquivo"], rej["campo"], rej["motivo"]), ("reacoes", "data_atendimento", "vinculo"))
        self.assertEqual(self.contar("fato_atendimento"), 1)

    def test_motivo_ja_carregado(self):
        self.enviar([self.linha_at()])
        rej = self.rejeicao_unica(self.enviar([self.linha_at()]))
        self.assertEqual(rej["motivo"], "duplicado")
        self.assertEqual(self.contar("fato_atendimento"), 1)

    def test_rejeicao_parcial_reconcilia_e_conta_por_motivo(self):
        c = self.enviar([self.linha_at(), self.linha_at(chave_pseudonima="REG-CARGA02", sexo="X")]).json()
        self.assertEqual((c["lidas"], c["aceitas"], c["rejeitadas"], c["situacao"]), (2, 1, 1, "com_rejeicoes"))
        atend = next(x for x in c["reconciliacao"] if x["entidade"] == "Atendimentos")
        self.assertEqual((atend["diferenca"], atend["situacao"]), (-1, "explicada"))
        self.assertEqual({m["motivo"]: m["n"] for m in c["motivos"] if m["n"]}, {"dominio": 1})

    # ---- privacidade e log --------------------------------------------------------
    def test_valor_recusado_volta_na_resposta_mas_nao_e_gravado(self):
        r = self.enviar([self.linha_at(cid10_principal="F41.9X")])
        self.assertEqual(r.json()["rejeicoes"][0]["valor"], "F41.9X")
        carga_id = r.json()["id"]
        detalhe = self.cliente.get(f"/api/v1/qualidade/cargas/{carga_id}").json()
        self.assertNotIn("valor", detalhe["rejeicoes"][0])
        with closing(db.conectar(self.caminho)) as conn:
            colunas = [c[1] for c in conn.execute("PRAGMA table_info(carga_rejeicao)")]
        self.assertNotIn("valor", colunas)

    def test_nome_de_arquivo_fora_do_padrao_e_recusado(self):
        corpo = {"atendimentos": {"nome": "Maria da Silva.csv", "conteudo": CAB_AT}}
        r = self.cliente.post("/api/v1/cargas", json=corpo)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.contar("carga"), 0)

    def test_registro_de_cargas_e_somente_de_inclusao(self):
        self.enviar([self.linha_at(status="suspenso")])
        with closing(db.conectar(self.caminho)) as conn:
            for sql in ("UPDATE carga SET linhas_informadas = 1", "DELETE FROM carga",
                        "UPDATE carga_rejeicao SET motivo = 'x'", "DELETE FROM carga_rejeicao"):
                with self.assertRaises(sqlite3.DatabaseError, msg=sql):
                    conn.execute(sql)

    # ---- painel -------------------------------------------------------------------
    def test_painel_de_qualidade(self):
        self.enviar([self.linha_at()])
        q = self.cliente.get("/api/v1/qualidade").json()
        self.assertEqual(q["n_cargas"], 1)
        self.assertEqual(q["base"], {"n_atendimentos": 1, "n_pacientes": 1})
        self.assertEqual([i["n"] for i in q["integridade"]], [0, 0, 0])
        self.assertEqual(len(q["motivos"]), 6)
        self.assertEqual(self.cliente.get("/api/v1/qualidade/cargas/999").status_code, 404)


class TestAdicionarMedicamento(_BancoTemporario):
    def novo(self, **m):
        corpo = {"codigo_atc": "N06AX99", "principio_ativo": "Fármaco  Sintético", "classe_terapeutica": "Antidepressivo ISRS"}
        corpo.update(m)
        return self.cliente.post("/api/v1/medicamentos", json=corpo)

    def test_adiciona_na_referencia_e_na_dimensao_e_passa_a_valer_na_carga(self):
        r = self.novo()
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()["principio_ativo"], "fármaco sintético")
        self.assertEqual(self.contar("dim_medicamento"), self.contar("medicamento"))
        c = self.enviar([self.linha_at(codigo_atc="N06AX99")]).json()
        self.assertEqual(c["rejeitadas"], 0, c["rejeicoes"])

    def test_recusas(self):
        campos = lambda r: [e["campo"] for e in r.json()["detail"]]
        self.assertEqual(campos(self.novo(codigo_atc="N06AX9")), ["codigo_atc"])
        self.assertEqual(campos(self.novo(codigo_atc=self.atc_a)), ["codigo_atc"])
        self.assertEqual(campos(self.novo(principio_ativo="Sertralina")), ["principio_ativo"])
        self.assertEqual(campos(self.novo(classe_terapeutica="Classe inventada")), ["classe_terapeutica"])


if __name__ == "__main__":
    unittest.main()
