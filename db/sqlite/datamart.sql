-- =============================================================================
-- MedPlan | Data Mart no protótipo (SQLite)
--
-- Mesmo modelo de db/postgres/010_datamart.sql e db/modelagem/datamart.dbml
-- (constelação de fatos, grão = atendimento), com os tipos rebaixados ao SQLite:
-- identity -> INTEGER PRIMARY KEY AUTOINCREMENT, boolean -> INTEGER 0/1,
-- numeric -> REAL, varchar/char -> TEXT. Nenhuma coluna a mais, nenhuma a menos.
--
-- Como no Postgres, o Data Mart não tem hospital_id: no protótipo há um único
-- hospital (o da sessão de demonstração).
--
-- As dimensões são preenchidas a partir dos catálogos do protótipo por
-- medplan/datamart.py; os fatos, pelo registro de atendimento e pelo gerador sintético.
-- =============================================================================

CREATE TABLE dim_paciente (
    sk_paciente       INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_pseudonimo TEXT    NOT NULL UNIQUE,
    sexo              TEXT    NOT NULL
);

CREATE TABLE dim_faixa_etaria (
    sk_faixa_etaria INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao       TEXT    NOT NULL,
    idade_min       INTEGER,
    idade_max       INTEGER
);

CREATE TABLE dim_faixa_imc (
    sk_faixa_imc INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao    TEXT NOT NULL,
    imc_min      REAL,
    imc_max      REAL
);

CREATE TABLE dim_cid10 (
    sk_cid    INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo    TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    grupo     TEXT NOT NULL,
    tipo      TEXT NOT NULL
);

CREATE TABLE dim_medicamento (
    sk_medicamento     INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_atc         TEXT NOT NULL UNIQUE,
    principio_ativo    TEXT NOT NULL,
    classe_terapeutica TEXT NOT NULL
);

CREATE TABLE dim_reacao_adversa (
    sk_reacao        INTEGER PRIMARY KEY AUTOINCREMENT,
    termo            TEXT NOT NULL,
    soc              TEXT NOT NULL,
    gravidade_padrao TEXT NOT NULL
);

CREATE TABLE dim_status (
    sk_status INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL UNIQUE
);

CREATE TABLE dim_tempo (
    sk_tempo  INTEGER PRIMARY KEY,   -- aaaammdd; 0 = "não informado"
    data      TEXT,
    mes       INTEGER,
    trimestre INTEGER,
    ano       INTEGER
);

CREATE TABLE fato_atendimento (
    sk_atendimento   INTEGER PRIMARY KEY AUTOINCREMENT,
    sk_paciente      INTEGER NOT NULL REFERENCES dim_paciente(sk_paciente),
    sk_faixa_etaria  INTEGER NOT NULL REFERENCES dim_faixa_etaria(sk_faixa_etaria),
    sk_faixa_imc     INTEGER NOT NULL REFERENCES dim_faixa_imc(sk_faixa_imc),
    sk_cid_principal INTEGER NOT NULL REFERENCES dim_cid10(sk_cid),
    sk_medicamento   INTEGER NOT NULL REFERENCES dim_medicamento(sk_medicamento),  -- prescrito neste atendimento
    sk_status        INTEGER NOT NULL REFERENCES dim_status(sk_status),
    sk_tempo         INTEGER NOT NULL REFERENCES dim_tempo(sk_tempo),              -- data do atendimento
    tabagista        INTEGER NOT NULL,                                             -- binário a confirmar com a médica
    qtd_comorbidades INTEGER NOT NULL,
    linha_tratamento INTEGER,
    dias_observados  INTEGER NOT NULL,
    qtd_reacoes      INTEGER NOT NULL
);

CREATE TABLE fato_reacao_adversa (
    sk_reacao_fato              INTEGER PRIMARY KEY AUTOINCREMENT,
    sk_atendimento              INTEGER NOT NULL REFERENCES fato_atendimento(sk_atendimento),
    sk_reacao                   INTEGER NOT NULL REFERENCES dim_reacao_adversa(sk_reacao),
    sk_medicamento              INTEGER NOT NULL REFERENCES dim_medicamento(sk_medicamento),  -- o que causou
    sk_tempo_inicio_medicamento INTEGER NOT NULL REFERENCES dim_tempo(sk_tempo),
    sk_tempo_inicio_reacao      INTEGER NOT NULL REFERENCES dim_tempo(sk_tempo),
    dias_ate_reacao             INTEGER,
    gravidade_observada         TEXT    NOT NULL,
    levou_descontinuacao        INTEGER NOT NULL
);
