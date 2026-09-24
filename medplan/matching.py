"""Definição da coorte de perfis semelhantes, com relaxamento progressivo.

O problema central da fase 0: sexo x faixa etária x diagnóstico x comorbidades
gera uma explosão combinatória. Com algumas centenas de registros, quase toda
célula fica com n entre 0 e 3. Exibir "100% toleraram (n=2)" seria pior do que
não exibir nada.

A resposta é uma escada: começa no critério mais estrito e afrouxa um degrau
por vez até a coorte ficar grande o bastante. O degrau em que parou vira parte
da explicação mostrada ao médico — se foi preciso ignorar as comorbidades para
juntar gente suficiente, ele precisa saber disso antes de decidir.

Este módulo é puro: monta predicado SQL e parâmetros, não toca no banco.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PerfilAlvo:
    """O paciente para quem se quer a recomendação."""

    hospital_id: int
    sexo: str
    faixa_etaria_cod: str
    cid10_principal: str
    comorbidades: tuple[str, ...] = ()

    @property
    def comorbidades_psiquiatricas(self) -> tuple[str, ...]:
        # Todo o capítulo F da CID-10 é transtorno mental e comportamental.
        return tuple(c for c in self.comorbidades if c.upper().startswith("F"))


@dataclass(frozen=True)
class Nivel:
    """Um degrau da escada de relaxamento."""

    ordem: int
    rotulo: str
    criterios_relaxados: tuple[str, ...] = field(default=())


NIVEIS: tuple[Nivel, ...] = (
    Nivel(0, "Perfil completo"),
    Nivel(1, "Comorbidades clínicas ignoradas",
          ("comorbidades clínicas",)),
    Nivel(2, "Comorbidades ignoradas",
          ("comorbidades clínicas", "comorbidades psiquiátricas")),
    Nivel(3, "Faixa etária ampliada para as adjacentes",
          ("comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária exata")),
    Nivel(4, "Sexo ignorado",
          ("comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária exata",
           "sexo")),
    Nivel(5, "Grupo diagnóstico em vez do código exato",
          ("comorbidades clínicas", "comorbidades psiquiátricas", "faixa etária exata",
           "sexo", "código CID-10 exato")),
)


def _placeholders(n: int) -> str:
    return ", ".join("?" for _ in range(n))


def construir_consulta(alvo: PerfilAlvo, nivel: Nivel) -> tuple[str, list]:
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
                f"   AND pc.cid10_codigo IN ({_placeholders(len(alvos))})) = ?"
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
                f"   AND pc.cid10_codigo IN ({_placeholders(len(psiq))})) = ?"
            )
            params.extend(psiq)
            params.append(len(psiq))

    # níveis >= 2 não filtram por comorbidade

    sql = "SELECT p.id FROM paciente_perfil p WHERE " + " AND ".join(where)
    return sql, params
