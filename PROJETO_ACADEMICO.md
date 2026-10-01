# Projeto acadêmico — PUC Minas

Este repositório é o código do projeto de extensão **"Business Intelligence aplicado à saúde
mental: padrões de prescrição medicamentosa por perfil clínico"**, do curso de Sistemas de
Informação (EAD) da PUC Minas, Eixo 4 — Projeto Aplicações para Sustentabilidade, Etapa 2, 2026.

Este documento existe para que qualquer pessoa da equipe veja, numa página, o que o projeto
prometeu entregar e o que o código já entrega. A fonte é o PDF do projeto de extensão.

## Quem é quem

| Papel | Pessoa |
|---|---|
| Professora responsável | Michelle Hanne Soares de Andrade |
| Colaboradora e orientadora externa | Dra. Stephanie Silva — Hospital Mater Dei, Unidade Contorno (BH/MG) |
| Equipe (4 h semanais cada) | Matheus Henrique Caitano Faria · Pedro Henrique Pereira da Silva · Júlia Rabelo Laine · Andressa Nascimento Santos · Lucas Eduardo Silva Couto · Tobias Bastos |

Entregas incrementais a cada 2 semanas, com reunião de alinhamento da equipe e validação
clínica remota com a Dra. Stephanie ao fim de cada ciclo. **Entrega final: 23/11/2026.**

## Público

Direto: 5 psiquiatras da ala psiquiátrica do Mater Dei — Unidade Contorno. Indireto: pacientes
atendidos no período (estimativa do projeto: ≈ 672 atendimentos em ≈ 16 semanas) e suas famílias
(≈ 1.814 pessoas).

## Enquadramento

- OMS, *Classification of Digital Health Interventions* v1.0 — Grupo 2, suporte à decisão clínica.
- ODS 3 da Agenda 2030 (Saúde e Bem-Estar).
- Política de Extensão Universitária (2006) e PDI (2012) da PUC Minas.

## Como os dados chegam

A Dra. Stephanie exporta os dados do sistema de gestão hospitalar em **CSV**, aplicando filtros e
**anonimização na origem**, dentro do ambiente hospitalar. A equipe do projeto **não tem acesso a
dado identificável em momento nenhum**. Hoje a análise no hospital é manual, em planilhas.

Consequência para este repositório: enquanto esse CSV não chega, tudo roda com **dados sintéticos**
gerados por `medplan/synth.py`, e a interface diz isso em todas as telas. Ver as regras em
`CONTRIBUTING.md`.

## Objetivos específicos × estado do código

| # | Objetivo do projeto de extensão | Situação | Onde está |
|---|---|---|---|
| 1 | Modelar Data Warehouse/Data Mart com perfil clínico, medicação, reações adversas e desfecho | **Parcial** — existe modelo relacional normalizado com as quatro entidades, com isolamento por hospital e audit log; **não existe** modelo dimensional (fatos e dimensões) | `db/postgres/001_schema.sql`, `MODELO_DADOS_V2.md` |
| 2 | Definir e documentar o ETL das fontes de dados | **Não iniciado** — não há importador do CSV do hospital nem mapeamento campo a campo | — |
| 3 | Dashboards analíticos de **padrões de prescrição** por perfil | **Não iniciado** — a interface hoje responde "como perfis semelhantes **toleraram** cada medicamento", que é outra pergunta (ver abaixo) | `web/` |
| 4 | Portal/página web acessível à comunidade acadêmica e ao parceiro | **Feito**, falta publicar — roda local; hospedagem gratuita a definir | `web/`, `medplan/api.py` |
| 5 | Métricas e indicadores para apoiar a decisão | **Parcial** — permanência em tratamento com n e IC95%, motivos de descontinuação, reações adversas por medicamento; faltam indicadores de frequência de prescrição | `medplan/engine.py`, `medplan/stats.py` |

## A divergência que precisa de decisão da equipe

O projeto de extensão pede **padrões de prescrição**: com que frequência cada classe de
medicamento é prescrita para um perfil (por exemplo, homens de 20 a 30 anos com transtorno de
ansiedade e sem obesidade).

O que está construído responde **tolerabilidade**: entre perfis semelhantes, quantos permaneceram
em tratamento até o horizonte, por que descontinuaram e quais reações adversas apareceram.

São perguntas complementares, e as duas usam os mesmos dados — mas só a segunda está implementada.
Entregar o objetivo 3 exige acrescentar a visão de frequência de prescrição (contagem por classe
e por perfil), que é mais simples que o motor de coorte já existente.

Também em aberto, porque o PDF deixou as seções em branco: **item 6 (Metas)**, **item 9
(Monitoramento)** e **item 10 (Avaliação)**. O repositório já oferece matéria-prima para as três:
entregas quinzenais versionadas, CI com 47 testes de motor e API e 117 da interface, e o histórico
de commits como registro de execução.

## Próximos passos sugeridos, na ordem

1. Levantar com a Dra. Stephanie o **layout do CSV** (quais colunas o sistema hospitalar exporta).
2. Escrever o **importador CSV** e o documento de mapeamento campo a campo — objetivo 2.
3. Decidir o **modelo dimensional** (esquema estrela sobre o relacional, ou views analíticas) — objetivo 1.
4. Acrescentar os **indicadores de frequência de prescrição** e a tela de dashboards — objetivos 3 e 5.
5. Publicar em **hospedagem gratuita** — objetivo 4.
6. Preencher **metas, monitoramento e avaliação** no documento do projeto.
