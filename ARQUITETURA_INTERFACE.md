# Arquitetura da interface web — MedPlan

Documento de arquitetura e de UX/UI da interface web da fase 0. Complementa
`arquitetura_cdss_psiquiatria.md` (produto) e `MODELO_DADOS_V2.md` (dados).

Estado: **implementado e verificado com dados sintéticos**. Nada aqui foi
validado clinicamente — isso depende da médica responsável (ver seção 9).

---

## 1. Decisões que moldam tudo

| # | Decisão | Consequência |
|---|---|---|
| 1 | React + TypeScript já na fase 0 (decisão do usuário) | Contraria a seção 4 do `CLAUDE.md`, que deixava React para depois. O `app.py` Streamlit continua intacto como tela da validação clínica. **O `CLAUDE.md` ainda não foi atualizado** — decisão pendente do usuário. |
| 2 | O motor não foi tocado | `engine.py`, `matching.py`, `stats.py` e `synth.py` estão iguais. A API só serializa o que o motor calcula. |
| 3 | O backend é a autoridade dos números | Ordem, coorte, censura, IC e **arredondamento** saem do Python. O front nunca recalcula nem arredonda — então os casos-ouro validados no motor valem para o que aparece na tela. |
| 4 | Duas telas de trabalho | **Consulta** (perfil → análise de coorte) e **Registro de caso** (perfil + tratamentos + desfecho + reações). Mais a **Metodologia**, que explica o método. |
| 5 | Só dados sintéticos | Base com 6.000 perfis gerados. SQLite sem RLS nem audit log: casos registrados na tela têm de ser fictícios, e a tela diz isso. |

---

## 2. Visão de alto nível

```
 Navegador (SPA React + TS)                FastAPI  (medplan/api.py)          Motor (intacto)
┌───────────────────────────┐   JSON    ┌──────────────────────────────┐   ┌──────────────────┐
│ /consulta   /registro     │ ────────▶ │ GET  /api/v1/referencias     │──▶│ engine.recomendar │
│ /metodologia              │           │ GET  /api/v1/base            │   │ diagnosticar_     │
│                           │ ◀──────── │ POST /api/v1/analises        │   │   escada          │
│ estado da consulta no     │           │ POST /api/v1/casos           │   │ matching / stats  │
│ fragmento da URL (#...)   │           │ GET  /api/v1/casos           │   └────────┬─────────┘
└───────────────────────────┘           │ + web/dist em "/" (SPA)      │            │
                                        │ medplan/registro.py (gravação)│            ▼
                                        └──────────────────────────────┘   SQLite sintético
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
| `medplan/registro.py` | Modelos de entrada fechados (`extra="forbid"`), regras de consistência, gravação transacional, chave pseudônima |
| `medplan/rotulos.py` | Rótulos pt-BR dos enums do schema (vocabulário de interface, não dado clínico) |

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

Registro de caso:

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
  app/          App, rotas (history API, sem biblioteca), tema (Sistema/Claro/Escuro)
  components/   Proporcao, FaixaIC, AvisoNaoPrescreve, AvisoViesIndicacao, FaixaSintetico,
                PainelMedicao, Hachura, Combobox, MultiCombobox, SegmentedControl, Stepper,
                NumberField, DateField, Field, Button, Drawer, LoadingLine, PainelFalha…
  features/
    consulta/   perfil do paciente, prévia de relaxamento, escada, critérios ignorados,
                tabela de permanência, detalhe por medicamento, sem dados suficientes
    registro/   formulário, blocos de tratamento, linha do tempo, validação, payload
    metodologia/ conteúdo (drawer com Alt+M e página /metodologia), créditos das imagens
  lib/          format (pt-BR), normalizar (busca sem acento), atalhos
  styles/       tokens.css (design system), base.css
```

Stack: React 19, TypeScript 7, Vite 8, CSS puro com custom properties, `lucide-react`,
fontes OFL auto-hospedadas (`@fontsource`). Sem Tailwind, sem kit de componentes, sem
biblioteca de gráficos — os gráficos são SVG à mão.

---

## 5. Design system

Linguagem visual inspirada nas interfaces da Apple: pouco texto, tipografia grande e limpa,
muito espaço, cartões arredondados e um único acento de cor. A primeira versão ("Retícula",
grafite e magenta, densa em rótulos) foi substituída a pedido do usuário por ser pesada de ler.

