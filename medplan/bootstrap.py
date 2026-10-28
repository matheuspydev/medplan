"""Cria o banco do protótipo e popula com dados sintéticos.

    python -m medplan.bootstrap [--perfis N] [--semente S] [--forcar]

Grava em MEDPLAN_DB, se definida (a mesma variável que a API lê); senão, no banco padrão.
"""

from __future__ import annotations

import argparse
import os

from . import db, synth


def main() -> None:
    p = argparse.ArgumentParser(description="Cria o banco do protótipo MedPlan.")
    p.add_argument("--perfis", type=int, default=700)
    p.add_argument("--semente", type=int, default=42)
    p.add_argument("--forcar", action="store_true", help="recria se já existir")
    args = p.parse_args()

    caminho = os.environ.get("MEDPLAN_DB") or db.BANCO_PADRAO
    conn = db.criar_banco(caminho, sobrescrever=args.forcar)
    contagem = synth.gerar(conn, n_perfis=args.perfis, semente=args.semente)
    conn.close()

    print(f"Banco criado em {caminho}")
    for chave, valor in contagem.items():
        print(f"  {chave:12} {valor}")
    print("\nDados SINTÉTICOS. Nenhuma conclusão clínica pode sair daqui.")


if __name__ == "__main__":
    main()
