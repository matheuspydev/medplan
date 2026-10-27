-- Registro das cargas de CSV (fora do Data Mart: não muda o modelo do documento).
--
-- Somente inclusão, como o audit_log: os gatilhos abaixo recusam UPDATE e DELETE.
-- O valor recusado de cada campo NÃO é guardado: se a origem exportar errado (um nome
-- numa coluna, por exemplo), o dado não fica persistido aqui.
--
-- IF NOT EXISTS: a API cria estas tabelas também num banco anterior a elas.

CREATE TABLE IF NOT EXISTS carga (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id                 INTEGER NOT NULL,
    criado_em                   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    arquivo_atendimentos        TEXT    NOT NULL,
    arquivo_reacoes             TEXT,
    -- quantas linhas de atendimento a origem diz ter exportado (opcional)
    linhas_informadas           INTEGER,
    -- carga inteira recusada (coluna fora do modelo ou obrigatória ausente): nada entrou
    motivo_recusa               TEXT,
    -- origem = o que está nos arquivos; banco = o que entrou
    origem_pacientes            INTEGER NOT NULL,
    origem_atendimentos         INTEGER NOT NULL,
    origem_reacoes              INTEGER NOT NULL,
    origem_comorbidades         INTEGER NOT NULL,
    banco_pacientes             INTEGER NOT NULL,
    banco_atendimentos          INTEGER NOT NULL,
    banco_reacoes               INTEGER NOT NULL,
    banco_comorbidades          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS carga_rejeicao (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    carga_id  INTEGER NOT NULL REFERENCES carga(id),
    arquivo   TEXT    NOT NULL CHECK (arquivo IN ('atendimentos', 'reacoes')),
    linha     INTEGER NOT NULL,   -- linha no arquivo, contando o cabeçalho como 1
    campo     TEXT    NOT NULL,
    motivo    TEXT    NOT NULL,   -- categoria (carga.MOTIVOS)
    mensagem  TEXT    NOT NULL
);

CREATE TRIGGER IF NOT EXISTS carga_sem_update BEFORE UPDATE ON carga
BEGIN SELECT RAISE(ABORT, 'carga é somente de inclusão'); END;
CREATE TRIGGER IF NOT EXISTS carga_sem_delete BEFORE DELETE ON carga
BEGIN SELECT RAISE(ABORT, 'carga é somente de inclusão'); END;
CREATE TRIGGER IF NOT EXISTS carga_rejeicao_sem_update BEFORE UPDATE ON carga_rejeicao
BEGIN SELECT RAISE(ABORT, 'carga_rejeicao é somente de inclusão'); END;
CREATE TRIGGER IF NOT EXISTS carga_rejeicao_sem_delete BEFORE DELETE ON carga_rejeicao
BEGIN SELECT RAISE(ABORT, 'carga_rejeicao é somente de inclusão'); END;
