"""Estatística da análise de coorte.

Duas ideias sustentam este módulo:

1. **Intervalo de Wilson**, não aproximação normal. Com n pequeno — que é a
   regra, não a exceção, aqui — a aproximação normal produz intervalos que
   saem de [0,1] e cobertura errada. Wilson se comporta bem a partir de n
   baixo e é o que permite exibir incerteza honesta em vez de um número seco.

2. **Censura explícita.** Um paciente que começou o tratamento há três semanas
   e ainda está em uso NÃO é evidência de que o remédio é tolerado em doze
   semanas. Ele sai do denominador. Contá-lo como sucesso é o erro que mais
   infla taxa de tolerância em análise de prontuário.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

# Status que representam descontinuação — o evento que estamos medindo.
STATUS_DESCONTINUACAO = frozenset({
    "desc_reacao_adversa",
    "desc_ineficacia",
    "desc_nao_adesao",
    "desc_outro",
})

# Status em que o seguimento simplesmente acabou sem desfecho conhecido.
STATUS_CENSURA = frozenset({"em_uso", "perdido_seguimento"})

HORIZONTE_PADRAO_DIAS = 84  # 12 semanas


@dataclass(frozen=True)
class Episodio:
    """Um tratamento: uma prescrição e o que aconteceu com ela."""

    data_inicio: date
    status: str
    data_ultima_observacao: date
    data_fim: date | None = None

    @property
    def dias_observados(self) -> int:
        fim = self.data_fim or self.data_ultima_observacao
        return (fim - self.data_inicio).days


@dataclass(frozen=True)
class ResultadoHorizonte:
    """Retenção em um horizonte fixo, com a contabilidade toda exposta.

    `n_censurado` é publicado de propósito: o médico precisa poder ver quanto
    do dado bruto foi descartado por seguimento curto antes de confiar na taxa.
    """

    horizonte_dias: int
    n_avaliavel: int                      # denominador
    n_censurado: int                      # excluídos por seguimento insuficiente
    n_retidos: int
    eventos_por_motivo: dict[str, int] = field(default_factory=dict)

    @property
    def taxa_permanencia(self) -> float | None:
        if self.n_avaliavel == 0:
            return None
        return self.n_retidos / self.n_avaliavel

    @property
    def ic_permanencia(self) -> tuple[float, float] | None:
        if self.n_avaliavel == 0:
            return None
        return ic_wilson(self.n_retidos, self.n_avaliavel)

    def taxa_motivo(self, motivo: str) -> float | None:
        if self.n_avaliavel == 0:
            return None
        return self.eventos_por_motivo.get(motivo, 0) / self.n_avaliavel


def ic_wilson(sucessos: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Intervalo de confiança de Wilson para uma proporção (padrão: 95%)."""
    if n <= 0:
        raise ValueError("n deve ser positivo")
    if not 0 <= sucessos <= n:
        raise ValueError("sucessos deve estar entre 0 e n")

    p = sucessos / n
    z2 = z * z
    denominador = 1 + z2 / n
    centro = (p + z2 / (2 * n)) / denominador
    margem = z * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denominador
    return (max(0.0, centro - margem), min(1.0, centro + margem))


def avaliar_horizonte(
    episodios: list[Episodio], horizonte_dias: int = HORIZONTE_PADRAO_DIAS
) -> ResultadoHorizonte:
    """Quantos permaneceram em tratamento até `horizonte_dias`.

    Regra por episódio:

    - Passou do horizonte antes de qualquer desfecho -> **retido**, seja qual
      for o status final. Chegar aos 84 dias é o que está sendo medido.
    - Encerrado com resposta adequada antes do horizonte -> **retido**. Foi
      decisão clínica, não falha do medicamento.
    - Descontinuado antes do horizonte -> **evento**, contabilizado pelo motivo.
    - Ainda em uso ou perdido de vista antes do horizonte -> **censurado**,
      fora do denominador. Não sabemos o que teria acontecido.
    """
    n_retidos = 0
    n_censurado = 0
    eventos: dict[str, int] = {}

    for ep in episodios:
        dias = ep.dias_observados

        if dias >= horizonte_dias:
            n_retidos += 1
        elif ep.status in STATUS_CENSURA:
            n_censurado += 1
        elif ep.status in STATUS_DESCONTINUACAO:
            eventos[ep.status] = eventos.get(ep.status, 0) + 1
        else:  # concluido_sucesso antes do horizonte
            n_retidos += 1

    n_avaliavel = n_retidos + sum(eventos.values())
    return ResultadoHorizonte(
        horizonte_dias=horizonte_dias,
        n_avaliavel=n_avaliavel,
        n_censurado=n_censurado,
        n_retidos=n_retidos,
        eventos_por_motivo=eventos,
    )


