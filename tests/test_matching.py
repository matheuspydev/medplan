"""Testes da escada de relaxamento da coorte."""

import unittest

from medplan.matching import NIVEIS, PerfilAlvo, construir_consulta
from tests.test_engine import HOSPITAL, banco_vazio, criar_perfil

ALVO_SEM_COMORBIDADE = PerfilAlvo(
    hospital_id=HOSPITAL, sexo="feminino", faixa_etaria_cod="26_35",
    cid10_principal="F32.1",
)
ALVO_COM_COMORBIDADE = PerfilAlvo(
    hospital_id=HOSPITAL, sexo="feminino", faixa_etaria_cod="26_35",
    cid10_principal="F32.1", comorbidades=("E11.9", "F41.1"),
)


def contar(conn, alvo, nivel) -> int:
    sql, params = construir_consulta(alvo, nivel)
    return conn.execute(f"SELECT COUNT(*) FROM ({sql})", params).fetchone()[0]


class TestClassificacaoDeComorbidade(unittest.TestCase):
    def test_capitulo_f_e_psiquiatrico(self):
        self.assertEqual(
            ALVO_COM_COMORBIDADE.comorbidades_psiquiatricas, ("F41.1",)
        )


class TestEscada(unittest.TestCase):
    def setUp(self):
        self.conn = banco_vazio()

    def tearDown(self):
        self.conn.close()

    def test_relaxar_nunca_encolhe_a_coorte(self):
        # Uma população variada; cada degrau tem que incluir tudo do anterior.
        criar_perfil(self.conn, "exato")
        criar_perfil(self.conn, "com_clinica", comorbidades=(("E11.9", "clinica"),))
        criar_perfil(self.conn, "com_psiq", comorbidades=(("F41.1", "psiquiatrica"),))
        criar_perfil(self.conn, "outra_faixa", faixa="36_50")
        criar_perfil(self.conn, "outro_sexo", sexo="masculino")
        criar_perfil(self.conn, "outro_cid", dx="F33.1")
        criar_perfil(self.conn, "fora_do_grupo", dx="F41.1")
        self.conn.commit()

        contagens = [contar(self.conn, ALVO_SEM_COMORBIDADE, n) for n in NIVEIS]
        for anterior, seguinte in zip(contagens, contagens[1:]):
            self.assertLessEqual(anterior, seguinte)

    def test_nivel_zero_exige_conjunto_exato_de_comorbidades(self):
        criar_perfil(self.conn, "sem_nenhuma")
        criar_perfil(self.conn, "so_diabetes", comorbidades=(("E11.9", "clinica"),))
        criar_perfil(self.conn, "as_duas", comorbidades=(("E11.9", "clinica"),
                                                         ("F41.1", "psiquiatrica")))
        self.conn.commit()

        # Alvo com as duas comorbidades casa só com quem tem exatamente as duas.
        self.assertEqual(contar(self.conn, ALVO_COM_COMORBIDADE, NIVEIS[0]), 1)
        # E um alvo sem comorbidade nenhuma casa só com quem também não tem.
        # Sem isso, o nível 0 não restringiria nada e a escada perderia o topo.
        self.assertEqual(contar(self.conn, ALVO_SEM_COMORBIDADE, NIVEIS[0]), 1)

    def test_nivel_um_ignora_clinicas_mas_nao_psiquiatricas(self):
        criar_perfil(self.conn, "as_duas", comorbidades=(("E11.9", "clinica"),
                                                         ("F41.1", "psiquiatrica")))
        criar_perfil(self.conn, "so_psiq", comorbidades=(("F41.1", "psiquiatrica"),))
        criar_perfil(self.conn, "psiq_diferente", comorbidades=(("F10.2", "psiquiatrica"),))
        self.conn.commit()

        # Casa com quem tem F41.1, independentemente da comorbidade clínica.
        self.assertEqual(contar(self.conn, ALVO_COM_COMORBIDADE, NIVEIS[1]), 2)

    def test_nivel_tres_alcanca_faixas_adjacentes_e_so_elas(self):
        criar_perfil(self.conn, "alvo", faixa="26_35")
        criar_perfil(self.conn, "abaixo", faixa="18_25")
        criar_perfil(self.conn, "acima", faixa="36_50")
        criar_perfil(self.conn, "longe", faixa="66_mais")
        self.conn.commit()

        self.assertEqual(contar(self.conn, ALVO_SEM_COMORBIDADE, NIVEIS[3]), 3)

    def test_nivel_cinco_alcanca_o_grupo_diagnostico(self):
        criar_perfil(self.conn, "f321", dx="F32.1")
        criar_perfil(self.conn, "f331", dx="F33.1")   # mesmo grupo F30-F39
        criar_perfil(self.conn, "f411", dx="F41.1")   # grupo diferente
        self.conn.commit()

        self.assertEqual(contar(self.conn, ALVO_SEM_COMORBIDADE, NIVEIS[4]), 1)
        self.assertEqual(contar(self.conn, ALVO_SEM_COMORBIDADE, NIVEIS[5]), 2)

    def test_isolamento_por_hospital(self):
        criar_perfil(self.conn, "meu")
        self.conn.execute("INSERT INTO hospital (nome, cidade, uf) VALUES ('Outro','BH','MG')")
        self.conn.execute(
            "INSERT INTO paciente_perfil "
            " (hospital_id, chave_pseudonima, sexo, faixa_etaria_cod, cid10_principal) "
            " VALUES (2, 'alheio', 'feminino', '26_35', 'F32.1')"
        )
        self.conn.commit()

        for nivel in NIVEIS:
            self.assertEqual(contar(self.conn, ALVO_SEM_COMORBIDADE, nivel), 1,
                             f"vazamento entre hospitais no nível {nivel.ordem}")


if __name__ == "__main__":
    unittest.main()
