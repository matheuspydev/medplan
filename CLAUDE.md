# CLAUDE.md — MedPlan (CDSS Psiquiatria)

Spec do produto: `arquitetura_cdss_psiquiatria.md`. Leia antes de qualquer implementação.

Sistema de apoio à decisão clínica: dado o perfil pseudonimizado de um paciente
psiquiátrico, mostra como pacientes de perfil semelhante toleraram cada medicação,
com a explicação do porquê.

---

## 1. Regras clínicas — inegociáveis

- **O sistema nunca prescreve.** Sugere e explica; a decisão é do médico. Disclaimer
  visível em toda tela de recomendação.
- **Nenhum número sem denominador.** Toda estatística exibida carrega `n` e intervalo
  de confiança. "82% toleraram" sozinho é proibido; o correto é
  "82% (n=134, IC95% 75–88%)".
- **n mínimo.** Abaixo do limiar definido (padrão: n=20), o sistema diz "dados
  insuficientes" — não exibe percentual.
- **Viés de indicação é declarado, não escondido.** Os dados são observacionais: se um
  remédio é prescrito preferencialmente para casos graves, ele parecerá pior tolerado.
  A recomendação reflete o padrão de prescrição da base, não eficácia causal — e a UI
  precisa dizer isso.
- **Critérios de matching relaxados aparecem na explicação.** Se a coorte precisou
  ignorar comorbidades para atingir n suficiente, o médico tem que ver isso.
- **Nunca invente dado clínico.** Sem posologia, faixa de dose, interação ou reação
  adversa vindos de "conhecimento geral" em código, fixture ou seed. Dado clínico vem
  da médica responsável ou de bula/literatura citada.

## 2. Dado sensível — inegociáveis

- Nunca persistir nome, CPF, prontuário, data de nascimento exata ou endereço. Só faixa
  etária, sexo, CID e comorbidades.
- Nenhum dado real de paciente em fixture, teste, log, seed, mensagem de erro ou commit.
  Dado de teste é sintético.
- `audit_log` é append-only: sem UPDATE, sem DELETE — nem em migration.
- Segredos em `.env` (gitignored) ou cofre. Nunca hardcoded, nunca commitado.
- Toda query que toca dado de paciente é isolada por `hospital_id` via RLS — não apenas
  por `WHERE` na aplicação.

## 3. Como escrever código aqui

Adaptado de [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) (MIT).
Viés para cautela sobre velocidade; em tarefa trivial, use bom senso.

### 3.1 Pense antes de codar
- Declare suas premissas. Se estiver incerto, pergunte.
- Havendo mais de uma interpretação, apresente-as — não escolha em silêncio.
- Se existe abordagem mais simples, diga. Discorde quando fizer sentido.
- Dúvida clínica vira pergunta para a médica, não suposição no código.

### 3.2 Simplicidade primeiro
- Código mínimo que resolve o problema. Nada especulativo.
- Sem feature não pedida, sem abstração para uso único, sem "configurabilidade" não
  solicitada, sem tratamento de erro para cenário impossível.
- Se escreveu 200 linhas e dava para fazer em 50, reescreva.
- Teste: "um engenheiro sênior diria que isso está complicado demais?" Se sim, simplifique.

### 3.3 Mudanças cirúrgicas
- Mexa só no necessário. Não "melhore" código adjacente, comentário ou formatação.
- Não refatore o que não está quebrado. Siga o estilo existente.
- Limpe os imports/variáveis que a *sua* mudança deixou órfãos — e só esses.
- Código morto pré-existente: mencione, não delete.
- Teste: toda linha alterada rastreia direto para o pedido.

### 3.4 Execução guiada por objetivo
- Transforme a tarefa em critério verificável antes de começar:
  - "adicionar validação" → "escreva testes para entradas inválidas, depois faça passar"
  - "corrigir o bug" → "escreva um teste que reproduz, depois faça passar"
- Tarefa multi-etapa: declare o plano como `1. [passo] → verifica: [checagem]`.
- **Aqui existe um segundo nível de verificação.** Teste verde não significa recomendação
  clinicamente correta. Mudança no motor de recomendação só é considerada verificada
  depois de passar nos casos-ouro: coortes de exemplo com resultado esperado validado
  pela médica responsável.

## 4. Stack — e o que ainda NÃO entra

Fase atual: **0 (protótipo de validação clínica)**.

Em uso: Python, PostgreSQL, SQL puro para análise de coorte, Streamlit no protótipo.

Fora por enquanto — adicionar só quando houver problema real que exija:
Celery/Redis, Keycloak, MLflow, XGBoost/SHAP, React, Kubernetes, microserviços.
A spec lista essas ferramentas como destino, não como ponto de partida.

## 5. Decisões em aberto (não assuma resposta)

- Desfecho: `tolerou` booleano vs. status + tempo-até-descontinuação + motivo controlado.
- Campos ausentes no modelo: dose, medicações concomitantes, tempo até a reação adversa.
- Vocabulários controlados (CID-10, ATC, MedDRA): adotar agora ou depois.
- Origem dos dados da fase 0 e situação da aprovação do CEP/Plataforma Brasil.
- Se dados de hospitais diferentes podem ser agregados para treino (impacta DPA e fase 2).
