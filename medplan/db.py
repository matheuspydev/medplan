"""Conexão e carga do banco do protótipo (SQLite).

Escopo deliberadamente pequeno: a fase 0 é descartável e não precisa de ORM,
pool nem camada de migração. O modelo canônico vive em db/postgres/.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SCHEMA_SQLITE = RAIZ / "db" / "sqlite" / "schema.sql"
SEEDS = RAIZ / "db" / "seeds" / "001_referencia.sql"
BANCO_PADRAO = RAIZ / "medplan_prototipo.db"


def conectar(caminho: Path | str = BANCO_PADRAO) -> sqlite3.Connection:
    conn = sqlite3.connect(str(caminho))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def criar_banco(caminho: Path | str = BANCO_PADRAO, sobrescrever: bool = False) -> sqlite3.Connection:
    """Cria o banco a partir do schema e dos seeds de referência."""
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
    conn.commit()
    return conn


def banco_existe(caminho: Path | str = BANCO_PADRAO) -> bool:
    return Path(caminho).exists()
