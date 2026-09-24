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


def formatar_taxa(taxa: float | None, ic: tuple[float, float] | None, n: int) -> str:
    """Formata uma proporção sempre acompanhada de n e IC.

    Existe para que nenhuma tela consiga exibir um percentual solto: a regra do
    projeto é que todo número carrega seu denominador.
    """
    if taxa is None or ic is None:
        return f"dados insuficientes (n={n})"
    return f"{taxa:.0%} (n={n}, IC95% {ic[0]:.0%}–{ic[1]:.0%})"
