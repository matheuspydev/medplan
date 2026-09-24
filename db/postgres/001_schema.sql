-- =============================================================================
-- MedPlan — CDSS Psiquiatria | Schema v2 (PostgreSQL)
-- Canônico: modelo de referência para a fase 1 em diante.
-- Justificativa de cada mudança em relação à spec original: MODELO_DADOS_V2.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------
CREATE TYPE papel_clinico     AS ENUM ('medico', 'admin_hospital', 'pesquisador');
CREATE TYPE sexo_biologico    AS ENUM ('feminino', 'masculino', 'intersexo', 'nao_informado');
CREATE TYPE tipo_comorbidade  AS ENUM ('psiquiatrica', 'clinica');
CREATE TYPE tabagismo_status  AS ENUM ('nunca', 'ex_fumante', 'atual', 'desconhecido');
CREATE TYPE funcao_organica   AS ENUM ('normal', 'alterada', 'desconhecida');
CREATE TYPE gestacao_status   AS ENUM ('nao_aplicavel', 'nao', 'gestante', 'lactante', 'desconhecido');
CREATE TYPE uso_substancias   AS ENUM ('nenhum', 'alcool', 'outras', 'multiplas', 'desconhecido');
CREATE TYPE via_administracao AS ENUM ('oral', 'intramuscular', 'longa_acao', 'outra');
CREATE TYPE gravidade_reacao  AS ENUM ('leve', 'moderada', 'grave');

-- O desfecho deixa de ser booleano. Este enum é o coração da mudança: separa
-- "parou porque não tolerou" de "parou porque não funcionou" de "ainda em uso".
CREATE TYPE status_tratamento AS ENUM (
    'em_uso',                 -- ainda em tratamento na última observação (censurado)
    'concluido_sucesso',      -- encerrado por decisão clínica, com resposta adequada
    'desc_reacao_adversa',    -- descontinuado por intolerância
    'desc_ineficacia',        -- descontinuado por falta de resposta
    'desc_nao_adesao',        -- paciente abandonou o uso
    'desc_outro',             -- outro motivo documentado (ver observacoes)
    'perdido_seguimento'      -- sem informação após a última observação (censurado)
);

-- -----------------------------------------------------------------------------
-- 2. Referência — compartilhada entre hospitais, sem RLS
-- -----------------------------------------------------------------------------

-- Faixas etárias como tabela e não enum: o matching progressivo precisa saber
-- quais faixas são adjacentes para poder relaxar o critério de forma ordenada.
CREATE TABLE faixa_etaria (
    codigo      TEXT PRIMARY KEY,
    rotulo      TEXT     NOT NULL,
    idade_min   SMALLINT NOT NULL,
    idade_max   SMALLINT NOT NULL,
    ordem       SMALLINT NOT NULL UNIQUE,
    CHECK (idade_min <= idade_max)
);

CREATE TABLE faixa_imc (
    codigo      TEXT PRIMARY KEY,
    rotulo      TEXT     NOT NULL,
    imc_min     NUMERIC(4,1),
    imc_max     NUMERIC(4,1),
    ordem       SMALLINT NOT NULL UNIQUE
);

CREATE TABLE cid10 (
    codigo      TEXT PRIMARY KEY,       -- ex. 'F32.1'
    descricao   TEXT NOT NULL,
    grupo       TEXT NOT NULL           -- ex. 'F30-F39'; usado para relaxar o matching
);

