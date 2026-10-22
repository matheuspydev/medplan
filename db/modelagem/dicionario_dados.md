# Dicionário de dados — Data Mart MedPlan

Acompanha `db/modelagem/datamart.dbml` (diagrama) e `db/postgres/010_datamart.sql` (DDL).
Para o apêndice da Etapa 5 — Projeto de Data Warehouse / Data Mart.

## Visão geral

Modelo dimensional em **constelação de fatos**: dois fatos — `fato_atendimento` e
`fato_reacao_adversa` — e oito dimensões compartilhadas entre eles. Cardinalidade sempre
**N no fato, 1 na dimensão**.

| Tabela | Tipo | Classe de metadado | Grão (uma linha = …) |
|---|---|---|---|
| `fato_atendimento` | Fato | Dado mestre (transacional) | um atendimento (consulta) de um paciente |
| `fato_reacao_adversa` | Fato | Dado mestre (transacional) | uma reação adversa relatada em um atendimento |
| `dim_paciente` | Dimensão | Dado mestre | um paciente pseudonimizado |
| `dim_faixa_etaria` | Dimensão | Dado de referência | uma faixa etária |
| `dim_faixa_imc` | Dimensão | Dado de referência | uma faixa de IMC |
| `dim_cid10` | Dimensão | Dado de referência | um código CID-10 |
| `dim_medicamento` | Dimensão | Dado de referência | um princípio ativo (código ATC) |
| `dim_reacao_adversa` | Dimensão | Dado de referência | um termo de reação adversa (MedDRA) |
| `dim_status` | Dimensão | Dado de referência | um status de tratamento |
| `dim_tempo` | Dimensão | Dado de referência | um dia do calendário |

**Regras gerais**

- Toda dimensão tem chave substituta (`sk_*`) inteira e autoincremento, sem significado
  de negócio. O código de mercado (CID, ATC, MedDRA) fica em coluna própria. A exceção é
  `dim_tempo`, cuja chave é a própria data no formato `aaaammdd`.
- Na carga, o fato chega com o código de mercado (ex.: `F20`) e o script faz o
  **de-para** para a `sk` da dimensão. No fato ficam só as `sk`.
- Chave estrangeira em fato nunca é nula. Valor desconhecido vira a linha
  "não informado" da dimensão.
- As dimensões de referência são filtradas na carga: entram apenas os CIDs, medicamentos
  e reações relevantes ao atendimento psiquiátrico, não as tabelas completas.
- Dado sensível: nenhum nome, CPF, prontuário, data de nascimento exata ou endereço é
  armazenado. O paciente é identificado só por um código pseudônimo.

---

## Fatos

### `fato_atendimento`

Registra cada atendimento (consulta). O paciente aparece em uma linha por consulta.
Assim é possível contar quantas consultas ele teve e acompanhar as trocas de medicamento
ao longo do tratamento.

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_atendimento` | integer | não | PK | Identificador do atendimento (autoincremento). | 1, 2, 3… |
| `sk_paciente` | integer | não | FK → `dim_paciente` | Paciente atendido. | — |
| `sk_faixa_etaria` | integer | não | FK → `dim_faixa_etaria` | Faixa etária do paciente **na data do atendimento**. Fica no fato porque muda com o tempo. | — |
| `sk_faixa_imc` | integer | não | FK → `dim_faixa_imc` | Faixa de IMC do paciente na data do atendimento. | — |
| `sk_cid_principal` | integer | não | FK → `dim_cid10` | Diagnóstico psiquiátrico principal do atendimento. | — |
| `sk_medicamento` | integer | não | FK → `dim_medicamento` | Medicamento prescrito (ou mantido) neste atendimento. | — |
| `sk_status` | integer | não | FK → `dim_status` | Situação do tratamento na data do atendimento. | — |
| `sk_tempo` | integer | não | FK → `dim_tempo` | Data do atendimento. | 20260315 |
| `tabagista` | boolean | não | — | Se o paciente fuma. *Pendente: confirmar com a médica se o dado é binário.* | true / false |
| `qtd_comorbidades` | smallint | não | — | Quantidade de comorbidades registradas no atendimento. | 0, 1, 2… |
| `linha_tratamento` | smallint | sim | — | Ordem da tentativa terapêutica: 1 = primeiro medicamento tentado para o paciente, 2 = segunda tentativa, e assim por diante. *Pendente: confirmar o limite com a médica.* | 1, 2, 3 |
| `dias_observados` | integer | não | — | Dias desde o início do medicamento até este atendimento. Com o status, permite classificar o tratamento como mantido, descontinuado ou censurado em qualquer horizonte, que é escolhido na consulta. | 0, 30, 84… |
| `qtd_reacoes` | smallint | não | — | Quantidade de reações adversas relatadas neste atendimento. Corresponde ao número de linhas ligadas em `fato_reacao_adversa`. | 0, 1, 2… |

### `fato_reacao_adversa`

Cada reação adversa relatada em um atendimento. Um atendimento pode gerar várias
reações. A reação pode se referir a um medicamento anterior ao prescrito naquele dia,
por exemplo quando a consulta troca o remédio por causa da reação.

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_reacao_fato` | integer | não | PK | Identificador do registro (autoincremento). | 1, 2, 3… |
| `sk_atendimento` | integer | não | FK → `fato_atendimento` | Atendimento em que a reação foi relatada. | — |
| `sk_reacao` | integer | não | FK → `dim_reacao_adversa` | Reação sofrida. | — |
| `sk_medicamento` | integer | não | FK → `dim_medicamento` | Medicamento que causou a reação. Não é necessariamente o prescrito no atendimento. | — |
| `sk_tempo_inicio_medicamento` | integer | não | FK → `dim_tempo` | Data em que o paciente começou a tomar o medicamento. | 20260301 |
| `sk_tempo_inicio_reacao` | integer | não | FK → `dim_tempo` | Data em que a reação começou. Se o paciente não souber informar, aponta para a linha "não informado" da `dim_tempo`. | 20260308 |
| `dias_ate_reacao` | integer | sim | — | Dias entre o início do medicamento e o início da reação, calculado na carga. Nulo quando a data da reação não é conhecida. | 7 |
| `gravidade_observada` | varchar | não | — | Gravidade da reação **neste paciente**. Pode diferir da gravidade padrão do termo. *Pendente: escala a definir com a médica.* | — |
| `levou_descontinuacao` | boolean | não | — | Se a reação levou à suspensão do medicamento. | true / false |

