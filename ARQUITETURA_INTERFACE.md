# Arquitetura da interface web — MedPlan

Documento de arquitetura e de UX/UI da interface web da fase 0. Complementa
`arquitetura_cdss_psiquiatria.md` (produto) e `MODELO_DADOS_V2.md` (dados).

Estado: **implementado e verificado com dados sintéticos**. Nada aqui foi
validado clinicamente — isso depende da médica responsável (ver seção 9).

---

## 1. Decisões que moldam tudo

| # | Decisão | Consequência |
|---|---|---|
| 1 | React + TypeScript já na fase 0 (decisão do usuário) | Registrado na seção 4 do `CLAUDE.md`. O `app.py` Streamlit continua intacto como tela da validação clínica. |
| 2 | O motor mudou só no aprovado | A escada ganhou o degrau de faixa de IMC, que só existe quando a faixa é informada; sem IMC a consulta é idêntica à anterior (`tests/test_matching_regressao.py` congela a versão antiga e compara degrau a degrau). A API só serializa o que o motor e os painéis calculam. |
| 3 | O backend é a autoridade dos números | Ordem, coorte, censura, IC e **arredondamento** saem do Python. O front nunca recalcula nem arredonda — então os casos-ouro validados no motor valem para o que aparece na tela. |
| 4 | Telas | **Consulta** (perfil → análise de coorte) e **Registrar atendimento** (uma consulta: perfil do dia, medicamento, status, reações). Painéis sobre o Data Mart: **Visão geral**, **Pacientes** e a ficha de cada um, **Medicamentos**, **Comparar**, **Reações adversas**. **Qualidade dos dados** (carga de CSV, reconciliação, integridade). Mais a **Metodologia**. |
| 5 | Só dados sintéticos | Base com 6.000 perfis gerados. SQLite sem RLS nem audit log: casos registrados na tela têm de ser fictícios, e a tela diz isso. |

---

## 2. Visão de alto nível

```
 Navegador (SPA React + TS)                FastAPI  (medplan/api.py)          Motor (intacto)
┌───────────────────────────┐   JSON    ┌──────────────────────────────┐   ┌──────────────────┐
│ /visao-geral  /consulta   │ ────────▶ │ GET  /api/v1/referencias     │──▶│ engine.recomendar │
│ /pacientes  /paciente     │           │ GET  /api/v1/base            │   │ diagnosticar_     │
│ /registro  /medicamentos  │ ◀──────── │ POST /api/v1/analises        │   │   escada          │
│ /medicamentos/comparar    │           │ POST /api/v1/atendimentos    │   │ matching / stats  │
│ /reacoes  /qualidade      │           │ POST /api/v1/paineis/...     │   │ paineis (fatos)   │
│ estado da consulta e chave│           │ + web/dist em "/" (SPA)      │   └────────┬─────────┘
│ do paciente no fragmento  │           │ atendimento.py (gravação)    │            ▼
└───────────────────────────┘           └──────────────────────────────┘   SQLite sintético
                                                                            (medplan_prototipo.db)
```

Dois modos de rodar (comandos no `README.md`):

- **Desenvolvimento:** uvicorn `--reload` na porta 8000 + `npm run dev` (Vite repassa `/api`).
- **Processo único:** `npm run build` e o próprio FastAPI serve `web/dist`, com fallback de SPA.
  Assets inexistentes devolvem 404, não o `index.html`.

---

## 3. Backend

| Arquivo | Responsabilidade |
|---|---|
| `medplan/api.py` | Rotas, serialização da análise, substituições por nível, tratamento de erro 422, SPA |
| `medplan/registro.py` | Registro de caso (perfil + T1..T10): entrada fechada, consistência, gravação transacional |
| `medplan/atendimento.py` | Registro de atendimento (grão do Data Mart): grava o fato e mantém o modelo do motor em dia |
| `medplan/datamart.py` | Data Mart no protótipo: carga das dimensões, chaves substitutas, leitura dos fatos em tratamentos |
| `medplan/carga.py` | Carga de CSV (atendimentos + reações) pelo mesmo caminho do registro manual; registro das cargas; reconciliação e integridade |
| `medplan/catalogo.py` | Adicionar medicamento à lista de referência (`medicamento` + `dim_medicamento`) |
| `medplan/paineis.py` | Visão geral, pacientes, ficha do medicamento, reações e frequência de prescrição, a partir dos fatos |
| `medplan/rotulos.py` | Rótulos pt-BR dos enums do schema (vocabulário de interface, não dado clínico) |

