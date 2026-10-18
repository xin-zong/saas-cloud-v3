DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V40 requires isolated toyingzhen database and owner';
 END IF;
END $$;
-- Source dashboard totals have a reporting boundary independent of station captures.
CREATE TABLE monitor_dashboard_capture (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_host text NOT NULL CHECK(source_host='ess-cloud-login.qudeox.com'),
 captured_at timestamptz NOT NULL,
 source_updated_at timestamptz NOT NULL CHECK(source_updated_at<=captured_at),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 source_fingerprint char(64) NOT NULL UNIQUE CHECK(source_fingerprint~'^[0-9a-f]{64}$')
);
CREATE TABLE monitor_dashboard_capture_station (
 capture_id bigint NOT NULL REFERENCES monitor_dashboard_capture(id) ON DELETE RESTRICT,
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 PRIMARY KEY(capture_id,station_id)
);
CREATE INDEX monitor_dashboard_capture_latest ON monitor_dashboard_capture(captured_at DESC,id DESC);
