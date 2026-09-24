"""Vocabulário de interface: rótulos pt-BR para os enums do schema.

Não é dado clínico. São os mesmos códigos dos CHECK de db/sqlite/schema.sql,
na mesma ordem, com o texto que a tela mostra.
"""

from __future__ import annotations

SEXO = {
    "feminino": "Feminino",
    "masculino": "Masculino",
    "intersexo": "Intersexo",
    "nao_informado": "Não informado",
}
TABAGISMO = {
    "nunca": "Nunca",
    "ex_fumante": "Ex-fumante",
    "atual": "Atual",
    "desconhecido": "Desconhecido",
}
GESTACAO_LACTACAO = {
    "nao_aplicavel": "Não se aplica",
    "nao": "Não",
    "gestante": "Gestante",
    "lactante": "Lactante",
    "desconhecido": "Desconhecido",
}
FUNCAO_ORGAO = {
    "normal": "Normal",
    "alterada": "Alterada",
    "desconhecida": "Desconhecida",
}
USO_SUBSTANCIAS = {
    "nenhum": "Nenhum",
    "alcool": "Álcool",
    "outras": "Outras",
    "multiplas": "Múltiplas",
    "desconhecido": "Desconhecido",
}
VIA = {
    "oral": "Oral",
    "intramuscular": "Intramuscular",
    "longa_acao": "Longa ação",
    "outra": "Outra",
}
GRAVIDADE = {
    "leve": "Leve",
    "moderada": "Moderada",
    "grave": "Grave",
}
# (rótulo, grupo) — grupo segue stats.py: censura, sucesso ou descontinuação.
STATUS_TRATAMENTO = {
    "em_uso": ("Em uso", "censura"),
    "concluido_sucesso": ("Concluído com resposta adequada", "sucesso"),
    "desc_reacao_adversa": ("Descontinuado por reação adversa", "descontinuacao"),
    "desc_ineficacia": ("Descontinuado por ineficácia", "descontinuacao"),
    "desc_nao_adesao": ("Descontinuado por não adesão", "descontinuacao"),
    "desc_outro": ("Descontinuado por outro motivo", "descontinuacao"),
    "perdido_seguimento": ("Perdido de seguimento", "censura"),
}
# Ordem fixa em que os motivos saem na análise.
MOTIVO_DESCONTINUACAO = {
    "desc_reacao_adversa": "Reação adversa",
    "desc_ineficacia": "Ineficácia",
    "desc_nao_adesao": "Não adesão",
    "desc_outro": "Outro motivo",
}
# Default do schema. A lista real de unidades é pergunta para a médica.
UNIDADES_DOSE = ("mg",)


def _lista(rotulos: dict[str, str]) -> list[dict]:
    return [{"codigo": c, "rotulo": r} for c, r in rotulos.items()]


def opcoes() -> dict:
    return {
        "sexo": _lista(SEXO),
        "tabagismo": _lista(TABAGISMO),
        "gestacao_lactacao": _lista(GESTACAO_LACTACAO),
        "funcao_renal": _lista(FUNCAO_ORGAO),
        "funcao_hepatica": _lista(FUNCAO_ORGAO),
        "uso_substancias": _lista(USO_SUBSTANCIAS),
        "via": _lista(VIA),
        "gravidade": _lista(GRAVIDADE),
        "status_tratamento": [
            {"codigo": c, "rotulo": r, "grupo": g}
            for c, (r, g) in STATUS_TRATAMENTO.items()
        ],
        "unidades_dose": list(UNIDADES_DOSE),
    }
