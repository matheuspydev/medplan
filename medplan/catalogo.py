"""Adicionar medicamento à lista de referência (tabela medicamento + dim_medicamento).

Uso: um medicamento novo aparece nos atendimentos e a carga o rejeita por "código fora do
vocabulário". Código e classe vêm do Índice ATC/DDD da OMS, informados por quem cadastra:
nada aqui é dado clínico gerado pelo sistema. A classe precisa ser uma das já cadastradas.
"""

from __future__ import annotations

import re
import sqlite3

from .registro import Entrada, _item

# Nível 5 do ATC: letra, 2 dígitos, 2 letras, 2 dígitos (ex.: formato N06AB00)
FORMATO_ATC = re.compile(r"^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$")


class MedicamentoEntrada(Entrada):
    codigo_atc: str
    principio_ativo: str
    classe_terapeutica: str


def _normalizar(m: MedicamentoEntrada) -> tuple[str, str, str]:
    return m.codigo_atc.strip().upper(), " ".join(m.principio_ativo.split()).lower(), m.classe_terapeutica


def validar(conn: sqlite3.Connection, m: MedicamentoEntrada) -> list[dict]:
    atc, nome, classe = _normalizar(m)
    erros = []
    if not FORMATO_ATC.match(atc):
        erros.append(_item("codigo_atc", "Informe o código ATC completo: nível 5, 7 caracteres (letra, 2 dígitos, 2 letras, 2 dígitos)."))
    elif conn.execute("SELECT 1 FROM medicamento WHERE codigo_atc = ?", (atc,)).fetchone():
        erros.append(_item("codigo_atc", "Este código ATC já está na lista."))
    if not nome:
        erros.append(_item("principio_ativo", "Informe o princípio ativo."))
    elif len(nome) > 80:
        erros.append(_item("principio_ativo", "Use no máximo 80 caracteres."))
    elif conn.execute("SELECT 1 FROM medicamento WHERE lower(principio_ativo) = ?", (nome,)).fetchone():
        erros.append(_item("principio_ativo", "Este princípio ativo já está na lista."))
    if not conn.execute("SELECT 1 FROM medicamento WHERE classe_terapeutica = ?", (classe,)).fetchone():
        erros.append(_item("classe_terapeutica", "Escolha uma das classes da lista."))
    return erros


def adicionar(conn: sqlite3.Connection, m: MedicamentoEntrada) -> dict:
    atc, nome, classe = _normalizar(m)
    with conn:
        novo_id = conn.execute(
            "INSERT INTO medicamento (principio_ativo, codigo_atc, classe_terapeutica) VALUES (?, ?, ?)",
            (nome, atc, classe)).lastrowid
        conn.execute("INSERT OR IGNORE INTO dim_medicamento (codigo_atc, principio_ativo, classe_terapeutica) VALUES (?, ?, ?)",
                     (atc, nome, classe))
    return {"id": novo_id, "principio_ativo": nome, "codigo_atc": atc, "classe_terapeutica": classe}