CREATE TABLE medicamento (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    principio_ativo    TEXT NOT NULL UNIQUE,
    codigo_atc         TEXT NOT NULL,   -- ex. 'N06AB06'; permite agregar por classe
    classe_terapeutica TEXT NOT NULL,
    ativo              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE reacao_adversa (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    termo            TEXT NOT NULL UNIQUE,  -- MedDRA Preferred Term
    codigo_meddra_pt TEXT,
    soc              TEXT NOT NULL,         -- MedDRA System Organ Class
    gravidade_padrao gravidade_reacao NOT NULL
);

-- -----------------------------------------------------------------------------
-- 3. Tenant
-- -----------------------------------------------------------------------------
CREATE TABLE hospital (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome      TEXT NOT NULL,
    cidade    TEXT NOT NULL,
    uf        CHAR(2) NOT NULL,
    ativo     BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clinico (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hospital_id   BIGINT NOT NULL REFERENCES hospital(id),
    nome          TEXT NOT NULL,
    crm           TEXT,
    uf_crm        CHAR(2),
    especialidade TEXT,
    papel         papel_clinico NOT NULL,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (hospital_id, crm, uf_crm)
);
CREATE INDEX ix_clinico_hospital ON clinico(hospital_id);

-- NUNCA armazena identificador direto. `chave_pseudonima` é a chave que o
-- hospital mantém internamente; a ponte para a identidade real fica lá, não aqui.
CREATE TABLE paciente_perfil (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hospital_id       BIGINT NOT NULL REFERENCES hospital(id),
    chave_pseudonima  TEXT   NOT NULL,
    sexo              sexo_biologico NOT NULL,
    faixa_etaria_cod  TEXT   NOT NULL REFERENCES faixa_etaria(codigo),
    cid10_principal   TEXT   NOT NULL REFERENCES cid10(codigo),
    faixa_imc_cod     TEXT   REFERENCES faixa_imc(codigo),
    tabagismo         tabagismo_status NOT NULL DEFAULT 'desconhecido',
    gestacao_lactacao gestacao_status  NOT NULL DEFAULT 'nao_aplicavel',
    funcao_renal      funcao_organica  NOT NULL DEFAULT 'desconhecida',
    funcao_hepatica   funcao_organica  NOT NULL DEFAULT 'desconhecida',
    uso_substancias   uso_substancias  NOT NULL DEFAULT 'desconhecido',
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (hospital_id, chave_pseudonima),
    UNIQUE (id, hospital_id)   -- alvo das FKs compostas que impedem vazamento entre tenants
);
CREATE INDEX ix_perfil_matching
    ON paciente_perfil(hospital_id, cid10_principal, faixa_etaria_cod, sexo);

-- Comorbidades como tabela de junção, não array: portável, indexável, e permite
-- distinguir comorbidade psiquiátrica de clínica ao relaxar o matching.
CREATE TABLE perfil_comorbidade (
    paciente_perfil_id BIGINT NOT NULL,
    hospital_id        BIGINT NOT NULL,
    cid10_codigo       TEXT   NOT NULL REFERENCES cid10(codigo),
    tipo               tipo_comorbidade NOT NULL,
    PRIMARY KEY (paciente_perfil_id, cid10_codigo),
    FOREIGN KEY (paciente_perfil_id, hospital_id)
        REFERENCES paciente_perfil(id, hospital_id) ON DELETE CASCADE
);
CREATE INDEX ix_comorbidade_cid ON perfil_comorbidade(cid10_codigo);

-- Dose e via entram aqui: tolerabilidade é fortemente dose-dependente, e uma
-- prescrição sem dose é quase inútil para prever reação adversa.
CREATE TABLE prescricao (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hospital_id        BIGINT NOT NULL REFERENCES hospital(id),
    paciente_perfil_id BIGINT NOT NULL,
    medicamento_id     BIGINT NOT NULL REFERENCES medicamento(id),
    clinico_id         BIGINT NOT NULL REFERENCES clinico(id),
    data_inicio        DATE   NOT NULL,
    dose_inicial       NUMERIC(8,2),
    dose_manutencao    NUMERIC(8,2),
    unidade_dose       TEXT   NOT NULL DEFAULT 'mg',
    via                via_administracao NOT NULL DEFAULT 'oral',
    linha_tratamento   SMALLINT,   -- 1 = primeira tentativa registrada para este perfil
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, hospital_id),
    FOREIGN KEY (paciente_perfil_id, hospital_id)
        REFERENCES paciente_perfil(id, hospital_id),
    CHECK (dose_inicial    IS NULL OR dose_inicial    > 0),
    CHECK (dose_manutencao IS NULL OR dose_manutencao > 0),
    CHECK (linha_tratamento IS NULL OR linha_tratamento > 0)
);
CREATE INDEX ix_prescricao_perfil      ON prescricao(paciente_perfil_id);
CREATE INDEX ix_prescricao_medicamento ON prescricao(hospital_id, medicamento_id);

-- `data_ultima_observacao` é o que torna a censura correta: para tratamento em
-- curso o seguimento termina no último contato, e não conta como sucesso.
CREATE TABLE desfecho_tratamento (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hospital_id            BIGINT NOT NULL REFERENCES hospital(id),
    prescricao_id          BIGINT NOT NULL UNIQUE,
    status                 status_tratamento NOT NULL,
    data_fim               DATE,
    data_ultima_observacao DATE NOT NULL,
    efetividade_percebida  SMALLINT,     -- escala 1-5, opcional
    observacoes            TEXT,
    registrado_por         BIGINT NOT NULL REFERENCES clinico(id),
    registrado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, hospital_id),
    FOREIGN KEY (prescricao_id, hospital_id)
        REFERENCES prescricao(id, hospital_id),
    CHECK (efetividade_percebida IS NULL OR efetividade_percebida BETWEEN 1 AND 5),
    -- em curso ou perdido de vista => sem data_fim; encerrado => data_fim obrigatória
    CHECK (
        (status IN ('em_uso', 'perdido_seguimento') AND data_fim IS NULL)
        OR
        (status NOT IN ('em_uso', 'perdido_seguimento') AND data_fim IS NOT NULL)
    )
);
CREATE INDEX ix_desfecho_status ON desfecho_tratamento(hospital_id, status);

-- Junção com atributos por reação: `dias_ate_inicio` distingue sintoma
-- extrapiramidal na primeira semana de alteração metabólica no oitavo mês.
CREATE TABLE desfecho_reacao (
    desfecho_id          BIGINT NOT NULL REFERENCES desfecho_tratamento(id) ON DELETE CASCADE,
    reacao_adversa_id    BIGINT NOT NULL REFERENCES reacao_adversa(id),
    dias_ate_inicio      INTEGER,
    gravidade_observada  gravidade_reacao NOT NULL,
    levou_descontinuacao BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (desfecho_id, reacao_adversa_id),
    CHECK (dias_ate_inicio IS NULL OR dias_ate_inicio >= 0)
);
CREATE INDEX ix_desfecho_reacao_ra ON desfecho_reacao(reacao_adversa_id);

CREATE TABLE consentimento_dados_hospital (
    hospital_id     BIGINT PRIMARY KEY REFERENCES hospital(id),
    termo_assinado  BOOLEAN NOT NULL DEFAULT FALSE,
    data_assinatura DATE,
    dpo_responsavel TEXT,
    -- Decisão contratual que precisa existir ANTES da fase 2: os dados deste
    -- hospital podem entrar em treino agregado multi-hospital?
    permite_uso_agregado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE audit_log (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hospital_id    BIGINT NOT NULL REFERENCES hospital(id),
    clinico_id     BIGINT REFERENCES clinico(id),
    acao           TEXT NOT NULL,   -- LEITURA / INSERCAO / ATUALIZACAO / RECOMENDACAO
    tabela_afetada TEXT,
    registro_id    BIGINT,
    detalhe        JSONB,
    ocorrido_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_hospital_data ON audit_log(hospital_id, ocorrido_em DESC);