---

## Dimensões

### `dim_paciente`

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_paciente` | integer | não | PK | Chave substituta (autoincremento). | 1, 2, 3… |
| `codigo_pseudonimo` | varchar | não | único | Código que identifica o paciente sem revelar quem ele é, gerado na origem. Não é nome, CPF nem prontuário. | `PAC-000123` |
| `sexo` | char(1) | não | — | Sexo biológico. | `F`, `M` |

### `dim_faixa_etaria`

Faixas fixas, tiradas de órgão oficial. *Pendente: definir a fonte (IBGE ou Ministério da
Saúde).*

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_faixa_etaria` | integer | não | PK | Chave substituta (autoincremento). | — |
| `descricao` | varchar | não | — | Rótulo da faixa. | `18 a 24 anos` |
| `idade_min` | smallint | sim | — | Idade inicial da faixa, inclusive. Nula só na linha "não informado". | 18 |
| `idade_max` | smallint | sim | — | Idade final da faixa, inclusive. Nula na última faixa (aberta). | 24 |

### `dim_faixa_imc`

Classificação do Índice de Massa Corporal (IMC = peso ÷ altura²) segundo a OMS.
Os valores de corte entram no seed com a referência citada.

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_faixa_imc` | integer | não | PK | Chave substituta (autoincremento). | — |
| `descricao` | varchar | não | — | Nome da classe de IMC. | `Não informado` |
| `imc_min` | numeric(4,1) | sim | — | Limite inferior da faixa, em kg/m². Nulo na primeira faixa. | — |
| `imc_max` | numeric(4,1) | sim | — | Limite superior da faixa, em kg/m². Nulo na última faixa. | — |

### `dim_cid10`

Classificação Internacional de Doenças, 10ª revisão (OMS; tabela publicada pelo DATASUS
/ Ministério da Saúde). A CID é uma árvore: capítulo → grupo → categoria → subcategoria.

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_cid` | integer | não | PK | Chave substituta (autoincremento). | — |
| `codigo` | varchar | não | único | Código CID-10, padrão de mercado. | `F20` |
| `descricao` | varchar | não | — | Nome da doença. | `Esquizofrenia` |
| `grupo` | varchar | não | — | Faixa de códigos do grupo a que o código pertence. | `F20-F29` |
| `tipo` | varchar | não | — | Se o CID é psiquiátrico (capítulo V, códigos F) ou clínico. | `psiquiatrica`, `clinica` |