**Data Mart.** `db/sqlite/datamart.sql` é o `db/postgres/010_datamart.sql` com os tipos do
SQLite: as mesmas dimensões e os dois fatos (grão = atendimento). As dimensões vêm dos
catálogos do protótipo; os fatos, do registro de atendimento e do gerador sintético. Cada
atendimento também atualiza o perfil, a prescrição e o desfecho que o motor da Consulta lê.
Convenções do protótipo, pendentes de confirmação com a médica: `tabagista` = tabagismo
"atual"; `dim_paciente.sexo` guarda a inicial dos quatro valores do banco (F, M, I, N).

**Endpoints dos painéis.** Todos são `POST` com corpo: filtros de perfil e chave do paciente
nunca vão na URL (não chegam a log de servidor nem ao histórico). Os painéis aceitam os
filtros globais em `filtros`: `sexo`, `faixa_etaria_cod`, `diagnostico` (código ou grupo),
`faixa_imc_cod`, `tabagista`, `comorbidades` (0 a 3, 3 = "3 ou mais").

| Rota | O que devolve |
|---|---|
| `POST /paineis/visao-geral` | contagens, diagnósticos e medicamentos por volume, desfecho com IC, motivos, classe prescrita por grupo (`dividir_por`), pacientes recentes |
| `POST /paineis/pacientes` | lista com busca sem acento (`q`), filtros próprios e paginação |
| `POST /paineis/paciente` | ficha por `chave_pseudonima`: atendimentos, tratamentos e reações (404 se a chave não tem atendimento) |
| `POST /paineis/medicamento` | permanência, contabilidade, curva de Kaplan-Meier com IC, quem recebe, reações, permanência por linha e quantos tratamentos estão sem linha informada |
| `POST /paineis/reacoes` | termos por SOC, gravidade, descontinuação por gravidade, dias até o início, reação × medicamento; aceita `medicamento_id` e `linha` |
| `POST /paineis/peso-por-imc` | ganho e perda de peso por faixa de IMC no início do tratamento |
| `POST /atendimentos` | registra uma consulta (chave da origem, perfil do dia, medicamento, status, reações) |
| `POST /cargas` | carga de `atendimentos.csv` (e `reacoes.csv`, opcional) como texto no corpo; devolve o resultado com o valor recusado, que não é gravado |
| `GET /qualidade`, `GET /qualidade/cargas/{id}` | histórico de cargas, integridade do Data Mart; motivos, linhas rejeitadas e reconciliação de uma carga |
| `POST /medicamentos` | adiciona à lista de referência: ATC nível 5 inédito, princípio ativo inédito, classe já cadastrada |

**Carga de CSV** (`medplan/carga.py`, `db/sqlite/carga.sql`):

- UTF-8, `;`, cabeçalho com os nomes do banco. Comorbidades por código CID (separados por
  vírgula), porque a Consulta compara por código; o Data Mart guarda a quantidade.
- Coluna fora do modelo ou obrigatória ausente: a carga inteira é recusada. Fora isso, linha a
  linha, com um motivo por linha: registro incompleto, código fora do vocabulário, data
  inconsistente, valor fora do domínio, sem atendimento correspondente, já carregado.
- Reações só se ligam a atendimentos da mesma carga (chave + data). Atendimentos são gravados
  por data, para a reação a um medicamento anterior encontrar a prescrição.
- `carga` e `carga_rejeicao` ficam fora do Data Mart e são somente de inclusão (gatilhos
  recusam UPDATE e DELETE). O valor recusado não é gravado, e o nome do arquivo só aceita
  letras sem acento, dígitos, ponto, hífen e sublinhado.
- Reconciliação: origem = o que está nos arquivos; banco = o que entrou, medido nos fatos.
  "Linhas informadas pela origem" é opcional, digitado no envio.

Toda proporção desses painéis sai de `stats.proporcao`: `n` (casos), `n_base` (denominador),
percentual e IC já arredondados; abaixo do n mínimo, só `n_base` e `suficiente: false`.

O que a API **acrescenta** ao motor, e por quê:

1. **IC por motivo de descontinuação.** O Streamlit mostrava percentual de motivo sem IC,
   o que viola a regra "nenhum número sem denominador". Agora os quatro motivos saem
   sempre, inclusive com n=0, cada um com Wilson.
2. **Percentuais já arredondados** (`pct`, `ic_inferior_pct`, `ic_superior_pct`) com o critério
   do Python, ao lado dos floats crus (usados só na geometria dos gráficos). Motivo: 1/8 vira
   12% no Python e 13% em `Math.round` do JS.
