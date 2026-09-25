-- 14 SEG-08: runtime com app_rw (sem ser dono) e append-only também por privilégio.
-- Condicional: bancos de dev antigos, sem os papéis, continuam migrando.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_rw', current_database());
    GRANT USAGE ON SCHEMA public TO app_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
    -- tabelas futuras criadas pelo dono das migrações; append-only novas precisam do próprio REVOKE
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;

    REVOKE ALL ON "_prisma_migrations" FROM app_rw;
    -- espelha bloquear_mutacao / bloquear_delete (20260924000100_regras); TRUNCATE não dispara trigger de linha
    REVOKE UPDATE, DELETE, TRUNCATE ON sorteio, voto, ata, adesao, evento_auditoria FROM app_rw;
    REVOKE DELETE, TRUNCATE ON obrigacao, pagamento, aviso_compra, aquisicao FROM app_rw;
  END IF;
END $$;
