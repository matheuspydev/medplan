-- =============================================================================
-- MedPlan | Row-Level Security
--
-- Isolamento de tenant no banco, não na aplicação. Um bug de WHERE esquecido
-- na API não deve conseguir vazar dado de outro hospital.
--
-- A aplicação conecta como `medplan_app` e, a cada transação, executa:
--     SET LOCAL app.hospital_id = '<id do hospital do usuário autenticado>';
-- `SET LOCAL` (e não `SET`) é obrigatório: o valor morre no fim da transação
-- e não vaza para a próxima requisição que pegar a mesma conexão do pool.
-- =============================================================================

CREATE ROLE medplan_app NOLOGIN;

-- current_setting(..., true) devolve NULL em vez de erro quando a variável não
-- foi definida. Sem hospital_id definido, nenhuma linha é visível — falha fechado.
CREATE OR REPLACE FUNCTION app_hospital_id() RETURNS BIGINT
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.hospital_id', true), '')::BIGINT $$;

DO $$
DECLARE
    t TEXT;
    tabelas TEXT[] := ARRAY[
        'clinico',
        'paciente_perfil',
        'perfil_comorbidade',
        'prescricao',
        'desfecho_tratamento',
        'consentimento_dados_hospital',
        'audit_log'
    ];
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        -- FORCE: o dono da tabela também fica sujeito à policy.
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I
                 USING (hospital_id = app_hospital_id())
                 WITH CHECK (hospital_id = app_hospital_id())', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO medplan_app', t);
    END LOOP;
END $$;

-- `desfecho_reacao` não tem hospital_id próprio; herda o isolamento do desfecho.
ALTER TABLE desfecho_reacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE desfecho_reacao FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON desfecho_reacao
    USING (EXISTS (SELECT 1 FROM desfecho_tratamento d
                    WHERE d.id = desfecho_reacao.desfecho_id
                      AND d.hospital_id = app_hospital_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM desfecho_tratamento d
                         WHERE d.id = desfecho_reacao.desfecho_id
                           AND d.hospital_id = app_hospital_id()));
GRANT SELECT, INSERT, UPDATE ON desfecho_reacao TO medplan_app;

-- Catálogos de referência são compartilhados: leitura para todos, escrita só por migration.
GRANT SELECT ON faixa_etaria, faixa_imc, cid10, medicamento, reacao_adversa TO medplan_app;
GRANT SELECT ON hospital TO medplan_app;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO medplan_app;
