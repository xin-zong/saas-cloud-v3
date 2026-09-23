-- Execute after apply.sql within its rollback rehearsal, then after the reviewed cutover.
DO $$ BEGIN
 IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF EXISTS(SELECT 1 FROM generate_series(1,9) v WHERE NOT EXISTS(SELECT 1 FROM schema_migration m WHERE m.version=v)) THEN
  RAISE EXCEPTION 'Missing migration';
 END IF;
 IF has_table_privilege('ems_proto_app','user_role','INSERT,UPDATE,DELETE')
 OR has_table_privilege('ems_proto_app','user_station','INSERT,UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Legacy authorization tables remain writable';
 END IF;
 IF NOT has_table_privilege('ems_proto_app','user_role','SELECT')
 OR NOT has_table_privilege('ems_proto_app','user_station','SELECT') THEN
  RAISE EXCEPTION 'Legacy comparison history unavailable';
 END IF;
 IF has_table_privilege('ems_proto_app','audit_event','UPDATE,DELETE') THEN
  RAISE EXCEPTION 'Audit history is mutable';
 END IF;
END $$;
SELECT 'permission cutover privileges: PASS' result;
