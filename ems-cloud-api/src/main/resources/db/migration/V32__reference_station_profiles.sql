-- Isolated development import metadata; contains no reference business records.
DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'reference station import requires isolated database and owner';
 END IF;
END $$;

CREATE TABLE station_profile (
 station_id bigint PRIMARY KEY REFERENCES station(id) ON DELETE RESTRICT,
 timezone varchar(100), solar_capacity_kw numeric(14,3) CHECK(solar_capacity_kw>=0),
 grid_connection_date date, commissioned_on date,
 country varchar(100), province varchar(120), city varchar(120), postcode varchar(100),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE station_reference_import (
 source_host varchar(200) NOT NULL CHECK(source_host='ess-cloud-login.qudeox.com'),
 source_id varchar(200) NOT NULL CHECK(btrim(source_id)<>''),
 station_id bigint NOT NULL UNIQUE REFERENCES station(id) ON DELETE RESTRICT,
 content_hash varchar(64) NOT NULL CHECK(content_hash~'^[0-9a-f]{64}$'),
 provenance jsonb NOT NULL CHECK(jsonb_typeof(provenance)='object'),
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_host,source_id)
);
COMMENT ON TABLE station_reference_import IS 'Private read-only source evidence and stable local mapping; not device connectivity or telemetry.';