3. **Substituições por nível** — para cada critério ignorado, o valor informado e o valor usado
   ("26 a 35 anos → 18 a 50 anos"; "F31.3 → grupo F30-F39: F31.1, F31.3…"), espelhando
   `construir_consulta` e testadas contra ela. Quando o grupo CID tem um código só, a API diz
   que o nível 5 não ampliou nada.
4. **Proveniência** (`sintetico`, tamanho da base, hora do cálculo).
5. **Frequência de prescrição** na coorte (classe e medicamento, com IC), a partir dos atendimentos.

Registro de caso (`POST /casos`, `GET /casos`): continua na API e testado, mas a interface web
não o usa mais; a tela registra atendimentos. Regras:

- Entrada fechada: `nome`, `cpf`, `prontuario`, `observacoes` ou qualquer campo não previsto → 422.
- Mensagens de erro nunca repetem o valor enviado; nenhum corpo de requisição vai para log.
- Condições clínicas, via, gravidade e "levou à descontinuação" **não têm valor padrão**: a
  escolha é explícita ("desconhecido" é opção válida).
- Dose só precisa ser > 0. Não há faixa de dose — seria dado clínico inventado.
- Regras de consistência:
  - **bloqueiam:** reação marcada como causa de descontinuação com status que não é descontinuação;
    datas no futuro ou fora de ordem; data fim ausente em tratamento encerrado.
  - **só alertam:** descontinuado por reação adversa sem reação marcada como causa; reação causa
    com outro motivo de descontinuação; dias até a reação maiores que o período observado.
    Estas três estão **pendentes de validação da médica**.
- Chave pseudônima gerada no servidor: `REG-` + 8 caracteres sem ambíguos (sem 0/O, 1/I/L).

---

## 4. Frontend

```
web/src/
  api/          types.ts (espelho do contrato), client.ts, referencias.tsx (catálogos, 1 carga)
  app/          App (shell), Sidebar, BuscaRapida (Cmd/Ctrl+K), rotas (history API, sem
                biblioteca), tema e SeletorTema (Sistema/Claro/Escuro), filtros globais
                (FiltrosProvider + BarraFiltros, só na memória da sessão)
  components/   Proporcao, FaixaIC, AvisoNaoPrescreve, AvisoViesIndicacao, FaixaSintetico,
                PainelMedicao, Hachura, Combobox, MultiCombobox, SegmentedControl, Stepper,
                NumberField, DateField, Field, Button, Drawer, LoadingLine, PainelFalha,
                LeituraProporcao, BarrasHorizontais, MapaCalor, CurvaPermanencia, EstadoApi…
  features/
    consulta/   perfil do paciente, prévia de relaxamento, escada, critérios ignorados,
                tabela de permanência, detalhe por medicamento, sem dados suficientes
    registro/   Registrar atendimento: modelo (validação, corpo do POST, erros 422), bloco
                de reação, resumo lateral
    visao-geral/ pacientes/ medicamentos/ reacoes/   painéis sobre o Data Mart
    qualidade/  envio de CSV, modelo dos arquivos, histórico, reconciliação, integridade
    metodologia/ conteúdo (drawer com Alt+M e página /metodologia), créditos das imagens
  lib/          format (pt-BR), normalizar (busca sem acento), atalhos, useApi (carga com
                cancelamento), teste-paineis (apoio aos testes das telas de painel)
  styles/       tokens.css (design system), base.css
```

Stack: React 19, TypeScript 7, Vite 8, CSS puro com custom properties, `lucide-react`,
fontes OFL auto-hospedadas (`@fontsource`). Sem Tailwind, sem kit de componentes, sem
biblioteca de gráficos — os gráficos são SVG à mão.

---

## 5. Design system

