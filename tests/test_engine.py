"""Casos-ouro do motor de recomendação.

ESTES SÃO CASOS-OURO ESTRUTURAIS, não clínicos. Verificam invariantes que o
sistema não pode violar (nunca exibir percentual sem lastro, nunca contar
paciente censurado como sucesso, ordenar de forma conservadora).

Os casos-ouro CLÍNICOS — coortes de exemplo com o ranking que a médica
esperaria ver — ainda não existem. Enquanto não existirem, a lógica de
recomendação não está verificada no sentido do CLAUDE.md, seção 3.4.
"""

import sqlite3
import unittest
from datetime import date, timedelta

from medplan import db
from medplan.engine import recomendar
from medplan.matching import PerfilAlvo

HOSPITAL = 1
INICIO = date(2025, 1, 1)


def banco_vazio() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(db.SCHEMA_SQLITE.read_text(encoding="utf-8"))
    conn.executescript(db.SEEDS.read_text(encoding="utf-8"))
    conn.execute("INSERT INTO hospital (nome, cidade, uf) VALUES ('Teste','BH','MG')")
    conn.execute(
        "INSERT INTO clinico (hospital_id, nome, papel) VALUES (?, 'Dr. Teste', 'medico')",
        (HOSPITAL,),
    )
    conn.commit()
    return conn


def med_id(conn, principio: str) -> int:
    return conn.execute(
        "SELECT id FROM medicamento WHERE principio_ativo = ?", (principio,)
    ).fetchone()["id"]


def criar_perfil(conn, chave, sexo="feminino", faixa="26_35", dx="F32.1",
                 comorbidades=()) -> int:
    cur = conn.execute(
        "INSERT INTO paciente_perfil "
        " (hospital_id, chave_pseudonima, sexo, faixa_etaria_cod, cid10_principal) "
        " VALUES (?, ?, ?, ?, ?)",
        (HOSPITAL, chave, sexo, faixa, dx),
    )
    perfil_id = cur.lastrowid
    for cod, tipo in comorbidades:
        conn.execute(
            "INSERT INTO perfil_comorbidade "
            " (paciente_perfil_id, hospital_id, cid10_codigo, tipo) VALUES (?, ?, ?, ?)",
            (perfil_id, HOSPITAL, cod, tipo),
        )
    return perfil_id


def criar_episodio(conn, perfil_id, principio, status, dias) -> int:
    cur = conn.execute(
        "INSERT INTO prescricao "
        " (hospital_id, paciente_perfil_id, medicamento_id, clinico_id, data_inicio) "
        " VALUES (?, ?, ?, 1, ?)",
        (HOSPITAL, perfil_id, med_id(conn, principio), INICIO.isoformat()),
    )
    fim = INICIO + timedelta(days=dias)
    encerrado = status not in ("em_uso", "perdido_seguimento")
    conn.execute(
        "INSERT INTO desfecho_tratamento "
        " (hospital_id, prescricao_id, status, data_fim, data_ultima_observacao,"
        "  registrado_por) VALUES (?, ?, ?, ?, ?, 1)",
        (HOSPITAL, cur.lastrowid, status,
         fim.isoformat() if encerrado else None, fim.isoformat()),
    )
    return cur.lastrowid


ALVO = PerfilAlvo(hospital_id=HOSPITAL, sexo="feminino", faixa_etaria_cod="26_35",
                  cid10_principal="F32.1")


class TestPisoDeEvidencia(unittest.TestCase):
    """A regra mais importante do produto: nada de percentual sem lastro."""

    def setUp(self):
        self.conn = banco_vazio()

    def tearDown(self):
        self.conn.close()

    def test_base_vazia_devolve_dados_insuficientes(self):
        rec = recomendar(self.conn, ALVO, n_minimo=20)
        self.assertTrue(rec.dados_insuficientes)
        self.assertEqual(rec.recomendados, ())

    def test_n_abaixo_do_minimo_nao_vira_recomendacao(self):
        for i in range(5):
            perfil = criar_perfil(self.conn, f"P{i}")
            criar_episodio(self.conn, perfil, "sertralina", "concluido_sucesso", 200)
        self.conn.commit()

        rec = recomendar(self.conn, ALVO, n_minimo=20)
        self.assertTrue(rec.dados_insuficientes)
        # ...mas o medicamento aparece na lista de transparência, com seu n real.
        self.assertEqual(len(rec.sem_dados_suficientes), 1)
        self.assertEqual(rec.sem_dados_suficientes[0].resultado.n_avaliavel, 5)

    def test_censurados_nao_completam_o_n_minimo(self):
        # 15 desfechos reais + 10 com seguimento curto = 25 episódios brutos,
        # mas apenas 15 avaliáveis. Não pode passar do piso de 20.
        for i in range(15):
            perfil = criar_perfil(self.conn, f"R{i}")
            criar_episodio(self.conn, perfil, "sertralina", "concluido_sucesso", 200)
        for i in range(10):
            perfil = criar_perfil(self.conn, f"C{i}")
            criar_episodio(self.conn, perfil, "sertralina", "em_uso", 15)
        self.conn.commit()

        rec = recomendar(self.conn, ALVO, n_minimo=20)
        self.assertTrue(rec.dados_insuficientes)
        linha = rec.sem_dados_suficientes[0]
        self.assertEqual(linha.n_episodios, 25)
        self.assertEqual(linha.resultado.n_avaliavel, 15)
        self.assertEqual(linha.resultado.n_censurado, 10)


