-- Run with psql and supply a generated password as `backup_password`:
--   psql "$DIRECT_URL" -v backup_password='generated-value' \
--     -f ops/db-backup/create-readonly-role.sql
--
-- This role can read every application row for pg_dump, including rows behind
-- Supabase RLS, but cannot write application data or create schema objects.
-- BYPASSRLS is necessary for a complete administrative backup; it does not
-- grant table DML and every session is additionally read-only by default.

\if :{?backup_password}
\else
  \echo 'backup_password is required'
  \quit 1
\endif

BEGIN;

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qr_menu_backup') THEN
    CREATE ROLE qr_menu_backup;
  END IF;
END
$role$;

ALTER ROLE qr_menu_backup WITH
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  BYPASSRLS
  PASSWORD :'backup_password';
ALTER ROLE qr_menu_backup SET default_transaction_read_only = on;
ALTER ROLE qr_menu_backup SET statement_timeout = '10min';

REVOKE ALL ON DATABASE postgres FROM qr_menu_backup;
GRANT CONNECT ON DATABASE postgres TO qr_menu_backup;
REVOKE ALL ON SCHEMA public FROM qr_menu_backup;
GRANT USAGE ON SCHEMA public TO qr_menu_backup;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM qr_menu_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qr_menu_backup;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM qr_menu_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO qr_menu_backup;

-- Prisma migrations run as postgres. These defaults keep future tables and
-- sequences visible to pg_dump without widening the backup role's privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO qr_menu_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO qr_menu_backup;

COMMIT;