**Superfícies.** Canvas cinza-claro (`#F5F5F7`; `#000000` no escuro) com cartões brancos
(`#FFFFFF`; `#1C1C1E`) de raio 18px e sombra quase imperceptível. Navegação e cabeçalho da
leitura em vidro fosco (`backdrop-filter`). Botões em pílula; controles segmentados no estilo
iOS, com a opção escolhida em "pílula" branca.

**Cor.**

| Papel | Claro | Escuro | Onde |
|---|---|---|---|
| Texto | `#1D1D1F` / `#6E6E73` | `#F5F5F7` / `#98989D` | primário / secundário |
| Ação e acento | `#0071E3` | `#0A84FF` | botões, links, limite inferior que ordena, nível onde a escada parou |
| Desvio (âmbar) | `#8A5300` sobre `#FFF6E5` | `#FFB340` | critérios ignorados, leitura desatualizada, alertas de consistência |
| Limitação | `#3C4A5C` sobre `#EEF2F7` | `#C7D2E0` | viés de indicação, privacidade |
| Erro | `#D70015` | `#FF6961` | só validação e falha de API |

Não existe verde de "sucesso" e nenhuma cor codifica "bom" ou "ruim". O primeiro lugar da lista
não ganha destaque; a lista mostra uma ordem, não um ranking.

**Tipografia.** Fonte do sistema da Apple (SF Pro) em aparelhos Apple; Inter variável (OFL,
auto-hospedada) no resto. Números sempre tabulares. Títulos grandes com espaçamento negativo;
rótulos em frase normal, sem caixa-alta. O percentual pode ser maior que o resto da leitura, mas
sai sempre na mesma linha e no mesmo componente que o n e o IC.

**Mensagens obrigatórias, em forma curta** — nenhuma some, nenhuma fecha:

| Mensagem | Forma |
|---|---|
| Dados sintéticos | faixa fina escura fixa no topo, uma frase |
| Não é prescrição | uma linha no cabeçalho fixo da leitura e sob o botão Analisar |
| Viés de indicação | cartão azul-acinzentado com o texto literal do motor e "Saiba mais" |
| Critérios ignorados | cartão âmbar com valor informado ~~riscado~~ → valor usado, e ficha no cabeçalho |
| Dados insuficientes | pílula com textura diagonal suave, sem percentual |

**Gráfico de intervalo.** Trilho arredondado com eixo fixo 0–100%, barra do IC, ponto da
estimativa (cresce com √n) e traço azul no limite inferior quando ele é o critério de ordem.

**Cabeçalhos e rodapé.** Cada tela abre com um cabeçalho centralizado (sobretítulo azul, título
grande, uma frase). O rodapé traz as letras miúdas, como as notas legais do apple.com: apoio à
decisão, dados sintéticos e o link para a Metodologia.

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
  inferior em azul, e ao lado o gráfico de intervalo. Quando a ordem contraria a taxa pontual,
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

### Registro de caso

- Nota de privacidade fixa: sem nome, CPF, prontuário, nascimento, endereço ou texto livre;
  casos fictícios apenas neste protótipo.
- Formulário em cartões + resumo fixo com pendências clicáveis (levam ao campo) e `Ctrl+S`.
- Blocos de tratamento T1…T10, recolhíveis, com linha do tempo em SVG. Remover pede confirmação
  e deixa "Desfazer" persistente (sem temporizador — o médico é interrompido).
- Status do desfecho em rádios visíveis, agrupados: sem desfecho conhecido / encerrado /
  descontinuado. "Em uso" e "perdido" desabilitam a data fim.
- Validação espelha a do servidor: erro bloqueante com ícone e texto; alerta de consistência em
  âmbar, que não bloqueia.
- Rascunho só em memória, com aviso ao sair da página. Depois de salvar: chave pseudônima,
  resumo, alertas do servidor, "Consultar este perfil" e a lista dos casos recentes.

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

- Atualizar a seção 4 do `CLAUDE.md` para registrar React + FastAPI na fase 0.
- Alinhar `stats.formatar_taxa` ("IC95% 54%–83%") ao formato do `CLAUDE.md` ("54–83%"), que a
  interface web já usa. Só o Streamlit usa essa função.
- Estado da consulta no fragmento da URL em estação compartilhada fica no histórico do
  navegador. Alternativa: `sessionStorage`.
