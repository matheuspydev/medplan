"""Motor de recomendação — fase 0.

Análise de coorte em SQL. Sem modelo treinado, sem caixa-preta: o que sai daqui
é contagem, proporção e intervalo de confiança, e cada número pode ser rastreado
até as linhas que o produziram.

O ranking usa o **limite inferior do IC de 95%**, não a taxa pontual. Um
medicamento com 100% e n=21 tem limite inferior por volta de 84%; outro com 88%
e n=300 fica em torno de 84% também — e o segundo é a aposta mais segura. Ordenar
pela taxa pontual colocaria o primeiro no topo e transformaria ruído amostral em
recomendação clínica.
"""

from __future__ import annotations

import sqlite3
import statistics
from dataclasses import dataclass, field
from datetime import date

from .matching import NIVEIS, Nivel, PerfilAlvo, construir_consulta
from .stats import (
    HORIZONTE_PADRAO_DIAS,
    Episodio,
    ResultadoHorizonte,
    avaliar_horizonte,
    ic_wilson,
)

N_MINIMO_PADRAO = 20

AVISO_VIES_INDICACAO = (
    "Estes dados são observacionais, não de ensaio clínico. Se um medicamento é "
    "prescrito preferencialmente para casos mais graves ou refratários, ele vai "
    "aparecer como pior tolerado — isso reflete o padrão de prescrição desta base, "
    "não uma propriedade do fármaco."
)


def _data(valor: str | None) -> date | None:
    return date.fromisoformat(valor) if valor else None


@dataclass(frozen=True)
class ReacaoFrequente:
    termo: str
    soc: str
    n: int
    n_base: int
    proporcao: float
    ic: tuple[float, float]
    mediana_dias_ate_inicio: float | None
    n_levou_descontinuacao: int


@dataclass(frozen=True)
class LinhaMedicamento:
    medicamento_id: int
    principio_ativo: str
    classe_terapeutica: str
    codigo_atc: str
    n_episodios: int                 # episódios com desfecho registrado na coorte
    resultado: ResultadoHorizonte
    reacoes: tuple[ReacaoFrequente, ...] = ()

    @property
    def limite_inferior(self) -> float:
        ic = self.resultado.ic_permanencia
        return ic[0] if ic else 0.0


@dataclass(frozen=True)
class Recomendacao:
    alvo: PerfilAlvo
    nivel: Nivel
    n_perfis: int
    horizonte_dias: int
    n_minimo: int
    recomendados: tuple[LinhaMedicamento, ...] = ()
    sem_dados_suficientes: tuple[LinhaMedicamento, ...] = ()
    avisos: tuple[str, ...] = field(default=())

    @property
    def dados_insuficientes(self) -> bool:
        return not self.recomendados


def carregar_episodios(
    conn: sqlite3.Connection, sql_coorte: str, params_coorte: list
) -> dict[int, list[Episodio]]:
    """Episódios de tratamento da coorte, agrupados por medicamento.

    A coorte entra como subconsulta em vez de lista de ids: evita o limite de
    parâmetros do SQLite e mantém uma única definição de "perfil semelhante".
    """
    sql = f"""
        SELECT pr.medicamento_id,
               pr.data_inicio,
               d.status,
               d.data_fim,
               d.data_ultima_observacao
          FROM prescricao pr
          JOIN desfecho_tratamento d ON d.prescricao_id = pr.id
         WHERE pr.paciente_perfil_id IN ({sql_coorte})
    """
    por_medicamento: dict[int, list[Episodio]] = {}
    for linha in conn.execute(sql, params_coorte):
        por_medicamento.setdefault(linha["medicamento_id"], []).append(
            Episodio(
                data_inicio=_data(linha["data_inicio"]),
                status=linha["status"],
                data_fim=_data(linha["data_fim"]),
                data_ultima_observacao=_data(linha["data_ultima_observacao"]),
            )
        )
    return por_medicamento


def carregar_reacoes(
    conn: sqlite3.Connection,
    sql_coorte: str,
    params_coorte: list,
    medicamento_id: int,
    n_base: int,
    limite: int = 6,
) -> tuple[ReacaoFrequente, ...]:
    """Reações adversas mais frequentes de um medicamento dentro da coorte.

    O denominador é o total de episódios com desfecho registrado — qualquer um
    deles poderia ter registrado uma reação, inclusive os censurados.
    """
    if n_base == 0:
        return ()

    sql = f"""
        SELECT ra.termo,
               ra.soc,
               dr.dias_ate_inicio,
               dr.levou_descontinuacao
          FROM desfecho_reacao dr
          JOIN desfecho_tratamento d  ON d.id  = dr.desfecho_id
          JOIN prescricao pr          ON pr.id = d.prescricao_id
          JOIN reacao_adversa ra      ON ra.id = dr.reacao_adversa_id
         WHERE pr.medicamento_id = ?
           AND pr.paciente_perfil_id IN ({sql_coorte})
    """
    agrupado: dict[str, dict] = {}
    for linha in conn.execute(sql, [medicamento_id, *params_coorte]):
        item = agrupado.setdefault(
            linha["termo"], {"soc": linha["soc"], "dias": [], "n": 0, "desc": 0}
        )
        item["n"] += 1
        if linha["dias_ate_inicio"] is not None:
            item["dias"].append(linha["dias_ate_inicio"])
        if linha["levou_descontinuacao"]:
            item["desc"] += 1

    reacoes = [
        ReacaoFrequente(
            termo=termo,
            soc=item["soc"],
            n=item["n"],
            n_base=n_base,
            proporcao=item["n"] / n_base,
            ic=ic_wilson(item["n"], n_base),
            mediana_dias_ate_inicio=statistics.median(item["dias"]) if item["dias"] else None,
            n_levou_descontinuacao=item["desc"],
        )
        for termo, item in agrupado.items()
    ]
    reacoes.sort(key=lambda r: r.n, reverse=True)
    return tuple(reacoes[:limite])


