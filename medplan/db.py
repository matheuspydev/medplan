"""Conexão e carga do banco do protótipo (SQLite).

Escopo deliberadamente pequeno: a fase 0 é descartável e não precisa de ORM,
pool nem camada de migração. O modelo canônico vive em db/postgres/.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from . import datamart

RAIZ = Path(__file__).resolve().parent.parent
SCHEMA_SQLITE = RAIZ / "db" / "sqlite" / "schema.sql"
DATAMART_SQLITE = RAIZ / "db" / "sqlite" / "datamart.sql"
CARGA_SQLITE = RAIZ / "db" / "sqlite" / "carga.sql"
SEEDS = RAIZ / "db" / "seeds" / "001_referencia.sql"
BANCO_PADRAO = RAIZ / "medplan_prototipo.db"


def conectar(caminho: Path | str = BANCO_PADRAO) -> sqlite3.Connection:
    conn = sqlite3.connect(str(caminho))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def criar_banco(caminho: Path | str = BANCO_PADRAO, sobrescrever: bool = False) -> sqlite3.Connection:
    """Cria o banco a partir do schema, dos seeds de referência e do Data Mart (dimensões já carregadas)."""
    caminho = Path(caminho)
    if caminho.exists():
        if not sobrescrever:
            raise FileExistsError(
                f"{caminho} já existe. Use sobrescrever=True para recriar."
            )
        caminho.unlink()

    conn = conectar(caminho)
    conn.executescript(SCHEMA_SQLITE.read_text(encoding="utf-8"))
    conn.executescript(SEEDS.read_text(encoding="utf-8"))
    conn.executescript(DATAMART_SQLITE.read_text(encoding="utf-8"))
    datamart.carregar_dimensoes(conn)
    garantir_tabelas_carga(conn)
    conn.commit()
    return conn


def garantir_tabelas_carga(conn: sqlite3.Connection) -> None:
    """Registro das cargas de CSV; idempotente, para valer também em banco criado antes dele."""
    conn.executescript(CARGA_SQLITE.read_text(encoding="utf-8"))


def banco_existe(caminho: Path | str = BANCO_PADRAO) -> bool:
    return Path(caminho).exists()
