-- Additive, idempotent production protection against accidental structural
-- data loss. This intentionally does not run as a Prisma migration: a fresh
-- disposable database must remain rebuildable, while production must require
-- this independently managed guard before any migration is allowed to run.

CREATE OR REPLACE FUNCTION public.prevent_production_destructive_ddl_start()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_TAG IN (
    'DROP SCHEMA',
    'DROP TABLE',
    'DROP FOREIGN TABLE',
    'DROP MATERIALIZED VIEW',
    'DROP SEQUENCE',
    'DROP OWNED',
    'DROP EXTENSION'
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '55000',
        MESSAGE = 'PRODUCTION_DESTRUCTIVE_DDL_BLOCKED',
        DETAIL = format('Refusing production command %s.', TG_TAG),
        HINT = 'Use a reviewed expand-contract migration. A deliberate emergency restore requires a separately approved break-glass procedure.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_production_data_definition_loss()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  dropped_object record;
BEGIN
  FOR dropped_object IN
    SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF dropped_object.is_temporary THEN
      CONTINUE;
    END IF;

    IF (
      dropped_object.object_type = 'schema'
      AND dropped_object.object_identity = 'public'
    ) OR (
      dropped_object.schema_name = 'public'
      AND dropped_object.object_type IN (
        'table',
        'table column',
        'partitioned table',
        'foreign table',
        'materialized view',
        'sequence'
      )
    ) THEN
      RAISE EXCEPTION
        USING
          ERRCODE = '55000',
          MESSAGE = 'PRODUCTION_DATA_DEFINITION_LOSS_BLOCKED',
          DETAIL = format(
            'Refusing to remove protected %s %s.',
            dropped_object.object_type,
            dropped_object.object_identity
          ),
          HINT = 'Use a reviewed expand-contract migration. A deliberate emergency restore requires a separately approved break-glass procedure.';
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'protect_production_destructive_ddl_start'
  ) THEN
    EXECUTE $create_start_trigger$
      CREATE EVENT TRIGGER protect_production_destructive_ddl_start
      ON ddl_command_start
      EXECUTE FUNCTION public.prevent_production_destructive_ddl_start()
    $create_start_trigger$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'protect_production_data_definition'
  ) THEN
    EXECUTE $create_trigger$
      CREATE EVENT TRIGGER protect_production_data_definition
      ON sql_drop
      EXECUTE FUNCTION public.prevent_production_data_definition_loss()
    $create_trigger$;
  END IF;
END;
$$;

ALTER EVENT TRIGGER protect_production_destructive_ddl_start ENABLE ALWAYS;
ALTER EVENT TRIGGER protect_production_data_definition ENABLE ALWAYS;

CREATE OR REPLACE FUNCTION public.block_production_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    USING
      ERRCODE = '55000',
      MESSAGE = 'PRODUCTION_TRUNCATE_BLOCKED',
      DETAIL = format('Refusing to truncate protected table %I.%I.', TG_TABLE_SCHEMA, TG_TABLE_NAME),
      HINT = 'Use normal application deletes. A deliberate emergency restore requires a separately approved break-glass procedure.';
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_production_truncate_guard()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  created_object record;
  relation_schema text;
  relation_name text;
BEGIN
  FOR created_object IN
    SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF created_object.object_type NOT IN ('table', 'partitioned table') THEN
      CONTINUE;
    END IF;

    SELECT namespace.nspname, relation.relname
    INTO relation_schema, relation_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE relation.oid = created_object.objid;

    IF relation_schema = 'public' AND NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = created_object.objid
        AND tgname = 'protect_production_truncate'
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER protect_production_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION public.block_production_truncate()',
        relation_schema,
        relation_name
      );
      EXECUTE format(
        'ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER protect_production_truncate',
        relation_schema,
        relation_name
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  protected_relation record;
BEGIN
  FOR protected_relation IN
    SELECT relation.oid, namespace.nspname, relation.relname
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = protected_relation.oid
        AND tgname = 'protect_production_truncate'
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER protect_production_truncate BEFORE TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION public.block_production_truncate()',
        protected_relation.nspname,
        protected_relation.relname
      );
    END IF;
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ALWAYS TRIGGER protect_production_truncate',
      protected_relation.nspname,
      protected_relation.relname
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_event_trigger
    WHERE evtname = 'protect_new_production_tables'
  ) THEN
    EXECUTE $create_table_trigger$
      CREATE EVENT TRIGGER protect_new_production_tables
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS')
      EXECUTE FUNCTION public.attach_production_truncate_guard()
    $create_table_trigger$;
  END IF;
END;
$$;

ALTER EVENT TRIGGER protect_new_production_tables ENABLE ALWAYS;

COMMENT ON EVENT TRIGGER protect_production_destructive_ddl_start IS
  'Blocks destructive production DDL before it can remove the sql_drop guard itself.';

COMMENT ON EVENT TRIGGER protect_production_data_definition IS
  'Blocks accidental removal of the production public schema, tables, columns, materialized views, and sequences.';

COMMENT ON EVENT TRIGGER protect_new_production_tables IS
  'Adds an always-enabled BEFORE TRUNCATE guard to every new public table.';