class TestOrdenacaoConservadora(unittest.TestCase):
    """Incerteza tem que penalizar o ranking, não ser ignorada."""

    def setUp(self):
        self.conn = banco_vazio()

    def tearDown(self):
        self.conn.close()

    def test_amostra_pequena_e_perfeita_perde_para_amostra_grande_e_boa(self):
        # escitalopram: 20/20 retidos  -> taxa 100%, limite inferior ~ 0.84
        # sertralina:  108/120 retidos -> taxa  90%, limite inferior ~ 0.83
        # Pela taxa pontual, escitalopram lideraria. Pelo limite inferior do
        # IC eles ficam quase empatados — e é assim que tem que ser.
        for i in range(20):
            perfil = criar_perfil(self.conn, f"E{i}")
            criar_episodio(self.conn, perfil, "escitalopram", "concluido_sucesso", 200)
        for i in range(108):
            perfil = criar_perfil(self.conn, f"Sok{i}")
            criar_episodio(self.conn, perfil, "sertralina", "concluido_sucesso", 200)
        for i in range(12):
            perfil = criar_perfil(self.conn, f"Sbad{i}")
            criar_episodio(self.conn, perfil, "sertralina", "desc_reacao_adversa", 20)
        self.conn.commit()

        rec = recomendar(self.conn, ALVO, n_minimo=20)
        por_nome = {l.principio_ativo: l for l in rec.recomendados}

        self.assertEqual(por_nome["escitalopram"].resultado.taxa_permanencia, 1.0)
        self.assertAlmostEqual(por_nome["sertralina"].resultado.taxa_permanencia, 0.9)
        # A ordenação usa o limite inferior, e a diferença entre eles é pequena.
        self.assertLess(
            abs(por_nome["escitalopram"].limite_inferior
                - por_nome["sertralina"].limite_inferior),
            0.05,
        )

    def test_lista_sai_ordenada_por_limite_inferior(self):
        for i in range(40):
            perfil = criar_perfil(self.conn, f"A{i}")
            criar_episodio(self.conn, perfil, "sertralina",
                           "concluido_sucesso" if i < 36 else "desc_reacao_adversa",
                           200 if i < 36 else 20)
        for i in range(40):
            perfil = criar_perfil(self.conn, f"B{i}")
            criar_episodio(self.conn, perfil, "amitriptilina",
                           "concluido_sucesso" if i < 20 else "desc_reacao_adversa",
                           200 if i < 20 else 20)
        self.conn.commit()

        rec = recomendar(self.conn, ALVO, n_minimo=20)
        limites = [l.limite_inferior for l in rec.recomendados]
        self.assertEqual(limites, sorted(limites, reverse=True))
        self.assertEqual(rec.recomendados[0].principio_ativo, "sertralina")


class TestTransparenciaDoRelaxamento(unittest.TestCase):
    """Se a coorte não é o perfil pedido, o médico precisa ser avisado."""

    def setUp(self):
        self.conn = banco_vazio()

    def tearDown(self):
        self.conn.close()

    def test_relaxamento_gera_aviso_explicito(self):
        # Alvo tem comorbidade; a base não tem ninguém com ela. Só dá n
        # suficiente depois de largar o critério de comorbidade.
        for i in range(30):
            perfil = criar_perfil(self.conn, f"X{i}")
            criar_episodio(self.conn, perfil, "sertralina", "concluido_sucesso", 200)
        self.conn.commit()

        alvo = PerfilAlvo(hospital_id=HOSPITAL, sexo="feminino",
                          faixa_etaria_cod="26_35", cid10_principal="F32.1",
                          comorbidades=("E11.9",))
        rec = recomendar(self.conn, alvo, n_minimo=20)

        self.assertFalse(rec.dados_insuficientes)
        self.assertGreaterEqual(rec.nivel.ordem, 1)
        self.assertTrue(any("ignorou" in a for a in rec.avisos))

    def test_aviso_de_vies_sempre_presente(self):
        rec = recomendar(self.conn, ALVO, n_minimo=20)
        self.assertTrue(any("observacionais" in a for a in rec.avisos))

    def test_perfil_exato_nao_gera_aviso_de_relaxamento(self):
        for i in range(30):
            perfil = criar_perfil(self.conn, f"Y{i}")
            criar_episodio(self.conn, perfil, "sertralina", "concluido_sucesso", 200)
        self.conn.commit()

        rec = recomendar(self.conn, ALVO, n_minimo=20)
        self.assertEqual(rec.nivel.ordem, 0)
        self.assertFalse(any("ignorou" in a for a in rec.avisos))


if __name__ == "__main__":
    unittest.main()
