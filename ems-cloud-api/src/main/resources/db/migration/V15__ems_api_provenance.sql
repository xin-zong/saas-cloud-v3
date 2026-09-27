-- Only normalized, safe evidence is exposed to the API. Raw envelopes remain worker-only.
CREATE VIEW ems_connection_read AS
 SELECT ems_uuid,connection_id,last_fresh_heartbeat,
   connection_id IS NOT NULL AND lease_until>clock_timestamp()
   AND last_fresh_heartbeat<=clock_timestamp()
   AND last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AS reachable
 FROM connection_state;

CREATE VIEW ems_alarm_evidence AS
 SELECT r.ems_uuid,r.alarm_id,r.binding_period_id,r.seq,
   (j.body->>'sv')::numeric AS sv,j.body->>'code' AS code,
   (j.body->>'level')::integer AS level,j.body->>'state' AS state,
   j.body->'device' AS device,r.source_at,r.received_at,'event'::text AS evidence_kind,
   NULL::smallint AS cabinet_no,true AS known
 FROM reliable_message r JOIN ems_alarm_event e ON e.reliable_message_id=r.id
 CROSS JOIN LATERAL (SELECT convert_from(r.raw_payload,'UTF8')::jsonb AS body) j
 UNION ALL
 SELECT m.ems_uuid,m.alarm_id,s.binding_period_id,(m.record->>'seq')::numeric,
   (m.record->>'sv')::numeric,m.record->>'code',(m.record->>'level')::integer,
   m.record->>'state',m.record->'device',to_timestamp((m.record->>'ts')::numeric/1000),
   s.observed_at,CASE WHEN s.known THEN 'current' ELSE 'last_known' END,
   s.cabinet_no,s.known
 FROM alarm_current_member m JOIN alarm_current_snapshot s USING(ems_uuid,cabinet_no,connection_id,seq);

ALTER TABLE ems_alarm_identity ADD COLUMN business_device_binding_id bigint REFERENCES device_binding;
ALTER TABLE ems_alarm_identity ADD CONSTRAINT business_alarm_origin_pair
 CHECK((business_alarm_id IS NULL)=(business_device_binding_id IS NULL));
CREATE FUNCTION check_ems_business_alarm_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.business_alarm_id IS NOT NULL AND
   (NEW.business_alarm_id,NEW.business_device_binding_id) IS DISTINCT FROM
   (OLD.business_alarm_id,OLD.business_device_binding_id) THEN
   RAISE EXCEPTION 'Business alarm origin is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.business_alarm_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM device_binding d JOIN ems_binding_period p ON p.id=d.binding_period_id
   JOIN alarm a ON a.id=NEW.business_alarm_id AND a.device_id=d.device_id
   WHERE d.id=NEW.business_device_binding_id AND p.ems_uuid=NEW.ems_uuid) THEN
   RAISE EXCEPTION 'Business alarm EMS or physical asset mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ems_business_alarm_origin BEFORE INSERT OR UPDATE ON ems_alarm_identity
 FOR EACH ROW EXECUTE FUNCTION check_ems_business_alarm_origin();
CREATE FUNCTION keep_ems_business_alarm_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.business_alarm_id IS NOT NULL THEN
   RAISE EXCEPTION 'Established business alarm origin cannot be deleted' USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER ems_business_alarm_origin_delete BEFORE DELETE ON ems_alarm_identity
 FOR EACH ROW EXECUTE FUNCTION keep_ems_business_alarm_origin();

CREATE VIEW ems_alarm_business_origin AS
 SELECT i.business_alarm_id AS alarm_id,p.station_id,p.id AS binding_period_id,
   i.ems_uuid,i.alarm_id AS external_alarm_id,d.device_id
 FROM ems_alarm_identity i JOIN device_binding d ON d.id=i.business_device_binding_id
 JOIN ems_binding_period p ON p.id=d.binding_period_id;

CREATE FUNCTION check_ems_business_alarm_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.device_id IS DISTINCT FROM OLD.device_id AND EXISTS(
   SELECT 1 FROM ems_alarm_identity WHERE business_alarm_id=OLD.id) THEN
   RAISE EXCEPTION 'EMS business alarm physical asset is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ems_business_alarm_asset BEFORE UPDATE OF device_id ON alarm
 FOR EACH ROW EXECUTE FUNCTION check_ems_business_alarm_asset();

CREATE VIEW ems_ingestion_diagnostics AS
 SELECT binding_period_id,reason,count(*) AS retained_samples,max(received_at) AS last_received_at
 FROM telemetry_diagnostic_evidence GROUP BY binding_period_id,reason;
CREATE VIEW ems_alarm_refresh_read AS
 SELECT binding_period_id,cabinet_no,pending FROM alarm_refresh_demand;

-- Close old period -> invalidate -> create new period, under one EMS advisory lock.
-- Schema is pinned below from the migration's trusted current schema, including isolated tests.
CREATE FUNCTION ems_invalidate_binding(target uuid,closed_period bigint) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,78291029));
 IF NOT EXISTS(SELECT 1 FROM ems_binding_period WHERE id=closed_period AND ems_uuid=target
   AND valid_to IS NOT NULL AND valid_to<=clock_timestamp()) OR EXISTS(
   SELECT 1 FROM ems_binding_period WHERE ems_uuid=target AND valid_to IS NULL) THEN
   RAISE EXCEPTION 'Only a closed EMS period without a replacement may be invalidated' USING ERRCODE='23514';
 END IF;
 INSERT INTO retired_connection(ems_uuid,ingress_generation,connection_id,retired_at)
 SELECT ems_uuid,ingress_generation,connection_id,clock_timestamp() FROM connection_state
 WHERE ems_uuid=target AND connection_id IS NOT NULL ON CONFLICT DO NOTHING;
 UPDATE connection_state SET connection_id=NULL,ingress_generation=NULL,ingress_order=NULL,
   last_fresh_heartbeat=NULL,lease_owner=NULL,lease_until=NULL,fencing_token=fencing_token+1
 WHERE ems_uuid=target;
 UPDATE query_request q SET status=CASE WHEN EXISTS(SELECT 1 FROM outbox o
   WHERE o.query_request_id=q.id AND o.attempts>0) THEN 'unknown' ELSE 'expired' END
 WHERE q.ems_uuid=target AND q.binding_period_id=closed_period AND q.status IN ('pending','sent');
 UPDATE outbox SET status='cancelled',lease_owner=NULL,lease_until=NULL
 WHERE type='query' AND query_request_id IN(SELECT id FROM query_request
   WHERE ems_uuid=target AND binding_period_id=closed_period) AND status IN ('pending','sending','failed');
END $$;
DO $$ BEGIN
 EXECUTE format('ALTER FUNCTION ems_invalidate_binding(uuid,bigint) SET search_path TO %I,pg_temp',current_schema());
END $$;
REVOKE ALL ON FUNCTION ems_invalidate_binding(uuid,bigint) FROM PUBLIC;
