DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V44 requires isolated toyingzhen database and owner';
 END IF;
END $$;
-- Exact provenance only: never derive station scope from tenant membership.
CREATE TABLE station_audit_event (
 event_id bigint NOT NULL REFERENCES audit_event(id),
 station_id bigint NOT NULL REFERENCES station(id),
 shared_detail boolean NOT NULL DEFAULT false,
 actor_name varchar(120), channel varchar(40), ip_address varchar(64),
 PRIMARY KEY(station_id,event_id)
);
CREATE INDEX station_audit_event_event ON station_audit_event(event_id);
-- station.edit historically emitted exactly station=<id>. No joins through mutable
-- device ownership, JSON guesses, or tenant-wide events qualify for backfill.
INSERT INTO station_audit_event(event_id,station_id)
SELECT a.id,s.id FROM audit_event a JOIN station s ON a.detail='station=' || s.id::text
 AND a.target_tenant_id=s.tenant_id WHERE a.action='station.edit';
COMMENT ON TABLE station_audit_event IS 'Explicit station audit provenance; absent IP/group/location is unknown, not inferred';