Segue o canvas "MedPlan — Redesign" (https://claude.ai/artifact/2tsS2P1cHkGGe96Q74PF2Q): base
neutra de cinzas levemente frios, cartões arredondados, sombras quase imperceptíveis e um único
acento teal, que é cor de ação e marca, nunca de "bom resultado". Os valores estão em
`web/src/styles/tokens.css`, com tema claro e escuro.

**Shell.** Faixa fina fixa "Dados sintéticos — protótipo de validação"; sidebar à esquerda com
ícones e nomes (recolhível para só ícones), item "Equipe" separado por um divisor e, no rodapé,
Metodologia (Alt+M) e o seletor de tema Sistema/Claro/Escuro; barra superior com a busca rápida
(Cmd/Ctrl+K); rodapé com as letras miúdas e o link para a Metodologia.

**Superfícies.** Fundo `#F6F7F9` (`#0E1116` no escuro) com cartões `#FFFFFF` (`#151A21`) de raio
16px; controles com raio 10px.

**Cor.**

| Papel | Claro | Escuro | Onde |
|---|---|---|---|
| Texto | `#121720` / `#3F4856` / `#5C6573` | `#E8ECF1` / `#B4BCC8` / `#919BA9` | primário / secundário / n e IC |
| Ação e acento | `#0F766E` | `#14B8A6` | botões, links, item ativo, limite inferior que ordena, nível onde a escada parou |
| Desvio (âmbar) | `#7A4E00` sobre `#FCF5E6` | `#F2C46D` sobre `#251E12` | critérios ignorados, leitura desatualizada, alertas de consistência |
| Limitação | `#34445A` sobre `#EEF2F7` | `#B3C3D8` sobre `#18202C` | viés de indicação, privacidade |
| Erro | `#A8261B` sobre `#FCEDEC` | `#FF9B91` sobre `#2A1716` | só validação e falha de API |

Não existe verde de "sucesso" e nenhuma cor codifica "bom" ou "ruim". O primeiro lugar da lista
não ganha destaque; a lista mostra uma ordem, não um ranking.

**Tipografia.** Inter variável (OFL, auto-hospedada) em todos os aparelhos. Números sempre
tabulares. Títulos grandes com espaçamento negativo; rótulos em frase normal, sem caixa-alta. O
percentual pode ser maior que o resto da leitura, mas sai sempre na mesma linha e no mesmo
componente que o n e o IC.

**Mensagens obrigatórias, em forma curta** — nenhuma some, nenhuma fecha:

| Mensagem | Forma |
|---|---|
| Dados sintéticos | faixa fina escura fixa no topo, uma frase |
| Não é prescrição | uma linha no cabeçalho fixo da leitura e sob o botão Analisar |
| Viés de indicação | cartão azul-acinzentado com o texto literal do motor e "Saiba mais" |
| Critérios ignorados | cartão âmbar com valor informado ~~riscado~~ → valor usado, e ficha no cabeçalho |
| Dados insuficientes | pílula com textura diagonal suave, sem percentual |

**Gráfico de intervalo.** Trilho arredondado com eixo fixo 0–100%, barra do IC, ponto da
estimativa (cresce com √n) e traço teal no limite inferior quando ele é o critério de ordem.

**Cabeçalhos e rodapé.** Cada tela abre com o título à esquerda (32px), uma frase de apoio e, à
direita, a linha "Apoio à decisão. Não é prescrição." quando a tela tem números. O rodapé traz as
letras miúdas e o link para a Metodologia.

**Evitado de propósito.** Excesso de rótulos e legendas, caixa-alta, numeração de seções,
semáforo verde/amarelo/vermelho, animação de dados (barras e números aparecem prontos).

---

## 6. UX por tela

### Consulta e resultado

- **Cartão largo "Perfil do paciente" no topo, sempre editável**, com o resultado em largura
  total abaixo; o cabeçalho fixo da leitura tem "Editar perfil". Diagnóstico com busca sem acento
  ("f313", "bipolar"), sexo e faixa **sem pré-seleção**, comorbidades separadas em
  psiquiátricas e clínicas (a mesma divisão que a escada usa). Horizonte com presets em
  semanas; n mínimo com marca "alterado (padrão 20)".
- **Antes de analisar**, um título grande explica a tela em uma frase, e uma prévia mostra, com os
  códigos do próprio paciente, em que ordem o sistema vai afrouxar os critérios.
- **Ordem de leitura fixa:** cabeçalho fixo (CID, perfis, nível, horizonte, n mínimo, hora,
  não-prescrição) → viés → critérios ignorados → permanência → sem dados suficientes → escada.
- **Escada da coorte** como seis etapas lado a lado: perfis, maior n avaliável, medicamentos, barra
  com a marca do n mínimo e a etapa "Parou aqui" destacada; as seguintes ficam esmaecidas.
- **Lista de permanência:** `68% (n=22, IC95% 47–84%)` num único componente, com o limite
  inferior em teal, e ao lado o gráfico de intervalo. Quando a ordem contraria a taxa pontual,
  uma nota explica o porquê ("n menor", "IC mais largo").
- **Detalhe inline** por medicamento: contabilidade (retidos, descontinuados, censurados), os
  quatro motivos com IC e as reações adversas mais frequentes com IC, mediana de dias e quantas
  levaram a parar.
- **Dados insuficientes** nunca parecem resultado ruim: textura neutra, sem percentual, e a frase
  "ausência de dado não é evidência de que sejam piores". O sistema nunca sugere baixar o n mínimo.
- **Retomada após interrupção:** o estado fica no fragmento da URL (não chega a log de servidor);
  qualquer edição depois da leitura esmaece o resultado e marca "Leitura desatualizada". Nunca
  há número de um perfil ao lado de outro perfil sem essa marca. Falha de API remove o resultado.
- **Teclado:** `/` foca o CID, `Ctrl+Enter` analisa de qualquer campo, `Alt+M` abre a
  Metodologia, setas navegam a tabela.

### Painéis (Visão geral, Medicamentos, Comparar, Reações)

- Filtros globais na barra do topo, como fichas removíveis; valem para Visão geral,
  Medicamentos, Comparar e Reações e pré-preenchem a Consulta. Nas outras telas a barra diz que
  não se aplicam. Ficam só na memória da sessão.
- Toda proporção aparece com n e IC (`<LeituraProporcao>`); abaixo do n mínimo, "dados
  insuficientes (n=…)" com textura, sem percentual. Contagens absolutas são rotuladas como tal.
- Medicamentos em ordem alfabética, sem destaque. Comparar começa pelos dois mais usados do
  recorte e diz que a comparação é observacional.

### Qualidade dos dados

- "Enviar CSV": o navegador lê os arquivos e manda o texto (sem upload multipart).
- Indicadores só com o que o banco sabe: rejeição na última carga, nº de cargas, problemas de
  integridade, atendimentos na base. Contagens de linhas, sem percentual.
- Modelo dos dois CSVs com as listas de valores tiradas do catálogo e "Baixar modelo"; o
  exemplo usa os primeiros itens das listas de referência, só para mostrar o formato.
- Histórico com aceitas × rejeitadas; ao escolher uma carga, motivos, linhas rejeitadas (com o
  valor só logo após o envio) e reconciliação.
- "Adicionar medicamento" fica em Medicamentos: fonte fixa (Índice ATC/DDD da OMS), classe
  escolhida entre as cadastradas.

### Registrar atendimento

- Uma consulta por registro, em quatro cartões numerados: paciente (já registrado, pela chave
  da origem, ou primeiro atendimento, com sexo), atendimento (data, faixa etária, IMC, tabagismo
  com os quatro valores do banco, CID, comorbidades), medicamento prescrito (linha opcional,
  com "Não sabemos" para não estimar; status agrupado) e reações relatadas (termo, medicamento que causou, data ou "não soube informar",
  gravidade, se levou a parar).
- Paciente já registrado: "Copiar do atendimento anterior" traz faixa, IMC e CID (e tabagismo
  quando era fumante atual); a base guarda só a quantidade de comorbidades, então os códigos
  são escolhidos de novo. "Manter" repete o medicamento em uso com a data de início original.
  A reação pode ser de um medicamento anterior do paciente.
- Resumo lateral: o que está sendo registrado, o que falta preencher (links que focam o
  campo), a trajetória do paciente e a nota de privacidade (pacientes fictícios neste protótipo).
- Erros nos campos depois de tentar salvar (`Ctrl+S`); os 422 do servidor vão para o campo.
  Rascunho só em memória. Depois de salvar, abre a ficha do paciente.

### Metodologia

Drawer (`Alt+M`) e página própria, com o mesmo conteúdo, tirado do código real: escada de seis
níveis, conjunto exato de comorbidades no nível 0, regra de censura, Wilson, ordenação pelo
limite inferior, viés de indicação (texto literal do motor), o que o protótipo é e não é, e
créditos das imagens. É a **única tela com fotografia**.

### Imagens

Uma foto ao lado de uma lista de medicamentos pareceria endosso. Por isso as imagens mostram a
ideia de medição, nunca pessoas, comprimidos ou cérebros, e ficam só na Metodologia, em cor
natural recortada (a versão do tema escuro tem brilho reduzido):

| Imagem | Autor | Fonte | Licença |
|---|---|---|---|
| Escala de paquímetro (macro) | Bozhin Karaivanov | [Unsplash](https://unsplash.com/photos/AgxK4Ohn1Cw) | [Licença Unsplash](https://unsplash.com/license) |
| Corredor hospitalar vazio | Renata Rafa | [Pexels](https://www.pexels.com/photo/bright-hospital-corridor-with-windows-37036967/) | [Licença Pexels](https://www.pexels.com/license/) |

Créditos visíveis sob cada imagem e registrados em `web/src/assets/creditos.json`.

---

## 7. Como as regras do `CLAUDE.md` são garantidas

| Regra | Mecanismo | Verificado por |
|---|---|---|
| Nunca prescreve | `AvisoNaoPrescreve` no cabeçalho fixo de toda leitura; lista em ordem, sem destaque do 1º | testes de página |
| Nenhum número sem n e IC | `<Proporcao>` é o único componente que imprime "%" e não aceita percentual sem n e IC | `guard.test.ts` falha o build se "%" formatado aparecer em outro arquivo; teste do contrato na API |
| n mínimo | "dados insuficientes (n=12)" sem nenhum dígito de percentual no DOM nem no `aria-label`; seção 03 da API não tem campo de taxa | `Proporcao.test.tsx`, `test_api.py` |
| Viés de indicação declarado | banda permanente com o texto literal do motor | teste compara o texto com `engine.py` |
| Relaxamento na explicação | cartão de critérios ignorados, ficha no cabeçalho fixo, linhas âmbar sob os campos, etapa "Parou aqui" | substituições testadas contra `construir_consulta`; prévia testada contra a API |
| Nunca inventar dado clínico | dose sem faixa/placeholder, escala de efetividade sem âncoras, gravidade não pré-preenchida | revisão; testes do payload |
| Sem PII | modelos fechados; nenhum campo identificável ou de texto livre; erros não ecoam valores | `test_registro.py` (injeção de `nome`, `cpf`, `observacoes` → 422) |
| Isolamento por hospital | a UI nunca envia `hospital_id`; vem da sessão no servidor | — **RLS só existe no Postgres (fase 1)** |
| Casos-ouro | a UI não recalcula nada, então os casos-ouro do motor valem para a tela | — **casos-ouro clínicos ainda não existem** |

Verificação atual: 47 testes Python, 117 testes do front, build de produção e checagem do
contrato contra o JSON real de 5 perfis (incluindo o estado "dados insuficientes").

---

## 8. Caminho até a fase 1

Em ordem de dependência. Nada disso está implementado.

1. **Casos-ouro clínicos** com a médica: coortes de exemplo com a ordem esperada. Sem isso, a
   lógica de recomendação não está verificada no sentido do `CLAUDE.md` 3.4.
2. **Postgres + RLS** a partir do DDL canônico (`db/postgres/`). O `hospital_id` passa a vir da
   sessão autenticada via `SET app.hospital_id`, nunca do cliente.
3. **Autenticação** (OIDC; Keycloak é a recomendação da spec) com papéis médico, admin e
   pesquisador; MFA para admin.
4. **Audit log** como middleware: toda leitura de análise e todo registro de caso viram uma linha
   append-only. A UI não ganha nenhuma ação de editar ou excluir.
5. **Registro do que foi exibido vs. o que foi prescrito** — a tabela proposta em
   `MODELO_DADOS_V2.md`. Na UI, entra no fluxo depois da consulta.
6. **Chave pseudônima fornecida pelo hospital.** Hoje é gerada pelo servidor; o hospital precisa
   manter a ponte com a identidade real, e o formato vem de lá.
7. **Acabamento que ficou de fora:** impressão com a faixa sintética em toda página, layout em
   blocos abaixo de 768px, teste de contraste dos tokens no CI.

---

## 9. Perguntas em aberto

**Para a médica responsável**

- Lista de unidades de dose (hoje só `mg`).
- Âncoras da escala de efetividade 1–5 (hoje sem rótulo).
- As três regras de consistência que só alertam: deveriam bloquear, alertar ou sumir?
- O diagnóstico principal pode aparecer também como comorbidade? (hoje é bloqueado)
- Diagnósticos sem nenhum perfil na base (F10.2, F17.2) devem aparecer na busca da Consulta?
- Gestação/lactação deve reagir ao sexo informado? (hoje não reage, de propósito)

**Para o usuário / DPO**

- Alinhar `stats.formatar_taxa` ("IC95% 54%–83%") ao formato do `CLAUDE.md` ("54–83%"), que a
  interface web já usa. Só o Streamlit usa essa função.
- Estado da consulta no fragmento da URL em estação compartilhada fica no histórico do
  navegador. Alternativa: `sessionStorage`.
