"""Registro de caso pela API (POST/GET /api/v1/casos).

Dados 100% sintéticos. Doses usadas aqui são números arbitrários para exercitar
o campo — não são posologia.
"""

import copy
import re
import unittest
from datetime import date, datetime, timedelta
from unittest import mock

from medplan import db, registro
from tests.test_api import ComBanco

CHAVE = re.compile(r"^REG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$")


def dia(dias_atras: int) -> str:
    return (date.today() - timedelta(days=dias_atras)).isoformat()


def caso_valido() -> dict:
    return {
        "perfil": {
            "sexo": "feminino", "faixa_etaria_cod": "26_35", "cid10_principal": "F32.1",
            "comorbidades": ["E03.9", "F41.1"], "faixa_imc_cod": None,
            "tabagismo": "desconhecido", "gestacao_lactacao": "nao_aplicavel",
            "funcao_renal": "desconhecida", "funcao_hepatica": "desconhecida",
            "uso_substancias": "desconhecido",
        },
        "tratamentos": [
            {
                "medicamento_id": 1, "data_inicio": dia(200),
                "dose_inicial": 1.5, "unidade_dose": "mg",   # arbitrário
                "via": "oral", "linha_tratamento": 1,
                "desfecho": {"status": "desc_reacao_adversa", "data_fim": dia(180),
                             "data_ultima_observacao": dia(180), "efetividade_percebida": 2},
                "reacoes": [{"reacao_adversa_id": 4, "dias_ate_inicio": 5,
                             "gravidade_observada": "moderada", "levou_descontinuacao": True}],
            },
            {
                "medicamento_id": 3, "data_inicio": dia(150), "via": "oral",
                "desfecho": {"status": "em_uso", "data_ultima_observacao": dia(10)},
            },
        ],
    }


def com(mudar):
    """Caso válido com uma alteração aplicada."""
    caso = caso_valido()
    mudar(caso)
    return caso


def t0(caso):
    return caso["tratamentos"][0]


def t1(caso):
    return caso["tratamentos"][1]


def reacao(levou=False, rid=4):
    return {"reacao_adversa_id": rid, "dias_ate_inicio": 1,
            "gravidade_observada": "leve", "levou_descontinuacao": levou}


