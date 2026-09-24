"""Registro de caso: entrada validada e gravação numa única transação.

A entrada é fechada (`extra="forbid"`): qualquer campo não previsto — nome, CPF,
prontuário, data de nascimento, endereço, observações — é rejeitado. É defesa
estrutural contra dado identificável, não detalhe de implementação.

Mensagens de erro nunca repetem o valor recebido.
"""

from __future__ import annotations

import secrets
import sqlite3
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from . import rotulos
from .stats import STATUS_CENSURA, STATUS_DESCONTINUACAO, Episodio

# Sessão de demonstração fixa da fase 0 (sem autenticação).
HOSPITAL_ID = 1

# Mesmo recorte de diagnósticos principais do app.py.
FILTRO_DIAGNOSTICO = "grupo LIKE 'F%'"

ALFABETO_CHAVE = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
TENTATIVAS_CHAVE = 5


class Entrada(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PerfilCaso(Entrada):
    sexo: Literal[tuple(rotulos.SEXO)]
    faixa_etaria_cod: str
    cid10_principal: str
    comorbidades: list[str] = []
    # Condições clínicas sem default: a escolha tem que ser explícita.
    faixa_imc_cod: str | None
    tabagismo: Literal[tuple(rotulos.TABAGISMO)]
    gestacao_lactacao: Literal[tuple(rotulos.GESTACAO_LACTACAO)]
    funcao_renal: Literal[tuple(rotulos.FUNCAO_ORGAO)]
    funcao_hepatica: Literal[tuple(rotulos.FUNCAO_ORGAO)]
    uso_substancias: Literal[tuple(rotulos.USO_SUBSTANCIAS)]


class ReacaoCaso(Entrada):
    reacao_adversa_id: int
    dias_ate_inicio: int | None = Field(default=None, ge=0)
    gravidade_observada: Literal[tuple(rotulos.GRAVIDADE)]
    levou_descontinuacao: bool


class DesfechoCaso(Entrada):
    status: Literal[tuple(rotulos.STATUS_TRATAMENTO)]
    data_fim: date | None = None
    data_ultima_observacao: date | None = None
    efetividade_percebida: int | None = Field(default=None, ge=1, le=5)


class TratamentoCaso(Entrada):
    medicamento_id: int
    data_inicio: date
    # Só > 0: faixa de dose seria dado clínico inventado.
    dose_inicial: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    dose_manutencao: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    unidade_dose: str | None = None
    via: Literal[tuple(rotulos.VIA)]
    linha_tratamento: int | None = Field(default=None, ge=1)
    desfecho: DesfechoCaso
    reacoes: list[ReacaoCaso] = []


class CasoEntrada(Entrada):
    perfil: PerfilCaso
    tratamentos: list[TratamentoCaso] = Field(min_length=1, max_length=10)


class ErroValidacao(Exception):
    """Violação de regra de domínio; vira 422 com a lista de erros."""

    def __init__(self, erros: list[dict]):
        super().__init__("entrada inválida")
        self.erros = erros


def _item(campo: str, mensagem: str) -> dict:
    return {"campo": campo, "mensagem": mensagem}


def _existe(conn: sqlite3.Connection, sql: str, valor) -> bool:
    return conn.execute(sql, (valor,)).fetchone() is not None


def clinico_atual(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, nome, papel FROM clinico WHERE hospital_id = ? ORDER BY id LIMIT 1",
        (HOSPITAL_ID,),
    ).fetchone()


def iso_utc(criado_em: str) -> str:
    """CURRENT_TIMESTAMP do SQLite é UTC sem fuso ('AAAA-MM-DD HH:MM:SS')."""
    return datetime.fromisoformat(criado_em).replace(tzinfo=timezone.utc).isoformat()


def validar_perfil(conn: sqlite3.Connection, perfil, prefixo: str = "") -> list[dict]:
    """Códigos do perfil existem; comorbidade não repete nem é o próprio diagnóstico."""
    erros = []
    if not _existe(conn, "SELECT 1 FROM faixa_etaria WHERE codigo = ?", perfil.faixa_etaria_cod):
        erros.append(_item(prefixo + "faixa_etaria_cod",
                           "Faixa etária não encontrada no catálogo."))
    if not _existe(conn, f"SELECT 1 FROM cid10 WHERE codigo = ? AND {FILTRO_DIAGNOSTICO}",
                   perfil.cid10_principal):
        erros.append(_item(prefixo + "cid10_principal",
                           "Diagnóstico principal não encontrado entre os diagnósticos cadastrados."))
    vistas: set[str] = set()
    for i, codigo in enumerate(perfil.comorbidades):
        campo = f"{prefixo}comorbidades.{i}"
        if not _existe(conn, "SELECT 1 FROM cid10 WHERE codigo = ?", codigo):
            erros.append(_item(campo, "Código CID-10 não encontrado no catálogo."))
        elif codigo == perfil.cid10_principal:
            erros.append(_item(campo, "A comorbidade não pode ser o próprio diagnóstico principal."))
        elif codigo in vistas:
            erros.append(_item(campo, "Comorbidade repetida."))
        vistas.add(codigo)
    return erros


def validar(conn: sqlite3.Connection, caso: CasoEntrada, hoje: date) -> tuple[list[dict], list[dict]]:
    """Devolve (erros que bloqueiam, alertas que não bloqueiam)."""
    erros = validar_perfil(conn, caso.perfil, "perfil.")
    alertas: list[dict] = []

    if caso.perfil.faixa_imc_cod is not None and not _existe(
        conn, "SELECT 1 FROM faixa_imc WHERE codigo = ?", caso.perfil.faixa_imc_cod
    ):
        erros.append(_item("perfil.faixa_imc_cod", "Faixa de IMC não encontrada no catálogo."))

    for i, t in enumerate(caso.tratamentos):
        base = f"tratamentos.{i}."
        d = t.desfecho
        encerrado = d.status not in STATUS_CENSURA

        if not _existe(conn, "SELECT 1 FROM medicamento WHERE id = ?", t.medicamento_id):
            erros.append(_item(base + "medicamento_id", "Medicamento não encontrado no catálogo."))

        if t.unidade_dose is not None and t.unidade_dose not in rotulos.UNIDADES_DOSE:
            erros.append(_item(base + "unidade_dose", "Unidade de dose fora das opções permitidas."))
        elif t.unidade_dose is None and (t.dose_inicial is not None or t.dose_manutencao is not None):
            erros.append(_item(base + "unidade_dose", "Informe a unidade da dose."))

        if t.data_inicio > hoje:
            erros.append(_item(base + "data_inicio", "A data de início não pode estar no futuro."))

        campo = base + "desfecho.data_fim"
        if encerrado and d.data_fim is None:
            erros.append(_item(campo, "Informe a data de fim: obrigatória quando o tratamento "
                                      "foi encerrado ou descontinuado."))
        elif not encerrado and d.data_fim is not None:
            erros.append(_item(campo, "A data de fim não se aplica a tratamento em uso ou "
                                      "perdido de seguimento."))
        elif d.data_fim is not None and d.data_fim > hoje:
            erros.append(_item(campo, "A data de fim não pode estar no futuro."))
        elif d.data_fim is not None and d.data_fim < t.data_inicio:
            erros.append(_item(campo, "A data de fim é anterior à data de início."))

        campo = base + "desfecho.data_ultima_observacao"
        ultima = d.data_ultima_observacao
        if ultima is None and not encerrado:
            erros.append(_item(campo, "Informe a data da última observação: é o que define a censura."))
        elif ultima is not None and ultima > hoje:
            erros.append(_item(campo, "A data da última observação não pode estar no futuro."))
        elif ultima is not None and ultima < t.data_inicio:
            erros.append(_item(campo, "A data da última observação é anterior à data de início."))
        elif ultima is not None and encerrado and d.data_fim is not None and ultima < d.data_fim:
            erros.append(_item(campo, "A data da última observação é anterior à data de fim."))

        # Encerrado sem última observação: o servidor usa a data de fim.
        ultima = ultima or d.data_fim
        dias_observados = (
            Episodio(data_inicio=t.data_inicio, status=d.status,
                     data_ultima_observacao=ultima, data_fim=d.data_fim).dias_observados
            if ultima is not None else None
        )

        vistas: set[int] = set()
        for j, r in enumerate(t.reacoes):
            rbase = f"{base}reacoes.{j}."
            if not _existe(conn, "SELECT 1 FROM reacao_adversa WHERE id = ?", r.reacao_adversa_id):
                erros.append(_item(rbase + "reacao_adversa_id",
                                   "Reação adversa não encontrada no catálogo."))
            elif r.reacao_adversa_id in vistas:
                erros.append(_item(rbase + "reacao_adversa_id", "Reação repetida neste tratamento."))
            vistas.add(r.reacao_adversa_id)

            if r.levou_descontinuacao and d.status not in STATUS_DESCONTINUACAO:
                erros.append(_item(rbase + "levou_descontinuacao",
                                   "A reação foi marcada como causa de descontinuação, mas o "
                                   "status do tratamento indica que não houve descontinuação."))
            elif r.levou_descontinuacao and d.status != "desc_reacao_adversa":
                alertas.append(_item(rbase + "levou_descontinuacao",
                                     "A reação foi marcada como causa da descontinuação, mas o "
                                     "motivo registrado não é reação adversa."))

            if (r.dias_ate_inicio is not None and dias_observados is not None
                    and r.dias_ate_inicio > dias_observados):
                alertas.append(_item(rbase + "dias_ate_inicio",
                                     "Os dias até o início da reação ultrapassam o período "
                                     "observado do tratamento."))

        if d.status == "desc_reacao_adversa" and not any(r.levou_descontinuacao for r in t.reacoes):
            alertas.append(_item(base + "reacoes",
                                 "Descontinuado por reação adversa, mas nenhuma reação foi "
                                 "marcada como causa da descontinuação."))

    return erros, alertas


def gerar_chave() -> str:
    return "REG-" + "".join(secrets.choice(ALFABETO_CHAVE) for _ in range(8))


def _inserir(conn: sqlite3.Connection, tabela: str, colunas: dict) -> int:
    sql = (f"INSERT INTO {tabela} ({', '.join(colunas)}) "
           f"VALUES ({', '.join('?' for _ in colunas)})")
    return conn.execute(sql, list(colunas.values())).lastrowid


def _inserir_perfil(conn: sqlite3.Connection, perfil: PerfilCaso) -> tuple[int, str]:
    for _ in range(TENTATIVAS_CHAVE):
        chave = gerar_chave()
        try:
            perfil_id = _inserir(conn, "paciente_perfil", {
                "hospital_id": HOSPITAL_ID,
                "chave_pseudonima": chave,
                "sexo": perfil.sexo,
                "faixa_etaria_cod": perfil.faixa_etaria_cod,
                "cid10_principal": perfil.cid10_principal,
                "faixa_imc_cod": perfil.faixa_imc_cod,
                "tabagismo": perfil.tabagismo,
                "gestacao_lactacao": perfil.gestacao_lactacao,
                "funcao_renal": perfil.funcao_renal,
                "funcao_hepatica": perfil.funcao_hepatica,
                "uso_substancias": perfil.uso_substancias,
            })
            return perfil_id, chave
        except sqlite3.IntegrityError as exc:
            if "chave_pseudonima" not in str(exc):
                raise
    raise RuntimeError("não foi possível gerar chave pseudônima única")


def registrar(conn: sqlite3.Connection, caso: CasoEntrada) -> dict:
    """Grava um caso já validado. Tudo ou nada."""
    clinico_id = clinico_atual(conn)["id"]
    n_reacoes = 0

    with conn:
        perfil_id, chave = _inserir_perfil(conn, caso.perfil)

        for codigo in caso.perfil.comorbidades:
            _inserir(conn, "perfil_comorbidade", {
                "paciente_perfil_id": perfil_id,
                "hospital_id": HOSPITAL_ID,
                "cid10_codigo": codigo,
                "tipo": "psiquiatrica" if codigo.upper().startswith("F") else "clinica",
            })

        for t in caso.tratamentos:
            prescricao = {
                "hospital_id": HOSPITAL_ID,
                "paciente_perfil_id": perfil_id,
                "medicamento_id": t.medicamento_id,
                "clinico_id": clinico_id,
                "data_inicio": t.data_inicio.isoformat(),
                "dose_inicial": t.dose_inicial,
                "dose_manutencao": t.dose_manutencao,
                "via": t.via,
                "linha_tratamento": t.linha_tratamento,
            }
            if t.unidade_dose is not None:  # sem unidade, vale o default do schema
                prescricao["unidade_dose"] = t.unidade_dose
            prescricao_id = _inserir(conn, "prescricao", prescricao)

            d = t.desfecho
            desfecho_id = _inserir(conn, "desfecho_tratamento", {
                "hospital_id": HOSPITAL_ID,
                "prescricao_id": prescricao_id,
                "status": d.status,
                "data_fim": d.data_fim.isoformat() if d.data_fim else None,
                "data_ultima_observacao": (d.data_ultima_observacao or d.data_fim).isoformat(),
                "efetividade_percebida": d.efetividade_percebida,
                "registrado_por": clinico_id,
            })

            for r in t.reacoes:
                _inserir(conn, "desfecho_reacao", {
                    "desfecho_id": desfecho_id,
                    "reacao_adversa_id": r.reacao_adversa_id,
                    "dias_ate_inicio": r.dias_ate_inicio,
                    "gravidade_observada": r.gravidade_observada,
                    "levou_descontinuacao": int(r.levou_descontinuacao),
                })
                n_reacoes += 1

        criado_em = conn.execute(
            "SELECT criado_em FROM paciente_perfil WHERE id = ?", (perfil_id,)
        ).fetchone()["criado_em"]

    return {
        "id": perfil_id,
        "chave_pseudonima": chave,
        "tratamentos": len(caso.tratamentos),
        "reacoes": n_reacoes,
        "criado_em": iso_utc(criado_em),
    }
