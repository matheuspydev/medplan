"""Registro de atendimento (POST /api/v1/atendimentos): grão do Data Mart + efeito no motor.

Banco temporário só com catálogos, hospital e clínicos sintéticos; os atendimentos são
montados à mão. Chaves e datas são fictícias.
"""

import os
import shutil
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from medplan import datamart, db, synth
from medplan.api import app


def ids(conn):
    med = {r["principio_ativo"]: r["id"] for r in conn.execute("SELECT id, principio_ativo FROM medicamento")}
    reacao = {r["termo"]: r["id"] for r in conn.execute("SELECT id, termo FROM reacao_adversa")}
    return med, reacao


class TestRegistroDeAtendimento(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.mkdtemp(prefix="medplan_atend_")
        self.caminho = Path(self.pasta) / "teste.db"
        conn = db.criar_banco(self.caminho)
        synth.gerar(conn, n_perfis=0)  # só hospital e clínicos sintéticos
        self.med, self.reacao = ids(conn)
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

    def conn(self):
        return db.conectar(self.caminho)

    def atendimento(self, **mudancas):
        corpo = {
            "paciente": {"chave_pseudonima": "REG-TESTE001", "sexo": "feminino"},
            "data_atendimento": "2026-01-12",
            "faixa_etaria_cod": "26_35",
            "faixa_imc_cod": "sobrepeso",
            "tabagismo": "nunca",
            "cid10_principal": "F41.1",
            "comorbidades": ["I10"],
            "medicamento_id": self.med["sertralina"],
            "data_inicio_medicamento": "2026-01-12",
            "linha_tratamento": 1,
            "status": "em_uso",
            "reacoes": [],
        }
        corpo.update(mudancas)
        return self.cliente.post("/api/v1/atendimentos", json=corpo)

    def test_primeiro_atendimento_cria_paciente_tratamento_e_fato(self):
        r = self.atendimento()
        self.assertEqual(r.status_code, 201, r.text)
        corpo = r.json()
        self.assertEqual(corpo["chave_pseudonima"], "REG-TESTE001")
        self.assertTrue(corpo["primeiro_atendimento"])
        self.assertEqual(corpo["n_atendimentos_paciente"], 1)

        conn = self.conn()
        perfil = conn.execute("SELECT * FROM paciente_perfil WHERE chave_pseudonima = 'REG-TESTE001'").fetchone()
        self.assertEqual((perfil["sexo"], perfil["faixa_imc_cod"], perfil["tabagismo"]), ("feminino", "sobrepeso", "nunca"))
        desfecho = conn.execute("SELECT status, data_fim, data_ultima_observacao FROM desfecho_tratamento").fetchone()
        self.assertEqual(tuple(desfecho), ("em_uso", None, "2026-01-12"))
        [a] = datamart.ler_atendimentos(conn)
        self.assertEqual((a.sexo, a.faixa_imc_cod, a.dias_observados, a.qtd_comorbidades, a.tabagista),
                         ("feminino", "sobrepeso", 0, 1, False))
        conn.close()

    def test_retorno_atualiza_o_mesmo_tratamento(self):
        self.atendimento()
        r = self.atendimento(paciente={"chave_pseudonima": "REG-TESTE001"}, data_atendimento="2026-03-08",
                             status="desc_ineficacia", tabagismo="atual")
        self.assertEqual(r.status_code, 201, r.text)
        self.assertFalse(r.json()["primeiro_atendimento"])
        self.assertEqual(r.json()["n_atendimentos_paciente"], 2)

        conn = self.conn()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM prescricao").fetchone()[0], 1)
        desfecho = conn.execute("SELECT status, data_fim, data_ultima_observacao FROM desfecho_tratamento").fetchone()
        self.assertEqual(tuple(desfecho), ("desc_ineficacia", "2026-03-08", "2026-03-08"))
        [tratamento] = datamart.agrupar_tratamentos(datamart.ler_atendimentos(conn))
        self.assertEqual(len(tratamento.atendimentos), 2)
        self.assertEqual(tratamento.ultimo.dias_observados, 55)
        self.assertTrue(tratamento.ultimo.tabagista)
        self.assertEqual(tratamento.episodio.dias_observados, 55)
        conn.close()

    def test_troca_com_reacao_do_medicamento_anterior(self):
        self.atendimento()
        r = self.atendimento(
            paciente={"chave_pseudonima": "REG-TESTE001"}, data_atendimento="2026-03-15",
            medicamento_id=self.med["escitalopram"], data_inicio_medicamento="2026-03-15", linha_tratamento=2,
            reacoes=[{"reacao_adversa_id": self.reacao["Náusea"], "medicamento_id": self.med["sertralina"],
                      "data_inicio_medicamento": "2026-01-12", "data_inicio_reacao": "2026-01-20",
                      "gravidade_observada": "moderada", "levou_descontinuacao": True}],
        )
        self.assertEqual(r.status_code, 201, r.text)

        conn = self.conn()
        [reacao] = datamart.ler_reacoes(conn)
        self.assertEqual((reacao.medicamento_id, reacao.dias_ate_reacao, reacao.levou_descontinuacao),
                         (self.med["sertralina"], 8, True))
        operacional = conn.execute(
            "SELECT pr.medicamento_id, dr.dias_ate_inicio FROM desfecho_reacao dr"
            "  JOIN desfecho_tratamento d ON d.id = dr.desfecho_id JOIN prescricao pr ON pr.id = d.prescricao_id"
        ).fetchone()
        self.assertEqual(tuple(operacional), (self.med["sertralina"], 8))
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM prescricao").fetchone()[0], 2)
        conn.close()

    def test_consulta_anterior_nao_volta_o_desfecho_no_tempo(self):
        self.atendimento()
        self.atendimento(paciente={"chave_pseudonima": "REG-TESTE001"}, data_atendimento="2026-04-01",
                         status="desc_reacao_adversa")
        r = self.atendimento(paciente={"chave_pseudonima": "REG-TESTE001"}, data_atendimento="2026-02-01")
        self.assertEqual(r.status_code, 201, r.text)
        conn = self.conn()
        self.assertEqual(conn.execute("SELECT status FROM desfecho_tratamento").fetchone()[0], "desc_reacao_adversa")
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM fato_atendimento").fetchone()[0], 3)
        conn.close()

    def campos_com_erro(self, r):
        self.assertEqual(r.status_code, 422, r.text)
        return {e["campo"] for e in r.json()["detail"]}

    def test_erros_de_dominio(self):
        self.assertIn("paciente.chave_pseudonima",
                      self.campos_com_erro(self.atendimento(paciente={"chave_pseudonima": "joão", "sexo": "feminino"})))
        self.assertIn("paciente.sexo",
                      self.campos_com_erro(self.atendimento(paciente={"chave_pseudonima": "REG-NOVO0001"})))
        self.assertIn("data_inicio_medicamento",
                      self.campos_com_erro(self.atendimento(data_inicio_medicamento="2026-02-01")))
        self.assertIn("reacoes.0.medicamento_id", self.campos_com_erro(self.atendimento(reacoes=[
            {"reacao_adversa_id": self.reacao["Náusea"], "medicamento_id": self.med["fluoxetina"],
             "data_inicio_medicamento": "2025-12-01", "gravidade_observada": "leve", "levou_descontinuacao": False}])))
        self.assertIn("reacoes.0.data_inicio_reacao", self.campos_com_erro(self.atendimento(reacoes=[
            {"reacao_adversa_id": self.reacao["Náusea"], "medicamento_id": self.med["sertralina"],
             "data_inicio_medicamento": "2026-01-12", "data_inicio_reacao": "2026-01-01",
             "gravidade_observada": "leve", "levou_descontinuacao": False}])))
        conn = self.conn()
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM fato_atendimento").fetchone()[0], 0)
        conn.close()

    def test_sexo_diferente_do_registrado_e_recusado(self):
        self.atendimento()
        self.assertIn("paciente.sexo", self.campos_com_erro(
            self.atendimento(paciente={"chave_pseudonima": "REG-TESTE001", "sexo": "masculino"})))

    def test_nao_aceita_identificador_nem_texto_livre(self):
        for campo in ("nome", "cpf", "prontuario", "observacoes"):
            r = self.atendimento(**{campo: "qualquer coisa"})
            self.assertEqual(r.status_code, 422, campo)
            self.assertNotIn("qualquer coisa", r.text)


if __name__ == "__main__":
    unittest.main()
