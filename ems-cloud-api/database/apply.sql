\set ON_ERROR_STOP on
SELECT current_database()='ems_cloud_v2_proto' AS correct_database \gset
\if :correct_database
\else
  \echo 'Refusing to migrate any database except ems_cloud_v2_proto'
  \quit 3
\endif
BEGIN;
SELECT pg_advisory_xact_lock(78291002);
CREATE TABLE IF NOT EXISTS schema_migration(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=1) AS apply_v1 \gset
\if :apply_v1
\ir ../src/main/resources/db/migration/V1__identity_assets.sql
INSERT INTO schema_migration(version) VALUES(1);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=2) AS apply_v2 \gset
\if :apply_v2
\ir ../src/main/resources/db/migration/V2__maintenance_operations.sql
INSERT INTO schema_migration(version) VALUES(2);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=3) AS apply_v3 \gset
\if :apply_v3
\ir ../src/main/resources/db/migration/V3__market_settlement_permissions.sql
INSERT INTO schema_migration(version) VALUES(3);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=4) AS apply_v4 \gset
\if :apply_v4
\ir ../src/main/resources/db/migration/V4__inspection_integrity.sql
INSERT INTO schema_migration(version) VALUES(4);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=5) AS apply_v5 \gset
\if :apply_v5
\ir ../src/main/resources/db/migration/V5__market_draft_withdrawal.sql
INSERT INTO schema_migration(version) VALUES(5);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=6) AS apply_v6 \gset
\if :apply_v6
\ir ../src/main/resources/db/migration/V6__member_grant_schema.sql
INSERT INTO schema_migration(version) VALUES(6);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=7) AS apply_v7 \gset
\if :apply_v7
\ir ../src/main/resources/db/migration/V7__migrate_member_grants.sql
INSERT INTO schema_migration(version) VALUES(7);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=8) AS apply_v8 \gset
\if :apply_v8
\ir ../src/main/resources/db/migration/V8__effective_grant_permissions.sql
INSERT INTO schema_migration(version) VALUES(8);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=9) AS apply_v9 \gset
\if :apply_v9
\ir ../src/main/resources/db/migration/V9__role_management_permission.sql
INSERT INTO schema_migration(version) VALUES(9);
\endif
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ems_proto_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ems_proto_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ems_proto_app;
REVOKE ALL ON schema_migration FROM ems_proto_app;
REVOKE UPDATE,DELETE ON audit_event FROM ems_proto_app;
COMMIT;