def _avaliar_nivel(
    conn: sqlite3.Connection,
    alvo: PerfilAlvo,
    nivel: Nivel,
    horizonte_dias: int,
) -> tuple[int, list[LinhaMedicamento]]:
    sql_coorte, params = construir_consulta(alvo, nivel)

    n_perfis = conn.execute(
        f"SELECT COUNT(*) FROM ({sql_coorte})", params
    ).fetchone()[0]
    if n_perfis == 0:
        return 0, []

    catalogo = {
        r["id"]: r
        for r in conn.execute(
            "SELECT id, principio_ativo, classe_terapeutica, codigo_atc FROM medicamento"
        )
    }

    linhas: list[LinhaMedicamento] = []
    for med_id, episodios in carregar_episodios(conn, sql_coorte, params).items():
        meta = catalogo[med_id]
        resultado = avaliar_horizonte(episodios, horizonte_dias)
        linhas.append(
            LinhaMedicamento(
                medicamento_id=med_id,
                principio_ativo=meta["principio_ativo"],
                classe_terapeutica=meta["classe_terapeutica"],
                codigo_atc=meta["codigo_atc"],
                n_episodios=len(episodios),
                resultado=resultado,
                reacoes=carregar_reacoes(
                    conn, sql_coorte, params, med_id, len(episodios)
                ),
            )
        )
    return n_perfis, linhas


@dataclass(frozen=True)
class DegrauDiagnostico:
    nivel: Nivel
    n_perfis: int
    n_medicamentos: int
    melhor_n_avaliavel: int


def diagnosticar_escada(
    conn: sqlite3.Connection,
    alvo: PerfilAlvo,
    horizonte_dias: int = HORIZONTE_PADRAO_DIAS,
) -> tuple[DegrauDiagnostico, ...]:
    """Quanto cada degrau de relaxamento rende, para o médico ver o custo.

    Existe porque a pergunta "quantos casos realmente parecidos existem?" é a
    primeira que um clínico faz — e porque expõe, sem rodeio, quando a coorte
    só ficou grande o bastante às custas de deixar de ser parecida.
    """
    degraus = []
    for nivel in NIVEIS:
        sql_coorte, params = construir_consulta(alvo, nivel)
        n_perfis = conn.execute(
            f"SELECT COUNT(*) FROM ({sql_coorte})", params
        ).fetchone()[0]

        melhor = 0
        por_med = carregar_episodios(conn, sql_coorte, params) if n_perfis else {}
        for episodios in por_med.values():
            melhor = max(melhor, avaliar_horizonte(episodios, horizonte_dias).n_avaliavel)

        degraus.append(
            DegrauDiagnostico(
                nivel=nivel,
                n_perfis=n_perfis,
                n_medicamentos=len(por_med),
                melhor_n_avaliavel=melhor,
            )
        )
    return tuple(degraus)


def recomendar(
    conn: sqlite3.Connection,
    alvo: PerfilAlvo,
    n_minimo: int = N_MINIMO_PADRAO,
    horizonte_dias: int = HORIZONTE_PADRAO_DIAS,
) -> Recomendacao:
    """Desce a escada de relaxamento até algum medicamento atingir `n_minimo`.

    Se nem o degrau mais frouxo chegar lá, devolve uma recomendação vazia — o
    sistema diz "dados insuficientes" em vez de exibir um percentual sem lastro.
    """
    nivel_final = NIVEIS[-1]
    n_perfis = 0
    linhas: list[LinhaMedicamento] = []

    for nivel in NIVEIS:
        n_perfis, linhas = _avaliar_nivel(conn, alvo, nivel, horizonte_dias)
        nivel_final = nivel
        if any(l.resultado.n_avaliavel >= n_minimo for l in linhas):
            break

    suficientes = [l for l in linhas if l.resultado.n_avaliavel >= n_minimo]
    insuficientes = [l for l in linhas if l.resultado.n_avaliavel < n_minimo]

    suficientes.sort(key=lambda l: l.limite_inferior, reverse=True)
    insuficientes.sort(key=lambda l: l.resultado.n_avaliavel, reverse=True)

    avisos = [AVISO_VIES_INDICACAO]
    if nivel_final.criterios_relaxados:
        avisos.append(
            "Para reunir casos suficientes, o sistema ignorou: "
            + ", ".join(nivel_final.criterios_relaxados)
            + ". A coorte abaixo não corresponde exatamente ao perfil informado."
        )
    total_censurado = sum(l.resultado.n_censurado for l in linhas)
    if total_censurado:
        avisos.append(
            f"{total_censurado} tratamento(s) ficaram fora do denominador por "
            f"seguimento menor que {horizonte_dias} dias sem desfecho conhecido."
        )

    return Recomendacao(
        alvo=alvo,
        nivel=nivel_final,
        n_perfis=n_perfis,
        horizonte_dias=horizonte_dias,
        n_minimo=n_minimo,
        recomendados=tuple(suficientes),
        sem_dados_suficientes=tuple(insuficientes),
        avisos=tuple(avisos),
    )