### `dim_medicamento`

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_medicamento` | integer | não | PK | Chave substituta (autoincremento). | — |
| `codigo_atc` | varchar | não | único | Código ATC (*Anatomical Therapeutic Chemical*, OMS) do princípio ativo, padrão de mercado. | `N06AB06` |
| `principio_ativo` | varchar | não | — | Substância ativa, sem marca comercial. | `Sertralina` |
| `classe_terapeutica` | varchar | não | — | Grupo farmacológico, conforme o nível do ATC. | `Inibidores seletivos da recaptação de serotonina` |

### `dim_reacao_adversa`

Termos de reação adversa segundo o MedDRA (*Medical Dictionary for Regulatory
Activities*), dicionário internacional usado em farmacovigilância.

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_reacao` | integer | não | PK | Chave substituta (autoincremento). | — |
| `termo` | varchar | não | — | Nome da reação (*Preferred Term* do MedDRA). É o **efeito** sentido pelo paciente, não o medicamento. | `Náusea` |
| `soc` | varchar | não | — | *System Organ Class*: sistema do corpo **onde a reação se manifesta**, o nível mais alto da hierarquia MedDRA. Agrupa termos: náusea e diarreia caem no mesmo SOC. | `Gastrointestinal disorders` |
| `gravidade_padrao` | varchar | não | — | Gravidade usual do termo, independente do paciente. *Pendente: escala a definir com a médica.* | — |

### `dim_status`

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_status` | integer | não | PK | Chave substituta (autoincremento). | — |
| `descricao` | varchar | não | único | Situação do tratamento na data do atendimento. | `em uso`, `concluído`, `descontinuado por reação adversa`, `descontinuado por ineficácia`, `descontinuado por não adesão`, `perdido de seguimento`, `outro` |

### `dim_tempo`

| Coluna | Tipo | Nulo | Chave | Descrição | Exemplo / domínio |
|---|---|---|---|---|---|
| `sk_tempo` | integer | não | PK | Data no formato `aaaammdd`. A linha `0` é "não informado". | 20260315 |
| `data` | date | sim | — | Data completa. Nula só na linha "não informado". | 2026-03-15 |
| `mes` | smallint | sim | — | Mês (1 a 12). | 3 |
| `trimestre` | smallint | sim | — | Trimestre (1 a 4). | 1 |
| `ano` | smallint | sim | — | Ano. | 2026 |

---

## Glossário

| Termo | Significado |
|---|---|
| **Fato** | Tabela de eventos (atendimentos, reações). Cresce a cada ocorrência e guarda as medidas. |
| **Dimensão** | Tabela de categorias que descreve o fato, sem repetição (CID, medicamento, faixa…). |
| **Dado mestre** | Registro gerado a cada ocorrência do negócio (um atendimento, um paciente). |
| **Dado de referência** | Lista padronizada que classifica outros dados (tabela CID, faixas etárias). |
| **Grão** | O que uma linha do fato representa. |
| **Constelação de fatos** | Modelo com mais de um fato compartilhando as mesmas dimensões. Difere do *snowflake*, em que a própria dimensão é normalizada em subtabelas. |
| **SK (surrogate key)** | Chave substituta: inteiro autoincremento sem significado de negócio. |
| **PK / FK** | Chave primária / chave estrangeira. |
| **De-para** | Na carga, troca do código de mercado (ex.: `F20`) pela `sk` da dimensão. |
| **CID-10** | Classificação Internacional de Doenças, 10ª revisão (OMS). |
| **ATC** | *Anatomical Therapeutic Chemical*: classificação de medicamentos da OMS. |
| **MedDRA** | *Medical Dictionary for Regulatory Activities*: dicionário padrão de reações adversas. |
| **PT (Preferred Term)** | Termo do MedDRA que nomeia uma reação. Corresponde a `termo`. |
| **SOC (System Organ Class)** | Sistema do corpo onde a reação aparece; agrupa vários PTs. |
| **IMC** | Índice de Massa Corporal: peso (kg) ÷ altura² (m). |
| **Linha de tratamento** | Ordem da tentativa terapêutica (1ª, 2ª, 3ª opção de medicamento). |
| **Comorbidade** | Doença que o paciente tem além do diagnóstico principal. |
| **Pseudonimização** | Troca do identificador real por um código, sem guardar nome nem documentos. |
| **Censurado** | Tratamento cujo acompanhamento terminou antes do horizonte analisado, sem desfecho conhecido. |

## Pendências para a médica responsável

1. Tabagismo é binário (sim/não) ou tem categorias (ex.: ex-fumante)?
2. Linha de tratamento: até quantas tentativas faz sentido registrar?
3. Escala de gravidade, padrão e observada.
4. Fonte das faixas etárias (IBGE ou Ministério da Saúde).
5. Listas de CIDs, medicamentos e reações adversas que entram na carga.
