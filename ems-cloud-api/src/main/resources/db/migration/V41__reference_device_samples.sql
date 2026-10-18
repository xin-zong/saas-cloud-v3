DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V41 requires isolated toyingzhen database and owner';
 END IF;
END $$;
-- Imported observations never enter the live telemetry/alarm evaluation pipeline.
CREATE TABLE reference_device_point (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id bigint NOT NULL REFERENCES device(id),
 name text NOT NULL,
 unit text NOT NULL DEFAULT '',
 source_host text NOT NULL CHECK(source_host='ess-cloud-login.qudeox.com'),
 UNIQUE(device_id,name,unit)
);
CREATE TABLE reference_device_sample (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 point_id bigint NOT NULL REFERENCES reference_device_point(id),
 source_at timestamptz NOT NULL,
 captured_at timestamptz NOT NULL CHECK(captured_at>=source_at),
 value numeric,
 raw_value text NOT NULL,
 quality text NOT NULL CHECK(quality IN ('observed','missing','text')),
 source_url text NOT NULL CHECK(source_url LIKE 'https://ess-cloud-login.qudeox.com/%'),
 evidence_sha256 char(64) NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 CHECK((quality='observed' AND value IS NOT NULL) OR (quality<>'observed' AND value IS NULL)),
 UNIQUE(point_id,source_at,evidence_sha256)
);
CREATE INDEX reference_device_sample_latest ON reference_device_sample(point_id,source_at DESC,captured_at DESC,id DESC);