def pct_inteiro(x: float) -> int:
    """Percentual inteiro com o critério do Python (1/8 vira 12, não 13). O front nunca arredonda."""
    return int(format(x, ".0%")[:-1])


def com_ic(valor: float, ic: tuple[float, float]) -> dict:
    """Campos de uma proporção exibível: percentual e IC, brutos e arredondados."""
    return {
        "pct": pct_inteiro(valor),
        "ic_inferior": ic[0],
        "ic_superior": ic[1],
        "ic_inferior_pct": pct_inteiro(ic[0]),
        "ic_superior_pct": pct_inteiro(ic[1]),
    }


def proporcao(k: int, n: int, n_minimo: int) -> dict:
    """Proporção k/n pronta para a tela, na convenção da API: `n` = casos, `n_base` = denominador.

    Abaixo do n mínimo (ou com denominador 0) volta só `n_base`, com `suficiente: false` e
    nenhum campo de casos, taxa, percentual ou IC: a tela mostra "dados insuficientes (n=...)".
    """
    if n == 0 or n < n_minimo:
        return {"n_base": n, "suficiente": False}
    taxa = k / n
    return {"n": k, "n_base": n, "suficiente": True, "taxa": taxa, **com_ic(taxa, ic_wilson(k, n))}


@dataclass(frozen=True)
class PontoCurva:
    dia: int
    sobrevida: float
    ic: tuple[float, float]
    n_em_risco: int


def kaplan_meier(episodios: list[Episodio], ate_dias: int) -> tuple[list[PontoCurva], list[int]]:
    """Curva de permanência (Kaplan-Meier) até `ate_dias`, com IC95% de Greenwood.

    O evento é a descontinuação, no dia em que ocorreu. Todo o resto é censura no último
    dia observado: em uso e perdido de seguimento (como em avaliar_horizonte) e também
    o concluído com resposta adequada, que não é falha do medicamento.

    Devolve (pontos, dias com censura). O primeiro ponto é o dia 0, com sobrevida 1;
    depois, um ponto por dia com evento. O IC é a fórmula de Greenwood, limitada a [0, 1].
    """
    eventos: dict[int, int] = {}
    censuras: dict[int, int] = {}
    for ep in episodios:
        dia = ep.dias_observados
        alvo = eventos if ep.status in STATUS_DESCONTINUACAO else censuras
        alvo[dia] = alvo.get(dia, 0) + 1

    em_risco = len(episodios)
    sobrevida, soma_greenwood = 1.0, 0.0
    pontos = [PontoCurva(0, 1.0, (1.0, 1.0), em_risco)]
    for dia in sorted(set(eventos) | set(censuras)):
        if dia > ate_dias:
            break
        d = eventos.get(dia, 0)
        if d:
            sobrevida *= 1 - d / em_risco
            if em_risco > d:
                soma_greenwood += d / (em_risco * (em_risco - d))
            margem = 1.96 * sobrevida * math.sqrt(soma_greenwood)
            pontos.append(PontoCurva(dia, sobrevida, (max(0.0, sobrevida - margem), min(1.0, sobrevida + margem)), em_risco))
        em_risco -= d + censuras.get(dia, 0)
    dias_censura = sorted(dia for dia in censuras if 0 < dia <= ate_dias)
    return pontos, dias_censura


def formatar_taxa(taxa: float | None, ic: tuple[float, float] | None, n: int) -> str:
    """Formata uma proporção sempre acompanhada de n e IC.

    Existe para que nenhuma tela consiga exibir um percentual solto: a regra do
    projeto é que todo número carrega seu denominador.
    """
    if taxa is None or ic is None:
        return f"dados insuficientes (n={n})"
    return f"{taxa:.0%} (n={n}, IC95% {ic[0]:.0%}–{ic[1]:.0%})"
