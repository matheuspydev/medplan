-- =============================================================================
-- MedPlan | Schema do PROTÓTIPO (SQLite)
--
-- DESCARTÁVEL. Existe só para a fase 0 rodar sem infraestrutura.
-- O modelo canônico é db/postgres/001_schema.sql — é ele que vai para revisão
-- clínica e para a fase 1. Este arquivo é o mesmo modelo lógico com enums
-- rebaixados a CHECK e identity rebaixado a AUTOINCREMENT.
--
-- O que NÃO existe aqui e existe no Postgres: RLS e audit_log append-only.
-- Por isso o protótipo roda apenas com dados sintéticos — nunca com dado real.
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE faixa_etaria (
    codigo    TEXT PRIMARY KEY,
    rotulo    TEXT    NOT NULL,
    idade_min INTEGER NOT NULL,
    idade_max INTEGER NOT NULL,
    ordem     INTEGER NOT NULL UNIQUE
);

CREATE TABLE faixa_imc (
    codigo  TEXT PRIMARY KEY,
    rotulo  TEXT NOT NULL,
    imc_min REAL,
    imc_max REAL,
    ordem   INTEGER NOT NULL UNIQUE
);

CREATE TABLE cid10 (
    codigo    TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    grupo     TEXT NOT NULL
);

CREATE TABLE medicamento (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    principio_ativo    TEXT NOT NULL UNIQUE,
    codigo_atc         TEXT NOT NULL,
    classe_terapeutica TEXT NOT NULL,
    ativo              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE reacao_adversa (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    termo            TEXT NOT NULL UNIQUE,
    codigo_meddra_pt TEXT,
    soc              TEXT NOT NULL,
    gravidade_padrao TEXT NOT NULL CHECK (gravidade_padrao IN ('leve','moderada','grave'))
);

CREATE TABLE hospital (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nome   TEXT NOT NULL,
    cidade TEXT NOT NULL,
    uf     TEXT NOT NULL,
    ativo  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE clinico (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id   INTEGER NOT NULL REFERENCES hospital(id),
    nome          TEXT NOT NULL,
    crm           TEXT,
    uf_crm        TEXT,
    especialidade TEXT,
    papel         TEXT NOT NULL CHECK (papel IN ('medico','admin_hospital','pesquisador')),
    ativo         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE paciente_perfil (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id       INTEGER NOT NULL REFERENCES hospital(id),
    chave_pseudonima  TEXT    NOT NULL,
    sexo              TEXT    NOT NULL CHECK (sexo IN ('feminino','masculino','intersexo','nao_informado')),
    faixa_etaria_cod  TEXT    NOT NULL REFERENCES faixa_etaria(codigo),
    cid10_principal   TEXT    NOT NULL REFERENCES cid10(codigo),
    faixa_imc_cod     TEXT    REFERENCES faixa_imc(codigo),
    tabagismo         TEXT    NOT NULL DEFAULT 'desconhecido'
                              CHECK (tabagismo IN ('nunca','ex_fumante','atual','desconhecido')),
    gestacao_lactacao TEXT    NOT NULL DEFAULT 'nao_aplicavel'
                              CHECK (gestacao_lactacao IN ('nao_aplicavel','nao','gestante','lactante','desconhecido')),
    funcao_renal      TEXT    NOT NULL DEFAULT 'desconhecida'
                              CHECK (funcao_renal IN ('normal','alterada','desconhecida')),
    funcao_hepatica   TEXT    NOT NULL DEFAULT 'desconhecida'
                              CHECK (funcao_hepatica IN ('normal','alterada','desconhecida')),
    uso_substancias   TEXT    NOT NULL DEFAULT 'desconhecido'
                              CHECK (uso_substancias IN ('nenhum','alcool','outras','multiplas','desconhecido')),
    criado_em         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- UTC 'AAAA-MM-DD HH:MM:SS'
    UNIQUE (hospital_id, chave_pseudonima)
);
CREATE INDEX ix_perfil_matching
    ON paciente_perfil(hospital_id, cid10_principal, faixa_etaria_cod, sexo);

CREATE TABLE perfil_comorbidade (
    paciente_perfil_id INTEGER NOT NULL REFERENCES paciente_perfil(id) ON DELETE CASCADE,
    hospital_id        INTEGER NOT NULL,
    cid10_codigo       TEXT    NOT NULL REFERENCES cid10(codigo),
    tipo               TEXT    NOT NULL CHECK (tipo IN ('psiquiatrica','clinica')),
    PRIMARY KEY (paciente_perfil_id, cid10_codigo)
);
CREATE INDEX ix_comorbidade_cid ON perfil_comorbidade(cid10_codigo);

CREATE TABLE prescricao (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id        INTEGER NOT NULL REFERENCES hospital(id),
    paciente_perfil_id INTEGER NOT NULL REFERENCES paciente_perfil(id),
    medicamento_id     INTEGER NOT NULL REFERENCES medicamento(id),
    clinico_id         INTEGER NOT NULL REFERENCES clinico(id),
    data_inicio        TEXT    NOT NULL,          -- ISO-8601 'YYYY-MM-DD'
    dose_inicial       REAL,
    dose_manutencao    REAL,
    unidade_dose       TEXT    NOT NULL DEFAULT 'mg',
    via                TEXT    NOT NULL DEFAULT 'oral'
                               CHECK (via IN ('oral','intramuscular','longa_acao','outra')),
    linha_tratamento   INTEGER,
    CHECK (dose_inicial    IS NULL OR dose_inicial    > 0),
    CHECK (dose_manutencao IS NULL OR dose_manutencao > 0)
);
CREATE INDEX ix_prescricao_perfil      ON prescricao(paciente_perfil_id);
CREATE INDEX ix_prescricao_medicamento ON prescricao(hospital_id, medicamento_id);

CREATE TABLE desfecho_tratamento (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id            INTEGER NOT NULL REFERENCES hospital(id),
    prescricao_id          INTEGER NOT NULL UNIQUE REFERENCES prescricao(id),
    status                 TEXT    NOT NULL CHECK (status IN (
                               'em_uso','concluido_sucesso','desc_reacao_adversa',
                               'desc_ineficacia','desc_nao_adesao','desc_outro',
                               'perdido_seguimento')),
    data_fim               TEXT,
    data_ultima_observacao TEXT    NOT NULL,
    efetividade_percebida  INTEGER,
    observacoes            TEXT,
    registrado_por         INTEGER NOT NULL REFERENCES clinico(id),
    CHECK (efetividade_percebida IS NULL OR efetividade_percebida BETWEEN 1 AND 5),
    CHECK (
        (status IN ('em_uso','perdido_seguimento') AND data_fim IS NULL)
        OR
        (status NOT IN ('em_uso','perdido_seguimento') AND data_fim IS NOT NULL)
    )
);
CREATE INDEX ix_desfecho_status ON desfecho_tratamento(hospital_id, status);

CREATE TABLE desfecho_reacao (
    desfecho_id          INTEGER NOT NULL REFERENCES desfecho_tratamento(id) ON DELETE CASCADE,
    reacao_adversa_id    INTEGER NOT NULL REFERENCES reacao_adversa(id),
    dias_ate_inicio      INTEGER,
    gravidade_observada  TEXT    NOT NULL CHECK (gravidade_observada IN ('leve','moderada','grave')),
    levou_descontinuacao INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (desfecho_id, reacao_adversa_id)
);
CREATE INDEX ix_desfecho_reacao_ra ON desfecho_reacao(reacao_adversa_id);
