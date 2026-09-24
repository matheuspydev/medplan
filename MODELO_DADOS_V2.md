# Modelo de dados v2 — o que mudou e por quê

Documento de revisão. Complementa `arquitetura_cdss_psiquiatria.md` (seção 3) e é
o que precisa ser validado com a Dra. Stephanie antes de virar produto.

DDL canônico: `db/postgres/001_schema.sql` · RLS: `002_rls.sql` · audit: `003_audit_append_only.sql`

---

## Resumo das mudanças

| # | Mudança | Motivo |
|---|---|---|
| 1 | `tolerou BOOL` → `status_tratamento` + `data_fim` + `data_ultima_observacao` | O booleano descarta a informação mais forte do prontuário |
| 2 | `dose_inicial`, `dose_manutencao`, `via` na prescrição | Tolerabilidade é fortemente dose-dependente |
| 3 | `desfecho_reacao` com `dias_ate_inicio` e `levou_descontinuacao` | Reação na semana 1 e no mês 8 são fenômenos diferentes |
| 4 | Arrays → tabelas de junção | Portabilidade, índice, e atributo por linha |
| 5 | CID-10, ATC e MedDRA como vocabulário | Dado que não cruza entre hospitais não vira produto multi-tenant |
| 6 | Campos clínicos novos no perfil | IMC, tabagismo, gestação, função renal/hepática |
| 7 | `motivo_troca` texto livre → removido | Texto livre não se analisa; virou `status` + `observacoes` |
| 8 | FK composta `(id, hospital_id)` | Isolamento de tenant garantido pelo banco |
| 9 | `permite_uso_agregado` no consentimento | Decisão contratual que a fase 2 exige e ninguém quer descobrir tarde |

---

## 1. O desfecho deixa de ser booleano

**Antes:** `desfecho_tratamento.tolerou BOOLEAN`

**Agora:** `status` (enum de 7 valores) + `data_fim` + `data_ultima_observacao`.

```
em_uso · concluido_sucesso · desc_reacao_adversa · desc_ineficacia
desc_nao_adesao · desc_outro · perdido_seguimento
```

`tolerou = false` mistura três coisas clinicamente opostas: o paciente não
suportou o efeito colateral, o remédio não funcionou, ou o paciente parou de
tomar por conta própria. São decisões diferentes para o médico que vai prescrever.

Mais importante: com `data_inicio` e `data_fim` o dado vira **tempo até
descontinuação**, que é o desfecho que a literatura de efetividade em psiquiatria
usa (é o desfecho primário do CATIE, e o eixo do STAR\*D). Com poucos dados,
tempo-até-evento extrai muito mais sinal que um classificador binário.

`data_ultima_observacao` é o campo que faz a censura funcionar. Um paciente que
começou há três semanas e ainda está em uso não é evidência de tolerância em doze
semanas — ele sai do denominador. Contá-lo como sucesso é o erro que mais infla
taxa de tolerância em análise retrospectiva de prontuário, e sem esse campo o
erro é inevitável.

**Para validar com a médica:** os 7 status cobrem o que aparece no prontuário do
Mater Dei? Falta algo como "troca por indisponibilidade/custo"?

## 2. Dose entra na prescrição

`dose_inicial`, `dose_manutencao`, `unidade_dose`, `via`, `linha_tratamento`.

Uma prescrição sem dose é quase inútil para prever reação adversa — a mesma
molécula em 25 mg e em 300 mg são perfis de tolerabilidade diferentes. `via`
entra porque antipsicótico de longa ação tem padrão de adesão e de reação
completamente distinto do oral.

**Para validar:** a dose está registrada de forma recuperável no prontuário, ou
vai precisar de revisão manual? Se for manual, quanto custa por paciente? Esta é
provavelmente a pergunta mais cara do projeto.

## 3. Reações adversas com tempo e causalidade

`desfecho_reacao` substitui o array `reacoes_adversas_ids[]`, com três atributos
por linha:

- `dias_ate_inicio` — sintoma extrapiramidal no dia 3 e alteração metabólica no
  mês 8 não são o mesmo fenômeno, e o médico precisa saber o que esperar quando.
- `gravidade_observada` — a gravidade real naquele paciente, que pode divergir da
  gravidade padrão do termo.
- `levou_descontinuacao` — separa "teve náusea e seguiu o tratamento" de "parou
  por causa da náusea". Sem isso, toda reação pesa igual.

## 4. Medicações concomitantes — resolvido sem tabela nova

Boa parte das reações adversas em psiquiatria é interação, e a spec original não
tinha como representar polifarmácia. Não foi preciso criar tabela: prescrições do
mesmo perfil com janelas `[data_inicio, data_fim]` que se sobrepõem **são**
o esquema concomitante. É consulta, não modelagem.

Ainda não está exposto no motor da fase 0 — está registrado como próximo passo.

## 5. Vocabulários controlados

| Domínio | Padrão | Situação |
|---|---|---|
| Diagnóstico | CID-10 | seed com recorte psiquiátrico; conferir contra DATASUS |
| Medicamento | ATC | seed com 23 princípios ativos; conferir contra WHO ATC/DDD |
| Reação adversa | MedDRA | **termo e SOC apenas — código pendente** |

