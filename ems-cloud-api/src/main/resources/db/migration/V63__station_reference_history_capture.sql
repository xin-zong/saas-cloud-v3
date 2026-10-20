DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V63 requires isolated database and owner';
 END IF;
END $$;
CREATE TABLE station_reference_history_capture (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 source_host varchar(200) NOT NULL CHECK(source_host='ess-cloud-login.qudeox.com'),
 source_id varchar(200) NOT NULL,
 period text NOT NULL CHECK(period IN ('day','month','year','total')),
 period_key text NOT NULL,
 timezone text NOT NULL CHECK(length(timezone) BETWEEN 1 AND 100),
 captured_at timestamptz NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 evidence_sha256 char(64) NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 source_url text NOT NULL,
 FOREIGN KEY(source_host,source_id) REFERENCES station_reference_import(source_host,source_id),
 UNIQUE(station_id,period,period_key,evidence_sha256),
 CHECK(source_url='https://ess-cloud-login.qudeox.com/station-s/station/statistic/history/'||period||'/'||source_id),
 CHECK((period='day' AND period_key~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR (period='month' AND period_key~'^[0-9]{4}-[0-9]{2}$') OR (period='year' AND period_key~'^[0-9]{4}$') OR (period='total' AND period_key~'^[0-9]{4}:[0-9]{4}$'))
);
CREATE INDEX ON station_reference_history_capture(station_id,period,period_key,captured_at DESC,id DESC);
CREATE FUNCTION guard_station_history_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Station history captures are append only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM station_reference_import i JOIN station s ON s.id=i.station_id WHERE i.source_host=NEW.source_host AND i.source_id=NEW.source_id AND i.station_id=NEW.station_id AND s.archived_at IS NULL) THEN RAISE EXCEPTION 'Station history provenance mismatch'; END IF;
 IF NEW.captured_at>now() THEN RAISE EXCEPTION 'Future capture timestamp'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER station_history_capture_guard BEFORE INSERT OR UPDATE OR DELETE ON station_reference_history_capture FOR EACH ROW EXECUTE FUNCTION guard_station_history_capture();
COMMENT ON TABLE station_reference_history_capture IS 'Append-only verified station history responses; no inferred device aggregates or seeded curves.';
