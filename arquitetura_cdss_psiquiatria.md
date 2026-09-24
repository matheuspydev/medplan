# Spec de Arquitetura — Sistema de Apoio à Decisão Clínica (Psiquiatria)

## 1. Visão do produto

**Problema:** psiquiatras escolhem medicação com base em experiência pessoal e tentativa/erro, sem visibilidade estruturada de como pacientes com perfil semelhante (idade, sexo, diagnóstico, comorbidades) toleraram cada medicação no passado.

**Solução:** uma ferramenta que, dado o perfil de um novo paciente, mostra ao médico:
1. Quais medicações têm melhor histórico de tolerância para perfis semelhantes
2. Quais reações adversas são mais prováveis para aquele perfil
3. O "porquê" da sugestão (explicabilidade — não é uma caixa-preta)

**O que este produto NÃO é:** não é uma ferramenta de diagnóstico nem substitui o julgamento clínico. É apoio à decisão — a prescrição final é sempre do médico. Isso precisa estar explícito na UI (disclaimer) e no design (o sistema nunca prescreve sozinho, só sugere e explica).

**Nota regulatória:** dependendo de como isso for comercializado, pode se enquadrar como *Software as a Medical Device* (SaMD) perante a ANVISA (RDC 657/2022), e o tratamento de dados de saúde é regido pela LGPD (dado sensível, Art. 11). Recomendo validar com um advogado especializado antes de comercializar para múltiplos hospitais — isso não é conselho jurídico, só um alerta para não pular essa etapa.

---

## 2. Arquitetura de alto nível

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Frontend    │─────▶│   API (FastAPI)   │─────▶│   PostgreSQL     │
│  React + TS  │◀─────│  REST + JWT Auth  │◀─────│  (multi-tenant   │
└─────────────┘      └────────┬─────────┘      │   via RLS)       │
                               │                 └─────────────────┘
                               ▼
                     ┌───────────────────┐
                     │  Motor de          │
                     │  Recomendação      │
                     │  (scikit-learn/    │
                     │   XGBoost + regras)│
                     └───────────────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │  Redis (cache +    │
                     │  fila de jobs)     │
                     └───────────────────┘
