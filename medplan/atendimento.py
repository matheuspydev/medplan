"""Registro de atendimento: o grão do Data Mart (uma consulta de um paciente).

Cada atendimento grava, numa única transação:

1. uma linha em fato_atendimento e uma por reação relatada em fato_reacao_adversa
   (o modelo do documento);
2. o efeito no modelo que o motor da Consulta lê, para que o atendimento conte nas
   próximas análises:
   - paciente_perfil com os valores mais recentes (faixa, IMC, tabagismo, CID, comorbidades);
   - a prescrição (paciente + medicamento + data de início), criada no primeiro atendimento;
   - o desfecho_tratamento da prescrição com o status desta consulta, se ela não for
     anterior à última observação já registrada;
   - desfecho_reacao na prescrição do medicamento que causou a reação.

A entrada é fechada (`extra="forbid"`), como no registro de caso: nada de nome, CPF,
prontuário, nascimento ou texto livre. Mensagens de erro nunca repetem o valor recebido.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date
from typing import Literal

from pydantic import Field

from . import datamart, rotulos
from .registro import HOSPITAL_ID, Entrada, _existe, _inserir, _item, clinico_atual, validar_perfil
from .stats import STATUS_CENSURA

# A chave vem da origem (exportação do hospital). Só letras maiúsculas, dígitos e hífen.
FORMATO_CHAVE = re.compile(r"^[A-Z0-9][A-Z0-9-]{3,31}$")


class PacienteAtendimento(Entrada):
    chave_pseudonima: str
    # Obrigatório só no primeiro atendimento do paciente.
    sexo: Literal[tuple(rotulos.SEXO)] | None = None


class ReacaoAtendimento(Entrada):
    reacao_adversa_id: int
    # Medicamento que causou a reação: pode ser o anterior ao prescrito nesta consulta.
    medicamento_id: int
    data_inicio_medicamento: date
    data_inicio_reacao: date | None = None
    gravidade_observada: Literal[tuple(rotulos.GRAVIDADE)]
    levou_descontinuacao: bool


class AtendimentoEntrada(Entrada):
    paciente: PacienteAtendimento
    data_atendimento: date
    faixa_etaria_cod: str
    faixa_imc_cod: str | None
    tabagismo: Literal[tuple(rotulos.TABAGISMO)]
    cid10_principal: str
    # Códigos CID-10: o motor compara comorbidades por código; o fato guarda só a quantidade.
    comorbidades: list[str] = []
    medicamento_id: int
    data_inicio_medicamento: date
    linha_tratamento: int | None = Field(default=None, ge=1)
    status: Literal[tuple(rotulos.STATUS_TRATAMENTO)]
    reacoes: list[ReacaoAtendimento] = Field(default=[], max_length=20)


def _perfil(conn: sqlite3.Connection, chave: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, sexo FROM paciente_perfil WHERE hospital_id = ? AND chave_pseudonima = ?",
        (HOSPITAL_ID, chave),
    ).fetchone()


def _prescricao(conn: sqlite3.Connection, perfil_id: int, medicamento_id: int, inicio: date) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT pr.id, d.id AS desfecho_id, d.data_ultima_observacao FROM prescricao pr"
        "  LEFT JOIN desfecho_tratamento d ON d.prescricao_id = pr.id"
        " WHERE pr.hospital_id = ? AND pr.paciente_perfil_id = ? AND pr.medicamento_id = ? AND pr.data_inicio = ?",
        (HOSPITAL_ID, perfil_id, medicamento_id, inicio.isoformat()),
    ).fetchone()


def validar(conn: sqlite3.Connection, a: AtendimentoEntrada, hoje: date) -> list[dict]:
    """Erros que bloqueiam o registro."""
    erros = validar_perfil(conn, a)
    chave = a.paciente.chave_pseudonima
    perfil = None
    if not FORMATO_CHAVE.match(chave):
        erros.append(_item("paciente.chave_pseudonima",
                           "Use a chave da exportação: 4 a 32 caracteres, letras maiúsculas, dígitos e hífen."))
    else:
        perfil = _perfil(conn, chave)
        if perfil is None and a.paciente.sexo is None:
            erros.append(_item("paciente.sexo", "Informe o sexo: é o primeiro atendimento deste paciente."))
        elif perfil is not None and a.paciente.sexo is not None and a.paciente.sexo != perfil["sexo"]:
            erros.append(_item("paciente.sexo", "O sexo informado é diferente do já registrado para esta chave."))

    if a.faixa_imc_cod is not None and not _existe(conn, "SELECT 1 FROM faixa_imc WHERE codigo = ?", a.faixa_imc_cod):
        erros.append(_item("faixa_imc_cod", "Faixa de IMC não encontrada no catálogo."))
    if not _existe(conn, "SELECT 1 FROM medicamento WHERE id = ?", a.medicamento_id):
        erros.append(_item("medicamento_id", "Medicamento não encontrado no catálogo."))
    if a.data_atendimento > hoje:
        erros.append(_item("data_atendimento", "A data do atendimento não pode estar no futuro."))
    if a.data_inicio_medicamento > a.data_atendimento:
        erros.append(_item("data_inicio_medicamento", "O início do medicamento não pode ser depois do atendimento."))

    vistas: set[tuple[int, int]] = set()
    for i, r in enumerate(a.reacoes):
        base = f"reacoes.{i}."
        if not _existe(conn, "SELECT 1 FROM reacao_adversa WHERE id = ?", r.reacao_adversa_id):
            erros.append(_item(base + "reacao_adversa_id", "Reação adversa não encontrada no catálogo."))
        if (r.reacao_adversa_id, r.medicamento_id) in vistas:
            erros.append(_item(base + "reacao_adversa_id", "Reação repetida para o mesmo medicamento."))
        vistas.add((r.reacao_adversa_id, r.medicamento_id))
        if r.data_inicio_medicamento > a.data_atendimento:
            erros.append(_item(base + "data_inicio_medicamento", "O início do medicamento não pode ser depois do atendimento."))
        if r.data_inicio_reacao is not None and not (r.data_inicio_medicamento <= r.data_inicio_reacao <= a.data_atendimento):
            erros.append(_item(base + "data_inicio_reacao",
                               "A reação tem de começar entre o início do medicamento e o atendimento."))
        causador_e_este = (r.medicamento_id, r.data_inicio_medicamento) == (a.medicamento_id, a.data_inicio_medicamento)
        if not causador_e_este and (perfil is None or _prescricao(conn, perfil["id"], r.medicamento_id, r.data_inicio_medicamento) is None):
            erros.append(_item(base + "medicamento_id",
                               "O medicamento que causou a reação precisa ter sido registrado em um atendimento anterior, "
                               "com a mesma data de início."))
    return erros


def registrar(conn: sqlite3.Connection, a: AtendimentoEntrada) -> dict:
    """Grava um atendimento já validado. Tudo ou nada."""
    clinico_id = clinico_atual(conn)["id"]
    encerrado = a.status not in STATUS_CENSURA
    chave = a.paciente.chave_pseudonima

    with conn:
        perfil = _perfil(conn, chave)
        valores = {
            "faixa_etaria_cod": a.faixa_etaria_cod,
            "cid10_principal": a.cid10_principal,
            "faixa_imc_cod": a.faixa_imc_cod,
            "tabagismo": a.tabagismo,
        }
        if perfil is None:
            perfil_id = _inserir(conn, "paciente_perfil", {
                "hospital_id": HOSPITAL_ID, "chave_pseudonima": chave, "sexo": a.paciente.sexo, **valores})
            sexo = a.paciente.sexo
        else:
            perfil_id, sexo = perfil["id"], perfil["sexo"]
            conn.execute(
                "UPDATE paciente_perfil SET faixa_etaria_cod = ?, cid10_principal = ?, faixa_imc_cod = ?, tabagismo = ?"
                " WHERE id = ?", (*valores.values(), perfil_id))
            conn.execute("DELETE FROM perfil_comorbidade WHERE paciente_perfil_id = ?", (perfil_id,))
        for codigo in a.comorbidades:
            _inserir(conn, "perfil_comorbidade", {
                "paciente_perfil_id": perfil_id, "hospital_id": HOSPITAL_ID, "cid10_codigo": codigo,
                "tipo": "psiquiatrica" if codigo.upper().startswith("F") else "clinica"})

        # --- prescrição e desfecho (o que o motor lê) --------------------------------
        prescricao = _prescricao(conn, perfil_id, a.medicamento_id, a.data_inicio_medicamento)
        if prescricao is None:
            prescricao_id = _inserir(conn, "prescricao", {
                "hospital_id": HOSPITAL_ID, "paciente_perfil_id": perfil_id, "medicamento_id": a.medicamento_id,
                "clinico_id": clinico_id, "data_inicio": a.data_inicio_medicamento.isoformat(),
                "linha_tratamento": a.linha_tratamento})
            desfecho_id, ultima = None, None
        else:
            prescricao_id, desfecho_id = prescricao["id"], prescricao["desfecho_id"]
            ultima = date.fromisoformat(prescricao["data_ultima_observacao"]) if prescricao["data_ultima_observacao"] else None
            if a.linha_tratamento is not None:
                conn.execute("UPDATE prescricao SET linha_tratamento = ? WHERE id = ? AND linha_tratamento IS NULL",
                             (a.linha_tratamento, prescricao_id))

        desfecho = {"status": a.status, "data_fim": a.data_atendimento.isoformat() if encerrado else None,
                    "data_ultima_observacao": a.data_atendimento.isoformat()}
        if desfecho_id is None:
            desfecho_id = _inserir(conn, "desfecho_tratamento", {
                "hospital_id": HOSPITAL_ID, "prescricao_id": prescricao_id, "registrado_por": clinico_id, **desfecho})
        elif ultima is None or a.data_atendimento >= ultima:
            # uma consulta anterior à última observação entra no Data Mart, mas não volta o desfecho no tempo
            conn.execute("UPDATE desfecho_tratamento SET status = ?, data_fim = ?, data_ultima_observacao = ? WHERE id = ?",
                         (*desfecho.values(), desfecho_id))

        # --- fato_atendimento ----------------------------------------------------------
        sk_med = datamart.sk_medicamento(conn, a.medicamento_id)
        sk_atendimento = _inserir(conn, "fato_atendimento", {
            "sk_paciente": datamart.sk_paciente(conn, chave, sexo),
            "sk_faixa_etaria": datamart.sk_faixa_etaria(conn, a.faixa_etaria_cod),
            "sk_faixa_imc": datamart.sk_faixa_imc(conn, a.faixa_imc_cod),
            "sk_cid_principal": datamart.sk_cid(conn, a.cid10_principal),
            "sk_medicamento": sk_med,
            "sk_status": datamart.sk_status(conn, a.status),
            "sk_tempo": datamart.sk_tempo(conn, a.data_atendimento),
            "tabagista": int(datamart.tabagista(a.tabagismo)),
            "qtd_comorbidades": len(a.comorbidades),
            "linha_tratamento": a.linha_tratamento,
            "dias_observados": (a.data_atendimento - a.data_inicio_medicamento).days,
            "qtd_reacoes": len(a.reacoes),
        })

        # --- reações -----------------------------------------------------------------
        for r in a.reacoes:
            dias = (r.data_inicio_reacao - r.data_inicio_medicamento).days if r.data_inicio_reacao else None
            _inserir(conn, "fato_reacao_adversa", {
                "sk_atendimento": sk_atendimento,
                "sk_reacao": datamart.sk_reacao(conn, r.reacao_adversa_id),
                "sk_medicamento": datamart.sk_medicamento(conn, r.medicamento_id),
                "sk_tempo_inicio_medicamento": datamart.sk_tempo(conn, r.data_inicio_medicamento),
                "sk_tempo_inicio_reacao": datamart.sk_tempo(conn, r.data_inicio_reacao),
                "dias_ate_reacao": dias,
                "gravidade_observada": r.gravidade_observada,
                "levou_descontinuacao": int(r.levou_descontinuacao),
            })
            causador = _prescricao(conn, perfil_id, r.medicamento_id, r.data_inicio_medicamento)
            conn.execute(
                "INSERT OR IGNORE INTO desfecho_reacao (desfecho_id, reacao_adversa_id, dias_ate_inicio,"
                " gravidade_observada, levou_descontinuacao) VALUES (?, ?, ?, ?, ?)",
                (causador["desfecho_id"], r.reacao_adversa_id, dias, r.gravidade_observada, int(r.levou_descontinuacao)),
            )

        n_atendimentos = conn.execute(
            "SELECT COUNT(*) FROM fato_atendimento a JOIN dim_paciente p ON p.sk_paciente = a.sk_paciente"
            " WHERE p.codigo_pseudonimo = ?", (chave,)).fetchone()[0]

    return {"chave_pseudonima": chave, "sk_atendimento": sk_atendimento, "prescricao_id": prescricao_id,
            "n_atendimentos_paciente": n_atendimentos, "primeiro_atendimento": perfil is None}
