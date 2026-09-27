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
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=10) AS apply_v10 \gset
\if :apply_v10
\ir ../src/main/resources/db/migration/V10__customer_profiles.sql
INSERT INTO schema_migration(version) VALUES(10);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=11) AS apply_v11 \gset
\if :apply_v11
\ir ../src/main/resources/db/migration/V11__ems_ingestion.sql
INSERT INTO schema_migration(version) VALUES(11);
\endif
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=12) AS apply_v12 \gset
\if :apply_v12
\ir ../src/main/resources/db/migration/V12__reliable_alarm_refresh.sql
INSERT INTO schema_migration(version) VALUES(12);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=13) AS apply_v13 \gset
\if :apply_v13
\ir ../src/main/resources/db/migration/V13__telemetry_diagnostic_evidence.sql
INSERT INTO schema_migration(version) VALUES(13);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=14) AS apply_v14 \gset
\if :apply_v14
\ir ../src/main/resources/db/migration/V14__current_alarm_evidence.sql
INSERT INTO schema_migration(version) VALUES(14);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=15) AS apply_v15 \gset
\if :apply_v15
\ir ../src/main/resources/db/migration/V15__ems_api_provenance.sql
INSERT INTO schema_migration(version) VALUES(15);
\endif
SELECT NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=16) AS apply_v16 \gset
\if :apply_v16
\ir ../src/main/resources/db/migration/V16__cabinet_link_current.sql
INSERT INTO schema_migration(version) VALUES(16);
\endif
GRANT USAGE ON SCHEMA public TO ems_proto_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ems_proto_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ems_proto_app;
REVOKE ALL ON schema_migration FROM ems_proto_app;
REVOKE UPDATE,DELETE ON audit_event FROM ems_proto_app;
-- Retain historical relations, but close the old authorization write path after broad grants.
REVOKE INSERT,UPDATE,DELETE ON user_role,user_station FROM ems_proto_app;
-- API reads business snapshots, manages bindings, and creates authorized queries.
-- Raw evidence, ACK outbox, leases and connection arbitration are worker-only.
REVOKE ALL ON connection_state,retired_connection,reliable_message,history_sample_identity,ems_alarm_event,outbox FROM ems_proto_app;
REVOKE ALL ON alarm_refresh_demand FROM ems_proto_app;
REVOKE ALL ON telemetry_diagnostic_evidence,structure_refresh_demand FROM ems_proto_app;
GRANT SELECT ON ems_ingestion_status TO ems_proto_app;
GRANT SELECT ON ems_connection_read,ems_alarm_evidence,ems_alarm_business_origin,ems_ingestion_diagnostics,ems_alarm_refresh_read TO ems_proto_app;
GRANT EXECUTE ON FUNCTION ems_invalidate_binding(uuid,bigint) TO ems_proto_app;
GRANT SELECT(ems_uuid,connection_id,last_fresh_heartbeat) ON connection_state TO ems_proto_app;
REVOKE INSERT,UPDATE,DELETE ON structure_revision,structure_acceptance,structure_current,bmu_layout,point_definition,config_revision,config_acceptance,config_current,config_value,ems_alarm_identity,alarm_current_snapshot,alarm_current_member FROM ems_proto_app;
REVOKE UPDATE,DELETE ON query_request FROM ems_proto_app;
REVOKE INSERT,UPDATE,DELETE ON cabinet_link_current FROM ems_proto_app;
GRANT INSERT ON point_definition TO ems_proto_app;
-- Worker identity is provisioned separately; portable migration does not create roles.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ems_ingestion_worker') THEN
  GRANT USAGE ON SCHEMA public TO ems_ingestion_worker;
  GRANT SELECT ON device,station,measurement_kind,measurement_point,ems_gateway,ems_binding_period,device_binding,point_binding,effective_station_permission TO ems_ingestion_worker;
  GRANT SELECT,INSERT,UPDATE,DELETE ON connection_state,retired_connection,structure_revision,structure_acceptance,structure_current,bmu_layout,point_definition,config_revision,config_acceptance,config_current,config_value,reliable_message,history_sample_identity,ems_alarm_identity,ems_alarm_event,alarm_current_snapshot,alarm_current_member,query_request,outbox TO ems_ingestion_worker;
  GRANT SELECT,INSERT,UPDATE ON alarm TO ems_ingestion_worker;
  GRANT SELECT,INSERT,UPDATE ON cabinet_link_current TO ems_ingestion_worker;
  GRANT SELECT ON ems_alarm_evidence,ems_alarm_business_origin TO ems_ingestion_worker;
  GRANT SELECT,INSERT,UPDATE,DELETE ON alarm_refresh_demand TO ems_ingestion_worker;
  GRANT SELECT,INSERT,UPDATE,DELETE ON telemetry_diagnostic_evidence,structure_refresh_demand TO ems_ingestion_worker;
  GRANT USAGE,SELECT ON SEQUENCE alarm_refresh_demand_id_seq TO ems_ingestion_worker;
  GRANT USAGE,SELECT ON SEQUENCE structure_revision_id_seq,point_definition_id_seq,config_revision_id_seq,reliable_message_id_seq,outbox_id_seq,alarm_id_seq TO ems_ingestion_worker;
 END IF;
END $$;
COMMIT;
