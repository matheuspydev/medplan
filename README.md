# MedPlan — apoio à decisão clínica em psiquiatria

Fase 0: protótipo de validação. Serve para a médica olhar a lógica de coorte e
dizer onde ela está errada, antes de existir modelo treinado.

Projeto de extensão do curso de Sistemas de Informação (EAD) da PUC Minas, em parceria com
o Hospital Mater Dei — Unidade Contorno. Contexto, equipe e prazos em `PROJETO_ACADEMICO.md`.

- `arquitetura_cdss_psiquiatria.md` — spec do produto
- `MODELO_DADOS_V2.md` — schema revisado, com a justificativa de cada mudança
- `ARQUITETURA_INTERFACE.md` — arquitetura da interface web, design system e UX
- `CLAUDE.md` — regras de domínio e de código
- `CONTRIBUTING.md` — como rodar, testar e o que nunca pode entrar num commit
- `PROJETO_ACADEMICO.md` — o projeto de extensão da PUC Minas e o que já foi entregue

Requisitos: Python 3.11 ou mais novo (desenvolvido com 3.13) e, para a interface web,
Node 20 ou mais novo (desenvolvido com 24).

## Rodar

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Linux/macOS: .venv/bin/pip

.venv/Scripts/python -m medplan.bootstrap --perfis 6000 --forcar   # banco + dados sintéticos
.venv/Scripts/python -m streamlit run app.py
```

`--forcar` recria o banco, `--perfis N` muda o volume e `--semente S` muda o sorteio.
Use 6000 perfis: com o padrão de 700, quase todo perfil cai em "dados insuficientes" —
é o achado registrado em `MODELO_DADOS_V2.md`, não um defeito da tela.

## Testar

```bash
.venv/Scripts/python -m unittest discover -s tests -t .
```

## Interface web

React + TypeScript (Vite) sobre uma API FastAPI que reusa o motor. Duas telas:
consulta (perfil -> coorte) e registro de caso (alimenta a base). Só dados sintéticos.

```bash
cd web && npm install && cd ..                              # uma vez
.venv/Scripts/python -m medplan.bootstrap --perfis 6000 --forcar
```

Desenvolvimento, em dois terminais (o Vite repassa `/api` para a porta 8000):

```bash
.venv/Scripts/python -m uvicorn medplan.api:app --reload --port 8000
cd web && npm run dev                                       # http://localhost:5173
```

Processo único: o FastAPI serve `web/dist` em `/`, se a pasta existir na partida.

```bash
cd web && npm run build && cd ..
.venv/Scripts/python -m uvicorn medplan.api:app --port 8000   # http://127.0.0.1:8000
```

`MEDPLAN_DB` aponta para outro arquivo SQLite; o padrão é `medplan_prototipo.db`.

Testes: os do Python acima, mais `cd web && npm test`.

O `app.py` (Streamlit) continua sendo a tela da validação clínica.

## Estrutura

```
db/postgres/     DDL canônico — o modelo de referência para a fase 1
db/sqlite/       schema do protótipo, descartável, sem RLS
db/seeds/        CID-10, ATC, termos de reação adversa
medplan/
  matching.py    escada de relaxamento da coorte (puro, sem banco)
  stats.py       Wilson + retenção com censura
  engine.py      orquestra coorte -> estatística -> ranking
  synth.py       gerador de dados sintéticos
  api.py         API HTTP (FastAPI) sobre o motor; serve web/dist
  registro.py    validação e gravação do registro de caso
  rotulos.py     rótulos pt-BR dos enums do schema, para a interface
web/             interface React + TypeScript (Vite)
app.py           tela Streamlit
```

## Dois avisos que não são decorativos

**Os dados são sintéticos.** O gerador planta um confundidor de propósito: uma
"gravidade" latente que influencia tanto qual medicamento é prescrito quanto o
desfecho, e que não é gravada no banco. Isso reproduz o viés de indicação da vida
real e permite conferir se a tela deixa a limitação clara o bastante. Nenhum
número que sai daqui diz nada sobre medicamento de verdade.

**O protótipo não tem RLS nem audit log.** Ele roda em SQLite justamente porque
é descartável. Nunca aponte para dado real de paciente — para isso existe o DDL
PostgreSQL em `db/postgres/`.

## Regras que o código sustenta

- Nenhum percentual sem `n` e intervalo de confiança
- Abaixo de n=20, "dados insuficientes" em vez de número
- Paciente com seguimento curto sai do denominador, não vira sucesso
- Ranking pelo limite inferior do IC, não pela taxa pontual
- Critérios de matching relaxados aparecem na tela
- O aviso de viés de indicação é permanente, não dispensável
