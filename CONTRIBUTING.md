# Como contribuir

Leia antes do primeiro commit. As regras completas estão no `CLAUDE.md`; aqui está o
mínimo que não pode ser violado, e como rodar o projeto.

## Três regras que não são negociáveis

1. **Nenhum dado real de paciente.** Em lugar nenhum: nem em teste, nem em fixture, nem
   em log, nem em mensagem de erro, nem em commit. O protótipo roda em SQLite, sem
   isolamento por hospital e sem trilha de auditoria — por isso a tela de registro aceita
   só casos fictícios. Dado real só na fase 1, com PostgreSQL, RLS e `audit_log`.
2. **Nunca commitar o banco.** `medplan_prototipo.db` é gerado por quem clona, com o
   bootstrap. O `.gitignore` já bloqueia `*.db`; não force a entrada dele.
3. **Nenhum percentual sem `n` e intervalo de confiança.** Abaixo do n mínimo a tela
   escreve "dados insuficientes" e não mostra número. No front, só o componente
   `<Proporcao>` imprime "%": há um teste que quebra o build se outro arquivo fizer isso.

Some-se a elas: **não invente dado clínico**. Nada de posologia, faixa de dose, interação
ou reação adversa vindos de conhecimento geral. Dado clínico vem da médica responsável ou
de bula e literatura citada.

## Rodar

Requisitos: **Python 3.11 ou mais novo** (desenvolvido com 3.13) e **Node 20 ou mais novo**
(desenvolvido com 24).

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Linux/macOS: .venv/bin/pip

# Banco de demonstração. Use 6000 perfis: com o padrão de 700 quase todo perfil cai em
# "dados insuficientes", e parece que a tela está quebrada.
.venv/Scripts/python -m medplan.bootstrap --perfis 6000 --forcar

cd web && npm install && cd ..
cd web && npm run build && cd ..
.venv/Scripts/python -m uvicorn medplan.api:app --port 8000   # http://127.0.0.1:8000
```

Durante o desenvolvimento do front, em dois terminais:

```bash
.venv/Scripts/python -m uvicorn medplan.api:app --reload --port 8000
cd web && npm run dev
```

## Testar antes de abrir o pull request

```bash
.venv/Scripts/python -m unittest discover -s tests -t .   # motor e API
cd web && npm test && npm run build                       # interface
```

O CI roda os três a cada pull request. Teste verde, porém, não quer dizer recomendação
clinicamente correta: mudança no motor de recomendação só é considerada verificada depois
de passar nos casos-ouro validados pela médica responsável — que ainda não existem
(ver `ARQUITETURA_INTERFACE.md`, seção 8).

## Onde fica cada coisa

| Pasta | O que é |
|---|---|
| `medplan/` | motor de coorte (`matching`, `stats`, `engine`), API (`api`, `registro`), gerador sintético |
| `web/` | interface React + TypeScript |
| `db/postgres/` | schema canônico da fase 1, com RLS e audit log |
| `db/sqlite/` + `db/seeds/` | schema descartável do protótipo e vocabulários (CID-10, ATC, termos de reação) |
| `tests/` | testes do motor, da API e do registro |

Documentos: `README.md` (rodar), `CLAUDE.md` (regras), `arquitetura_cdss_psiquiatria.md`
(produto), `MODELO_DADOS_V2.md` (modelo de dados), `ARQUITETURA_INTERFACE.md` (interface).

## Estilo

- Mudança cirúrgica: mexa só no necessário e siga o estilo do arquivo.
- Comentário explica **por que**, não o que a linha faz.
- Dúvida clínica vira pergunta para a médica responsável, não suposição no código.