```

Cada hospital é um **tenant** isolado via Row-Level Security no Postgres — nunca via bancos separados (mais fácil de manter, escalar e migrar).

---

## 3. Modelo de dados (núcleo)

| Tabela | Campos principais | Observação |
|---|---|---|
| `hospital` | id, nome, cidade, uf, ativo | tenant raiz |
| `clinico` | id, hospital_id, nome, crm, especialidade, papel | papel: medico / admin_hospital / pesquisador |
| `paciente_perfil` | id, hospital_id, sexo, faixa_etaria, diagnostico_principal, comorbidades[], criado_em | **nunca armazena nome/CPF/prontuário** — só atributos clínicos + uma chave pseudônima que o hospital mantém internamente |
| `medicamento` | id, nome, principio_ativo, classe_terapeutica | catálogo compartilhado entre hospitais |
| `reacao_adversa` | id, nome, gravidade, categoria | catálogo compartilhado |
| `prescricao` | id, paciente_perfil_id, medicamento_id, clinico_id, data_inicio, data_fim, motivo_troca | |
| `desfecho_tratamento` | id, prescricao_id, tolerou (bool), reacoes_adversas_ids[], efetividade_percebida (escala 1-5), observacoes | é isso que alimenta o motor de recomendação |
| `consentimento_dados_hospital` | hospital_id, termo_assinado, data, dpo_responsavel | governança/LGPD por hospital |
| `audit_log` | id, clinico_id, acao, tabela_afetada, registro_id, timestamp | **append-only**, nunca editável nem deletável |

Princípio-chave: o hospital mantém a ponte entre a chave pseudônima e a identidade real do paciente. **Nosso sistema nunca precisa saber quem é o paciente**, só o perfil clínico.

---

## 4. Motor de recomendação — abordagem faseada

Não comecem com rede neural. Dados tabulares com volume moderado (centenas a poucos milhares de registros por hospital no início) são historicamente melhor servidos por métodos clássicos, que além disso são explicáveis — essencial num contexto clínico.

| Fase | Abordagem | Quando usar |
|---|---|---|
| MVP | Análise de coorte (SQL): filtrar perfis semelhantes, calcular % de tolerância por medicação | Já funciona com poucos dados, 100% explicável |
| V1 | Random Forest / XGBoost por medicação (classificação binária "tolera/não tolera") + SHAP values para explicabilidade | A partir de ~500-1000 registros por medicação |
| V2+ | Rede neural (tabular, ex. TabNet) — só se o volume agregado multi-hospital justificar | Avaliar depois de ter dados de vários hospitais |

Todas as fases devem retornar não só a sugestão, mas a explicação ("82% dos pacientes com perfil similar toleraram bem", "n=134 casos semelhantes na base").

---

## 5. Stack recomendada

- **Backend:** Python + FastAPI (async, tipado, integra bem com a camada de ML)
- **ORM/Migrations:** SQLAlchemy + Alembic
- **Banco:** PostgreSQL com Row-Level Security (isolamento por `hospital_id`)
- **Cache/filas:** Redis + Celery (jobs assíncronos, ex. retraining de modelo)
- **ML:** scikit-learn / XGBoost inicialmente; MLflow para versionamento de modelos quando amadurecer
- **Frontend:** React + TypeScript
- **Auth:** OAuth2/OIDC — recomendo Keycloak self-hosted (não terceirizar autenticação de dado de saúde para um SaaS de auth sem análise de compliance)
- **Infra (MVP):** Docker + docker-compose local; deploy em PaaS simples (Railway, Fly.io ou Render) — evitem Kubernetes até realmente precisarem de escala multi-hospital
- **CI/CD:** GitHub Actions (lint, testes, scan de dependências, deploy)
- **Observabilidade:** logging estruturado (structlog), Sentry para erros; métricas via Prometheus/Grafana quando o produto amadurecer

---

## 6. Segurança — não negociável em dado de saúde

- HTTPS obrigatório em todas as camadas
- Criptografia em repouso no banco (e criptografia a nível de coluna para qualquer quase-identificador)
- Row-Level Security no Postgres por `hospital_id` — isolamento real de tenant, não só filtro na aplicação
- JWT de curta duração + refresh token; MFA obrigatório para papéis admin
- `audit_log` append-only para toda leitura/escrita em dados de paciente
- Gestão de segredos via cofre (Vault / secrets manager do provedor cloud) — nunca hardcoded
- Scan de dependências (Dependabot/Snyk) e checklist OWASP Top 10 no pipeline de CI
- Política de retenção e de exclusão de dados (direito ao esquecimento, LGPD)
- Um Data Processing Agreement (DPA) assinado por hospital antes de qualquer integração

---

## 7. Roadmap de fases

1. **Fase 0 — MVP validação (Hospital Mater Dei, single-tenant):** ingestão manual/CSV, análise de coorte via SQL, protótipo simples (pode ser até Streamlit para validar a lógica com a Dra. Stephanie rapidamente antes de construir a versão "de verdade")
2. **Fase 1 — Produto real single-tenant:** stack completa acima (FastAPI + React + Postgres + auth robusta + audit log), modelo Random Forest/XGBoost com explicabilidade
3. **Fase 2 — Multi-hospital:** RLS multi-tenant, painel admin por hospital, DPA por hospital, pipeline de retraining
4. **Fase 3 — Escala e integração:** avaliar padrão HL7 FHIR para ingestão automatizada a partir do prontuário eletrônico dos hospitais (em vez de import manual), avaliar modelos mais avançados se o volume de dados agregado justificar

---

## 8. Endpoints principais (MVP)

```
POST   /api/v1/perfis                    # cria perfil de paciente (pseudônimo)
POST   /api/v1/prescricoes               # registra prescrição
POST   /api/v1/desfechos                 # registra desfecho (tolerou/reação adversa)
GET    /api/v1/recomendacoes?perfil_id=  # retorna ranking de medicações + explicação
GET    /api/v1/audit-log                 # somente admin_hospital
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
```

---

## 9. Instrução para quem for implementar (Claude Code)

Sugestão de ordem de construção:
1. Setup do projeto (FastAPI + Postgres + Docker Compose local)
2. Modelo de dados + migrations (Alembic) conforme seção 3
3. Auth (Keycloak ou implementação própria JWT simples no MVP, migrar depois)
4. CRUD de perfis/prescrições/desfechos
5. Motor de recomendação Fase 0 (SQL de coorte) antes de qualquer ML
6. Endpoint de recomendação + explicação
7. Audit log (middleware que registra toda operação sensível)
8. Frontend React consumindo a API
9. Só depois disso, evoluir o motor de recomendação para Random Forest/XGBoost com SHAP