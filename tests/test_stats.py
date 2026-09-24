"""Testes do núcleo estatístico."""

import unittest
from datetime import date, timedelta

from medplan.stats import Episodio, avaliar_horizonte, formatar_taxa, ic_wilson

INICIO = date(2025, 1, 1)


def episodio(status: str, dias: int) -> Episodio:
    """Episódio que durou `dias` a partir de INICIO."""
    fim = INICIO + timedelta(days=dias)
    encerrado = status not in ("em_uso", "perdido_seguimento")
    return Episodio(
        data_inicio=INICIO,
        status=status,
        data_fim=fim if encerrado else None,
        data_ultima_observacao=fim,
    )


class TestWilson(unittest.TestCase):
    def test_valores_conhecidos(self):
        # Valores publicados para o intervalo de Wilson de 95%.
        lo, hi = ic_wilson(10, 20)
        self.assertAlmostEqual(lo, 0.2993, places=4)
        self.assertAlmostEqual(hi, 0.7007, places=4)

    def test_zero_sucessos_nao_sai_do_intervalo(self):
        # É aqui que a aproximação normal falha feio: ela devolveria (0, 0).
        lo, hi = ic_wilson(0, 10)
        self.assertEqual(lo, 0.0)
        self.assertAlmostEqual(hi, 0.2775, places=4)
        self.assertGreater(hi, 0.0)

    def test_sucesso_total_nao_estoura_um(self):
        lo, hi = ic_wilson(10, 10)
        self.assertEqual(hi, 1.0)
        self.assertLess(lo, 1.0)

    def test_n_maior_estreita_o_intervalo(self):
        estreito = ic_wilson(300, 400)
        largo = ic_wilson(3, 4)
        self.assertLess(estreito[1] - estreito[0], largo[1] - largo[0])

    def test_entradas_invalidas(self):
        with self.assertRaises(ValueError):
            ic_wilson(1, 0)
        with self.assertRaises(ValueError):
            ic_wilson(5, 3)


class TestCensura(unittest.TestCase):
    """A regra que impede inflar a taxa de tolerância."""

    def test_em_uso_com_seguimento_curto_sai_do_denominador(self):
        r = avaliar_horizonte([episodio("em_uso", 30)], horizonte_dias=84)
        self.assertEqual(r.n_censurado, 1)
        self.assertEqual(r.n_avaliavel, 0)
        self.assertIsNone(r.taxa_permanencia)

    def test_perdido_seguimento_curto_tambem_sai(self):
        r = avaliar_horizonte([episodio("perdido_seguimento", 20)], horizonte_dias=84)
        self.assertEqual(r.n_censurado, 1)
        self.assertEqual(r.n_avaliavel, 0)

    def test_em_uso_alem_do_horizonte_conta_como_retido(self):
        r = avaliar_horizonte([episodio("em_uso", 200)], horizonte_dias=84)
        self.assertEqual(r.n_censurado, 0)
        self.assertEqual(r.n_retidos, 1)
        self.assertEqual(r.taxa_permanencia, 1.0)

    def test_descontinuacao_antes_do_horizonte_e_evento(self):
        r = avaliar_horizonte([episodio("desc_reacao_adversa", 30)], horizonte_dias=84)
        self.assertEqual(r.n_avaliavel, 1)
        self.assertEqual(r.n_retidos, 0)
        self.assertEqual(r.eventos_por_motivo["desc_reacao_adversa"], 1)

    def test_descontinuacao_depois_do_horizonte_e_retencao(self):
        r = avaliar_horizonte([episodio("desc_reacao_adversa", 150)], horizonte_dias=84)
        self.assertEqual(r.n_retidos, 1)
        self.assertEqual(r.eventos_por_motivo, {})

    def test_conclusao_bem_sucedida_precoce_conta_como_retida(self):
        r = avaliar_horizonte([episodio("concluido_sucesso", 40)], horizonte_dias=84)
        self.assertEqual(r.n_retidos, 1)

    def test_taxas_somam_um(self):
        episodios = [
            episodio("desc_reacao_adversa", 20),
            episodio("desc_ineficacia", 50),
            episodio("desc_nao_adesao", 30),
            episodio("em_uso", 200),
            episodio("concluido_sucesso", 300),
            episodio("em_uso", 10),  # censurado, fora da conta
        ]
        r = avaliar_horizonte(episodios, horizonte_dias=84)
        self.assertEqual(r.n_avaliavel, 5)
        self.assertEqual(r.n_censurado, 1)
        soma = r.taxa_permanencia + sum(
            r.taxa_motivo(m) for m in r.eventos_por_motivo
        )
        self.assertAlmostEqual(soma, 1.0)


class TestFormatacao(unittest.TestCase):
    def test_percentual_sempre_vem_com_n_e_ic(self):
        texto = formatar_taxa(0.82, (0.75, 0.88), 134)
        self.assertIn("n=134", texto)
        self.assertIn("IC95%", texto)

    def test_sem_dado_nao_exibe_percentual(self):
        texto = formatar_taxa(None, None, 3)
        self.assertIn("insuficientes", texto)
        self.assertNotIn("%", texto.replace("IC95%", ""))


if __name__ == "__main__":
    unittest.main()