# (descrição, alteração, campo esperado, valores que não podem voltar na resposta)
BLOQUEANTES = [
    ("faixa inexistente", lambda c: c["perfil"].update(faixa_etaria_cod="99_99"),
     "perfil.faixa_etaria_cod", ["99_99"]),
    ("cid inexistente", lambda c: c["perfil"].update(cid10_principal="Z99.9"),
     "perfil.cid10_principal", ["Z99.9"]),
    ("cid fora do recorte", lambda c: c["perfil"].update(cid10_principal="E11.9"),
     "perfil.cid10_principal", ["E11.9"]),
    ("sexo fora do enum", lambda c: c["perfil"].update(sexo="sexo_x"), "perfil.sexo", ["sexo_x"]),
    ("comorbidade inexistente", lambda c: c["perfil"].update(comorbidades=["Q12.3"]),
     "perfil.comorbidades.0", ["Q12.3"]),
    ("comorbidade igual ao principal", lambda c: c["perfil"].update(comorbidades=["F32.1"]),
     "perfil.comorbidades.0", []),
    ("comorbidade repetida", lambda c: c["perfil"].update(comorbidades=["E03.9", "E03.9"]),
     "perfil.comorbidades.1", []),
    ("imc inexistente", lambda c: c["perfil"].update(faixa_imc_cod="imc_x"),
     "perfil.faixa_imc_cod", ["imc_x"]),
    ("imc ausente", lambda c: c["perfil"].pop("faixa_imc_cod"), "perfil.faixa_imc_cod", []),
    ("tabagismo ausente", lambda c: c["perfil"].pop("tabagismo"), "perfil.tabagismo", []),
    ("sem tratamentos", lambda c: c.update(tratamentos=[]), "tratamentos", []),
    ("tratamentos demais", lambda c: c.update(tratamentos=[t1(c)] * 11), "tratamentos", []),
    ("medicamento inexistente", lambda c: t0(c).update(medicamento_id=9999),
     "tratamentos.0.medicamento_id", []),
    ("via ausente", lambda c: t0(c).pop("via"), "tratamentos.0.via", []),
    ("data em formato errado", lambda c: t0(c).update(data_inicio="03/02/2025"),
     "tratamentos.0.data_inicio", ["03/02/2025"]),
    ("início no futuro", lambda c: t0(c).update(data_inicio=dia(-1)),
     "tratamentos.0.data_inicio", [dia(-1)]),
    ("fim no futuro", lambda c: t0(c)["desfecho"].update(data_fim=dia(-2)),
     "tratamentos.0.desfecho.data_fim", [dia(-2)]),
    ("última observação no futuro",
     lambda c: t1(c)["desfecho"].update(data_ultima_observacao=dia(-3)),
     "tratamentos.1.desfecho.data_ultima_observacao", [dia(-3)]),
    ("fim antes do início", lambda c: t0(c)["desfecho"].update(data_fim=dia(201)),
     "tratamentos.0.desfecho.data_fim", [dia(201)]),
    ("última observação antes do início",
     lambda c: t1(c)["desfecho"].update(data_ultima_observacao=dia(151)),
     "tratamentos.1.desfecho.data_ultima_observacao", [dia(151)]),
    ("última observação antes do fim",
     lambda c: t0(c)["desfecho"].update(data_ultima_observacao=dia(190)),
     "tratamentos.0.desfecho.data_ultima_observacao", [dia(190)]),
    ("encerrado sem data fim", lambda c: t0(c)["desfecho"].pop("data_fim"),
     "tratamentos.0.desfecho.data_fim", []),
    ("em uso com data fim", lambda c: t1(c)["desfecho"].update(data_fim=dia(20)),
     "tratamentos.1.desfecho.data_fim", [dia(20)]),
    ("em uso sem última observação", lambda c: t1(c)["desfecho"].pop("data_ultima_observacao"),
     "tratamentos.1.desfecho.data_ultima_observacao", []),
    ("status fora do enum", lambda c: t0(c)["desfecho"].update(status="status_x"),
     "tratamentos.0.desfecho.status", ["status_x"]),
    ("efetividade fora de 1 a 5", lambda c: t0(c)["desfecho"].update(efetividade_percebida=6),
     "tratamentos.0.desfecho.efetividade_percebida", []),
    ("levou à descontinuação com em uso", lambda c: t1(c).update(reacoes=[reacao(levou=True)]),
     "tratamentos.1.reacoes.0.levou_descontinuacao", []),
    ("levou à descontinuação com concluído",
     lambda c: t0(c)["desfecho"].update(status="concluido_sucesso"),
     "tratamentos.0.reacoes.0.levou_descontinuacao", []),
    ("levou à descontinuação com perdido",
     lambda c: (t1(c)["desfecho"].update(status="perdido_seguimento"),
                t1(c).update(reacoes=[reacao(levou=True)])),
     "tratamentos.1.reacoes.0.levou_descontinuacao", []),
    ("reação inexistente", lambda c: t0(c)["reacoes"][0].update(reacao_adversa_id=9999),
     "tratamentos.0.reacoes.0.reacao_adversa_id", []),
    ("reação repetida", lambda c: t0(c)["reacoes"].append(reacao()),
     "tratamentos.0.reacoes.1.reacao_adversa_id", []),
    ("dias até início negativo", lambda c: t0(c)["reacoes"][0].update(dias_ate_inicio=-1),
     "tratamentos.0.reacoes.0.dias_ate_inicio", []),
    ("gravidade ausente", lambda c: t0(c)["reacoes"][0].pop("gravidade_observada"),
     "tratamentos.0.reacoes.0.gravidade_observada", []),
    ("levou à descontinuação ausente", lambda c: t0(c)["reacoes"][0].pop("levou_descontinuacao"),
     "tratamentos.0.reacoes.0.levou_descontinuacao", []),
    ("unidade fora da lista", lambda c: t0(c).update(unidade_dose="unidade_x"),
     "tratamentos.0.unidade_dose", ["unidade_x"]),
    ("dose sem unidade", lambda c: t0(c).pop("unidade_dose"), "tratamentos.0.unidade_dose", []),
    ("dose zero", lambda c: t0(c).update(dose_inicial=0), "tratamentos.0.dose_inicial", []),
    ("dose negativa", lambda c: t0(c).update(dose_manutencao=-2.5),
     "tratamentos.0.dose_manutencao", ["-2.5"]),
    ("linha de tratamento zero", lambda c: t0(c).update(linha_tratamento=0),
     "tratamentos.0.linha_tratamento", []),
]

