"""Regressão: sem faixa de IMC, a escada nova monta exatamente a mesma consulta de antes.

A escada passou a escolher os filtros pelo critério que cada degrau ignora (e ganhou
um degrau de IMC). Para provar que nada mudou para quem não informa IMC, este teste
congela abaixo a versão anterior de `construir_consulta` (copiada do commit fde4431,
sem nenhuma alteração além do nome) e compara SQL e parâmetros, degrau a degrau,
para uma variedade de perfis.
"""

import itertools
import unittest

from medplan.matching import NIVEIS, Nivel, PerfilAlvo, construir_consulta, niveis_para


# ---- versão anterior, congelada ----------------------------------------------------
def _placeholders_v1(n: int) -> str:
    return ", ".join("?" for _ in range(n))


def construir_consulta_v1(alvo: PerfilAlvo, nivel: Nivel) -> tuple[str, list]:
    """Devolve (SQL, parâmetros) que seleciona os ids de perfil da coorte.

    SQL portável entre SQLite e PostgreSQL — nada de array, nada de dialeto.
    """
    where = ["p.hospital_id = ?"]
    params: list = [alvo.hospital_id]

    # --- diagnóstico principal -------------------------------------------------
    if nivel.ordem >= 5:
        where.append(
            "p.cid10_principal IN "
            "(SELECT codigo FROM cid10 WHERE grupo = "
            " (SELECT grupo FROM cid10 WHERE codigo = ?))"
        )
        params.append(alvo.cid10_principal)
    else:
        where.append("p.cid10_principal = ?")
        params.append(alvo.cid10_principal)

    # --- faixa etária ----------------------------------------------------------
    if nivel.ordem >= 3:
        where.append(
            "p.faixa_etaria_cod IN "
            "(SELECT codigo FROM faixa_etaria WHERE ordem BETWEEN "
            " (SELECT ordem - 1 FROM faixa_etaria WHERE codigo = ?) AND "
            " (SELECT ordem + 1 FROM faixa_etaria WHERE codigo = ?))"
        )
        params.extend([alvo.faixa_etaria_cod, alvo.faixa_etaria_cod])
    else:
        where.append("p.faixa_etaria_cod = ?")
        params.append(alvo.faixa_etaria_cod)

    # --- sexo ------------------------------------------------------------------
    if nivel.ordem < 4:
        where.append("p.sexo = ?")
        params.append(alvo.sexo)

    # --- comorbidades ----------------------------------------------------------
    # Correspondência de conjunto exato, não "contém". Um alvo sem comorbidade
    # nenhuma tem que casar com perfis igualmente sem comorbidade — senão o
    # nível 0 não restringe nada e a escada perde o degrau mais estrito.
    if nivel.ordem == 0:
        alvos = alvo.comorbidades
        where.append(
            "(SELECT COUNT(*) FROM perfil_comorbidade pc "
            " WHERE pc.paciente_perfil_id = p.id) = ?"
        )
        params.append(len(alvos))
        if alvos:
            where.append(
                "(SELECT COUNT(*) FROM perfil_comorbidade pc "
                f" WHERE pc.paciente_perfil_id = p.id "
                f"   AND pc.cid10_codigo IN ({_placeholders_v1(len(alvos))})) = ?"
            )
            params.extend(alvos)
            params.append(len(alvos))

    elif nivel.ordem == 1:
        psiq = alvo.comorbidades_psiquiatricas
        where.append(
            "(SELECT COUNT(*) FROM perfil_comorbidade pc "
            " WHERE pc.paciente_perfil_id = p.id AND pc.tipo = 'psiquiatrica') = ?"
        )
        params.append(len(psiq))
        if psiq:
            where.append(
                "(SELECT COUNT(*) FROM perfil_comorbidade pc "
                f" WHERE pc.paciente_perfil_id = p.id AND pc.tipo = 'psiquiatrica' "
                f"   AND pc.cid10_codigo IN ({_placeholders_v1(len(psiq))})) = ?"
            )
            params.extend(psiq)
            params.append(len(psiq))

    # níveis >= 2 não filtram por comorbidade

    sql = "SELECT p.id FROM paciente_perfil p WHERE " + " AND ".join(where)
    return sql, params


# ---- comparação ---------------------------------------------------------------------
NIVEIS_V1 = (
    Nivel(0, "Perfil completo"),
    Nivel(1, "Comorbidades clínicas ignoradas", ("comorbidades clínicas",)),
    Nivel(2, "Comorbidades ignoradas", ("comorbidades clínicas", "comorbidades psiquiátricas")),
    Nivel(3, "Faixa etária ampliada para as adjacentes",
          ("comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária exata")),
    Nivel(4, "Sexo ignorado",
          ("comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária exata", "sexo")),
    Nivel(5, "Grupo diagnóstico em vez do código exato",
          ("comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária exata",
           "sexo", "código CID-10 exato")),
)

COMORBIDADES = [(), ("I10",), ("F41.1",), ("E66.9", "F41.1"), ("F10.2", "F17.2", "E11.9")]


class TestSemImcNadaMuda(unittest.TestCase):
    def test_escada_igual(self):
        self.assertEqual(NIVEIS, NIVEIS_V1)

    def test_mesma_consulta_em_todos_os_degraus(self):
        casos = itertools.product(
            ["feminino", "masculino", "nao_informado"],
            ["18_25", "26_35", "66_mais"],
            ["F31.3", "F41.1", "F90.0"],
            COMORBIDADES,
        )
        for sexo, faixa, dx, com in casos:
            alvo = PerfilAlvo(hospital_id=1, sexo=sexo, faixa_etaria_cod=faixa,
                              cid10_principal=dx, comorbidades=com)
            self.assertIs(niveis_para(alvo), NIVEIS)
            for nivel in NIVEIS:
                with self.subTest(sexo=sexo, faixa=faixa, dx=dx, com=com, nivel=nivel.ordem):
                    self.assertEqual(construir_consulta(alvo, nivel), construir_consulta_v1(alvo, nivel))


if __name__ == "__main__":
    unittest.main()
