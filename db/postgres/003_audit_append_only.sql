-- =============================================================================
-- MedPlan | audit_log append-only
--
-- Duas camadas, de propósito:
--   1. Permissão — a aplicação simplesmente não recebe UPDATE/DELETE.
--   2. Trigger   — barra a operação mesmo que alguém conceda a permissão
--                  por engano numa migration futura.
-- Nenhuma das duas resiste a um superusuário determinado; a garantia forte de
-- inviolabilidade é backup WORM/append-only fora do banco.
-- =============================================================================

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM medplan_app;
GRANT  SELECT, INSERT             ON audit_log TO   medplan_app;

CREATE OR REPLACE FUNCTION audit_log_somente_insercao() RETURNS TRIGGER
    LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log é append-only: % não é permitido', TG_OP;
END $$;

CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_somente_insercao();

CREATE TRIGGER trg_audit_log_sem_truncate
    BEFORE TRUNCATE ON audit_log
    FOR STATEMENT EXECUTE FUNCTION audit_log_somente_insercao();