IDENTIFICADORES = [
    ("nome", lambda c: c.update(nome="Paciente Sintetico Um"), "nome",
     "Paciente Sintetico Um"),
    ("nome no perfil", lambda c: c["perfil"].update(nome="Paciente Sintetico Dois"),
     "perfil.nome", "Paciente Sintetico Dois"),
    ("cpf", lambda c: c["perfil"].update(cpf="000.000.000-00"), "perfil.cpf", "000.000.000-00"),
    ("prontuario", lambda c: c["perfil"].update(prontuario="PRONT-SINT-777"),
     "perfil.prontuario", "PRONT-SINT-777"),
    ("data_nascimento", lambda c: c["perfil"].update(data_nascimento="1990-01-01"),
     "perfil.data_nascimento", "1990-01-01"),
    ("endereco", lambda c: c["perfil"].update(endereco="Rua Sintetica 123"),
     "perfil.endereco", "Rua Sintetica 123"),
    ("observacoes", lambda c: t0(c)["desfecho"].update(observacoes="texto livre sintetico"),
     "tratamentos.0.desfecho.observacoes", "texto livre sintetico"),
]


class TestRegistroDeCaso(ComBanco):

    @classmethod
    def preparar(cls, conn):
        conn.execute("INSERT INTO hospital (nome, cidade, uf) VALUES ('Sintético A','BH','MG')")
        conn.execute("INSERT INTO hospital (nome, cidade, uf) VALUES ('Sintético B','BH','MG')")
        # O primeiro clínico da tabela é de OUTRO hospital: o registro tem que
        # usar o primeiro clínico do hospital 1 (id 2), não o id 1.
        conn.execute("INSERT INTO clinico (hospital_id, nome, papel) VALUES (2, 'Clínico B', 'medico')")
        conn.execute("INSERT INTO clinico (hospital_id, nome, papel) VALUES (1, 'Clínico A1', 'medico')")
        conn.execute("INSERT INTO clinico (hospital_id, nome, papel) VALUES (1, 'Clínico A2', 'medico')")

    def registrar(self, caso):
        return self.cliente.post("/api/v1/casos", json=caso)

    def base(self):
        return self.cliente.get("/api/v1/base").json()

    def consultar(self, sql, params=()):
        conn = db.conectar(self.caminho)
        try:
            return [dict(r) for r in conn.execute(sql, params)]
        finally:
            conn.close()

    def test_caso_valido_grava_tudo(self):
        antes = self.base()
        r = self.registrar(caso_valido())
        self.assertEqual(r.status_code, 201)
        corpo = r.json()
        self.assertEqual(set(corpo),
                         {"id", "chave_pseudonima", "tratamentos", "reacoes", "criado_em", "alertas"})
        self.assertRegex(corpo["chave_pseudonima"], CHAVE)
        self.assertEqual((corpo["tratamentos"], corpo["reacoes"], corpo["alertas"]), (2, 1, []))
        self.assertIsNotNone(datetime.fromisoformat(corpo["criado_em"]).tzinfo)

        depois = self.base()
        self.assertEqual(depois["n_perfis"], antes["n_perfis"] + 1)
        self.assertEqual(depois["n_tratamentos"], antes["n_tratamentos"] + 2)
        self.assertEqual(depois["n_reacoes_registradas"], antes["n_reacoes_registradas"] + 1)

        pid = corpo["id"]
        [perfil] = self.consultar("SELECT * FROM paciente_perfil WHERE id = ?", (pid,))
        self.assertEqual((perfil["hospital_id"], perfil["chave_pseudonima"], perfil["tabagismo"]),
                         (1, corpo["chave_pseudonima"], "desconhecido"))
        self.assertIsNone(perfil["faixa_imc_cod"])
        comorbidades = self.consultar(
            "SELECT cid10_codigo, tipo, hospital_id FROM perfil_comorbidade"
            " WHERE paciente_perfil_id = ? ORDER BY cid10_codigo", (pid,))
        self.assertEqual(comorbidades, [
            {"cid10_codigo": "E03.9", "tipo": "clinica", "hospital_id": 1},
            {"cid10_codigo": "F41.1", "tipo": "psiquiatrica", "hospital_id": 1},
        ])

        tratamentos = self.consultar(
            "SELECT pr.hospital_id, pr.clinico_id, pr.unidade_dose, pr.dose_inicial,"
            "       d.hospital_id AS d_hospital, d.registrado_por, d.status, d.data_fim,"
            "       d.data_ultima_observacao, d.observacoes"
            "  FROM prescricao pr JOIN desfecho_tratamento d ON d.prescricao_id = pr.id"
            " WHERE pr.paciente_perfil_id = ? ORDER BY pr.id", (pid,))
        self.assertEqual(len(tratamentos), 2)
        for t in tratamentos:
            self.assertEqual((t["hospital_id"], t["d_hospital"]), (1, 1))
            self.assertEqual((t["clinico_id"], t["registrado_por"]), (2, 2))
            self.assertIsNone(t["observacoes"])
        self.assertEqual((tratamentos[0]["unidade_dose"], tratamentos[0]["dose_inicial"]), ("mg", 1.5))
        self.assertEqual((tratamentos[1]["status"], tratamentos[1]["data_fim"],
                          tratamentos[1]["data_ultima_observacao"]), ("em_uso", None, dia(10)))
        # Sem dose nem unidade, vale o default do schema.
        self.assertEqual(tratamentos[1]["unidade_dose"], "mg")

        [reacao_gravada] = self.consultar(
            "SELECT dr.* FROM desfecho_reacao dr"
            "  JOIN desfecho_tratamento d ON d.id = dr.desfecho_id"
            "  JOIN prescricao pr ON pr.id = d.prescricao_id"
            " WHERE pr.paciente_perfil_id = ?", (pid,))
        self.assertEqual((reacao_gravada["reacao_adversa_id"], reacao_gravada["levou_descontinuacao"],
                          reacao_gravada["gravidade_observada"]), (4, 1, "moderada"))

        recentes = self.cliente.get("/api/v1/casos", params={"limite": 3}).json()
        self.assertLessEqual(len(recentes), 3)
        primeiro = recentes[0]
        self.assertEqual(primeiro["id"], pid)
        self.assertEqual(primeiro, {
            "id": pid, "chave_pseudonima": corpo["chave_pseudonima"], "sexo": "feminino",
            "faixa_etaria_cod": "26_35", "cid10_principal": "F32.1",
            "comorbidades": ["E03.9", "F41.1"], "criado_em": corpo["criado_em"], "n_reacoes": 1,
            "tratamentos": [
                {"principio_ativo": "sertralina", "data_inicio": dia(200),
                 "status": "desc_reacao_adversa"},
                {"principio_ativo": "escitalopram", "data_inicio": dia(150), "status": "em_uso"},
            ],
        })

        ref = self.cliente.get("/api/v1/referencias").json()
        self.assertEqual(ref["clinico_atual"]["id"], 2)
        n_f321 = next(d["n_perfis"] for d in ref["diagnosticos"] if d["codigo"] == "F32.1")
        self.assertGreaterEqual(n_f321, 1)

    def test_encerrado_sem_ultima_observacao_usa_data_fim(self):
        r = self.registrar(com(lambda c: t0(c)["desfecho"].pop("data_ultima_observacao")))
        self.assertEqual(r.status_code, 201)
        [linha] = self.consultar(
            "SELECT d.data_fim, d.data_ultima_observacao FROM desfecho_tratamento d"
            "  JOIN prescricao pr ON pr.id = d.prescricao_id"
            " WHERE pr.paciente_perfil_id = ? AND d.status = 'desc_reacao_adversa'",
            (r.json()["id"],))
        self.assertEqual(linha, {"data_fim": dia(180), "data_ultima_observacao": dia(180)})

    def test_regras_bloqueantes(self):
        antes = self.base()
        for descricao, mudar, campo, valores in BLOQUEANTES:
            with self.subTest(descricao):
                r = self.registrar(com(mudar))
                self.assertEqual(r.status_code, 422, r.text)
                detalhe = r.json()["detail"]
                self.assertIn(campo, [d["campo"] for d in detalhe])
                for d in detalhe:
                    self.assertEqual(set(d), {"campo", "mensagem"})
                    self.assertTrue(d["mensagem"])
                for valor in valores:
                    self.assertNotIn(valor, r.text)
        self.assertEqual(self.base(), antes)

    def test_identificadores_e_texto_livre_sao_rejeitados(self):
        antes = self.base()
        for descricao, mudar, campo, valor in IDENTIFICADORES:
            with self.subTest(descricao):
                r = self.registrar(com(mudar))
                self.assertEqual(r.status_code, 422)
                self.assertIn(campo, [d["campo"] for d in r.json()["detail"]])
                self.assertNotIn(valor, r.text)
        self.assertEqual(self.base(), antes)

    def test_alertas_nao_bloqueiam(self):
        casos = [
            ("reação adversa sem reação marcada como causa",
             lambda c: t0(c)["reacoes"][0].update(levou_descontinuacao=False),
             "tratamentos.0.reacoes"),
            ("causa marcada com outro motivo de descontinuação",
             lambda c: t0(c)["desfecho"].update(status="desc_ineficacia"),
             "tratamentos.0.reacoes.0.levou_descontinuacao"),
            ("dias até início maior que os dias observados",
             lambda c: t0(c)["reacoes"][0].update(dias_ate_inicio=21),
             "tratamentos.0.reacoes.0.dias_ate_inicio"),
        ]
        for descricao, mudar, campo in casos:
            with self.subTest(descricao):
                r = self.registrar(com(mudar))
                self.assertEqual(r.status_code, 201, r.text)
                alertas = r.json()["alertas"]
                self.assertEqual([a["campo"] for a in alertas], [campo])
                self.assertEqual(set(alertas[0]), {"campo", "mensagem"})

        # 20 dias observados: dias_ate_inicio igual ao período não alerta.
        r = self.registrar(com(lambda c: t0(c)["reacoes"][0].update(dias_ate_inicio=20)))
        self.assertEqual(r.json()["alertas"], [])

    def test_colisao_de_chave_tenta_de_novo(self):
        existente = self.registrar(caso_valido()).json()["chave_pseudonima"]
        with mock.patch.object(registro, "gerar_chave", side_effect=[existente, "REG-ABCDEFGH"]):
            r = self.registrar(caso_valido())
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["chave_pseudonima"], "REG-ABCDEFGH")

    def test_falha_no_meio_nao_grava_nada(self):
        antes = self.base()
        original = registro._inserir

        def falhar_na_reacao(conn, tabela, colunas):
            if tabela == "desfecho_reacao":
                raise RuntimeError("falha simulada")
            return original(conn, tabela, colunas)

        with mock.patch.object(registro, "_inserir", side_effect=falhar_na_reacao):
            with self.assertRaises(RuntimeError):
                self.registrar(caso_valido())
        self.assertEqual(self.base(), antes)

    def test_chave_usa_alfabeto_sem_ambiguos(self):
        for _ in range(200):
            self.assertRegex(registro.gerar_chave(), CHAVE)

    def test_limite_da_listagem(self):
        r = self.cliente.get("/api/v1/casos", params={"limite": 0})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.json()["detail"][0]["campo"], "limite")


if __name__ == "__main__":
    unittest.main()