Catálogo livre produz dado que nunca cruza entre hospitais nem se compara com a
literatura. É barato agora e caro depois, e é o que viabiliza a fase 3 (FHIR).

Sobre MedDRA: é dicionário licenciado pela MSSO. Os códigos numéricos precisam
vir da versão assinada — `codigo_meddra_pt` está NULL de propósito, e preenchê-lo
de memória seria inventar dado clínico. **Item de decisão: assinar MedDRA ou
adotar um vocabulário próprio controlado na fase 0?**

## 6. Campos clínicos novos no perfil

| Campo | Por quê |
|---|---|
| `faixa_imc_cod` | reação metabólica de antipsicótico depende fortemente do IMC de base |
| `tabagismo` | induz CYP1A2 — altera nível sérico de clozapina e olanzapina |
| `gestacao_lactacao` | contraindicações absolutas |
| `funcao_renal` / `funcao_hepatica` | ajuste de dose e risco de acúmulo |
| `uso_substancias` | interação e adesão |

Todos aceitam `desconhecido` — dado de mundo real é incompleto, e forçar
preenchimento produziria dado inventado, que é pior que dado ausente.

**Para validar:** algum destes não está disponível no prontuário? Falta algum
que a médica considere decisivo?

## 7. Comorbidades e reações como tabelas de junção

`comorbidades[]` e `reacoes_adversas_ids[]` eram arrays PostgreSQL. Viraram
`perfil_comorbidade` e `desfecho_reacao`. Ganhos: SQL portável, índice de
verdade, atributos por linha, e a distinção psiquiátrica/clínica que a escada de
relaxamento do matching usa.

## 8. Isolamento de tenant garantido pelo banco

Além do RLS, tabelas de paciente carregam `hospital_id` e apontam para
`paciente_perfil(id, hospital_id)` por FK composta. Isso torna
estruturalmente impossível uma prescrição de um hospital apontar para um perfil
de outro — nem por bug de aplicação, nem por import mal feito.

`audit_log` é append-only em duas camadas (permissão revogada + trigger). Nenhuma
das duas resiste a um superusuário determinado; a garantia forte é backup
append-only fora do banco.

## 9. `permite_uso_agregado` no consentimento

Os dados deste hospital podem entrar em treino agregado multi-hospital?

Parece pergunta de fase 2, mas precisa de resposta agora, porque muda o DPA que
será assinado com o **primeiro** hospital. Se a resposta padrão for "não" e só se
descobrir isso depois de três hospitais assinados, a premissa de ML agregado da
fase 2 cai inteira e o roadmap precisa ser reescrito.

---

## O que este modelo ainda não resolve

Registrado aqui para não passar por resolvido:

1. **Viés de indicação.** Nenhum campo conserta isso — é limitação do desenho
   observacional. O que dá para fazer: declarar na interface (feito), registrar
   `linha_tratamento` como proxy de refratariedade (feito), e considerar escore
   de propensão quando houver volume. Um confundidor não registrado permanece
   não ajustável, por construção.

2. **Gravidade basal.** Não há escala de gravidade no perfil (PHQ-9, MADRS, PANSS,
   HAM-D). É o confundidor mais forte e o mais viável de capturar. **Vale
   perguntar à médica se alguma escala é aplicada de rotina no Mater Dei** — se
   for, entra no modelo e melhora tudo.

3. **Cold start.** Um hospital novo não tem dado nenhum e o sistema não tem o que
   dizer. Sem resposta a isso, o produto não tem valor no momento da venda.

4. **Validação do modelo.** Não existe plano. O mínimo é hold-out temporal:
   treinar com dado até uma data, testar no período seguinte.

5. **Registro do que foi recomendado vs. o que foi prescrito.** É como se mede se
   o sistema está criando realimentação, e é o dado que sustentaria um estudo
   prospectivo. Tabela ainda não modelada — proposta para a fase 1.

---

## Achado empírico do protótipo

Com **700 perfis sintéticos** — mais do que o Mater Dei provavelmente terá no
início — a escada de relaxamento precisou descer até o **nível 5** (largando
comorbidades, faixa etária, sexo e o código CID-10 exato) para algum medicamento
atingir n=20:

| Nível | Critério | Perfis | Maior n avaliável |
|---|---|---|---|
| 0 | Perfil completo | 2 | 1 |
| 1 | Comorbidades clínicas ignoradas | 3 | 1 |
| 2 | Comorbidades ignoradas | 4 | 2 |
| 3 | Faixa etária ampliada | 15 | 5 |
| 4 | Sexo ignorado | 23 | 6 |
| 5 | Grupo diagnóstico | 265 | 37 |

*(perfil: F31.3, feminino, 26–35 anos, sem comorbidade; horizonte 84 dias)*

Para TDAH (F90.0), nem o nível 5 chega lá — 9 perfis, n máximo 6 — e o sistema
corretamente devolve "dados insuficientes".

Isso quantifica o problema central da fase 0: **"perfil semelhante" com quatro
eixos não sobrevive ao volume de dados de um hospital só.** As saídas possíveis
são reduzir os eixos de matching, aceitar coortes mais frouxas com o relaxamento
declarado na tela, ou ir para multi-hospital antes do previsto. É uma decisão de
produto, e o número acima é o argumento para tomá-la agora.
