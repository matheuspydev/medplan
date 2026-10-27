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
    # Opcional: sem faixa de IMC, a escada é a de sempre (NIVEIS), sem o degrau de IMC.
    faixa_imc_cod: str | None = None

    @property
    def comorbidades_psiquiatricas(self) -> tuple[str, ...]:
        # Todo o capítulo F da CID-10 é transtorno mental e comportamental.
        return tuple(c for c in self.comorbidades if c.upper().startswith("F"))


# Critérios que um degrau pode deixar de exigir. O texto aparece para o médico.
COMORBIDADES_CLINICAS = "comorbidades clínicas"
COMORBIDADES_PSIQUIATRICAS = "comorbidades psiquiátricas"
FAIXA_IMC_EXATA = "faixa de IMC exata"
FAIXA_ETARIA_EXATA = "faixa etária exata"
SEXO = "sexo"
CID_EXATO = "código CID-10 exato"


@dataclass(frozen=True)
class Nivel:
    """Um degrau da escada de relaxamento."""

    ordem: int
    rotulo: str
    criterios_relaxados: tuple[str, ...] = field(default=())

    def relaxa(self, criterio: str) -> bool:
        return criterio in self.criterios_relaxados


def _escada(com_imc: bool) -> tuple[Nivel, ...]:
    """Monta a escada. Cada degrau ignora tudo o que o anterior ignorava e mais um critério.

    Com faixa de IMC informada, ela é exigida igual até as comorbidades caírem e,
    no degrau seguinte, passa a aceitar as faixas adjacentes (antes da faixa etária).
    """
    degraus = [
        ("Perfil completo", ()),
        ("Comorbidades clínicas ignoradas", (COMORBIDADES_CLINICAS,)),
        ("Comorbidades ignoradas", (COMORBIDADES_PSIQUIATRICAS,)),
    ]
    if com_imc:
        degraus.append(("Faixa de IMC ampliada para as adjacentes", (FAIXA_IMC_EXATA,)))
    degraus += [
        ("Faixa etária ampliada para as adjacentes", (FAIXA_ETARIA_EXATA,)),
        ("Sexo ignorado", (SEXO,)),
        ("Grupo diagnóstico em vez do código exato", (CID_EXATO,)),
    ]
    niveis, acumulado = [], ()
    for ordem, (rotulo, novos) in enumerate(degraus):
        acumulado += novos
        niveis.append(Nivel(ordem, rotulo, acumulado))
    return tuple(niveis)


NIVEIS: tuple[Nivel, ...] = _escada(com_imc=False)
NIVEIS_COM_IMC: tuple[Nivel, ...] = _escada(com_imc=True)


def niveis_para(alvo: PerfilAlvo) -> tuple[Nivel, ...]:
    """A escada que vale para este perfil: com o degrau de IMC só se a faixa foi informada."""
    return NIVEIS_COM_IMC if alvo.faixa_imc_cod else NIVEIS


def _placeholders(n: int) -> str:
    return ", ".join("?" for _ in range(n))


def _faixa_adjacente(tabela: str) -> str:
    return (
        f"IN (SELECT codigo FROM {tabela} WHERE ordem BETWEEN "
        f" (SELECT ordem - 1 FROM {tabela} WHERE codigo = ?) AND "
        f" (SELECT ordem + 1 FROM {tabela} WHERE codigo = ?))"
    )


def construir_consulta(alvo: PerfilAlvo, nivel: Nivel) -> tuple[str, list]:
    """Devolve (SQL, parâmetros) que seleciona os ids de perfil da coorte.

    SQL portável entre SQLite e PostgreSQL — nada de array, nada de dialeto.
    """
    where = ["p.hospital_id = ?"]
    params: list = [alvo.hospital_id]

    # --- diagnóstico principal -------------------------------------------------
    if nivel.relaxa(CID_EXATO):
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
    if nivel.relaxa(FAIXA_ETARIA_EXATA):
        where.append("p.faixa_etaria_cod " + _faixa_adjacente("faixa_etaria"))
        params.extend([alvo.faixa_etaria_cod, alvo.faixa_etaria_cod])
    else:
        where.append("p.faixa_etaria_cod = ?")
        params.append(alvo.faixa_etaria_cod)

    # --- faixa de IMC (só quando informada) ----------------------------------------
    if alvo.faixa_imc_cod:
        if nivel.relaxa(FAIXA_IMC_EXATA):
            where.append("p.faixa_imc_cod " + _faixa_adjacente("faixa_imc"))
            params.extend([alvo.faixa_imc_cod, alvo.faixa_imc_cod])
        else:
            where.append("p.faixa_imc_cod = ?")
            params.append(alvo.faixa_imc_cod)

    # --- sexo ------------------------------------------------------------------
    if not nivel.relaxa(SEXO):
        where.append("p.sexo = ?")
        params.append(alvo.sexo)

    # --- comorbidades ----------------------------------------------------------
    # Correspondência de conjunto exato, não "contém". Um alvo sem comorbidade
    # nenhuma tem que casar com perfis igualmente sem comorbidade — senão o
    # nível 0 não restringe nada e a escada perde o degrau mais estrito.
    if not nivel.relaxa(COMORBIDADES_CLINICAS):
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

    elif not nivel.relaxa(COMORBIDADES_PSIQUIATRICAS):
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

    # depois disso, comorbidades não filtram

    sql = "SELECT p.id FROM paciente_perfil p WHERE " + " AND ".join(where)
    return sql, params
