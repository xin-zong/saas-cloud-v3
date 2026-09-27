-- No trustworthy record can be reconstructed for legacy ID-only members.
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM alarm_current_snapshot) OR EXISTS(SELECT 1 FROM alarm_current_member) THEN
        RAISE EXCEPTION 'V14 requires empty legacy alarm snapshots; re-observe via authenticated current queries';
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM config_current) THEN
        RAISE EXCEPTION 'V14 requires empty legacy config_current; re-observe authenticated configuration';
    END IF;
END $$;
ALTER TABLE config_current ADD COLUMN ingress_fence ems_counter NOT NULL;
ALTER TABLE config_current ADD COLUMN ingress_order ems_positive_counter NOT NULL;
-- Members now retain last-known records even when a later observation is unknown.
-- Snapshot known=false is the authority for callers; parent/EMS foreign keys remain.
DROP TRIGGER ems_known_alarm_member ON alarm_current_member;
DROP FUNCTION check_ems_known_alarm_member();
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM outbox WHERE type='query' AND attempts>0) THEN
        RAISE EXCEPTION 'V14 requires no legacy attempted queries without a first-attempt timestamp';
    END IF;
END $$;
ALTER TABLE outbox ADD COLUMN first_attempt_at timestamptz;
ALTER TABLE outbox ADD CONSTRAINT query_attempt_time CHECK (
    (first_attempt_at IS NULL OR type='query')
    AND (type<>'query' OR attempts=0 OR first_attempt_at IS NOT NULL)
);
ALTER TABLE alarm_current_snapshot ADD COLUMN content_hash ems_content_hash NOT NULL;
ALTER TABLE alarm_current_member ADD COLUMN record jsonb NOT NULL;
ALTER TABLE alarm_current_member ADD CONSTRAINT current_alarm_record_shape CHECK (
    jsonb_typeof(record)='object'
    AND record ?& ARRAY['alarmId','seq','sv','device','code','level','state','ts']
    AND record->>'alarmId'=alarm_id::text
    AND jsonb_typeof(record->'device')='object'
    AND record->>'code' ~ '^[0-9A-F]{6}$'
    AND record->>'state'='active'
    AND jsonb_typeof(record->'seq')='number'
    AND (record->>'seq')::numeric>0
    AND (record->>'seq')::numeric=trunc((record->>'seq')::numeric)
);
