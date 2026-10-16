-- Private inventory provenance, deliberately separate from live observations/bindings.
DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'reference device import requires isolated database and owner';
 END IF;
END $$;

CREATE TABLE device_reference_profile (
 device_id bigint PRIMARY KEY REFERENCES device(id) ON DELETE RESTRICT,
 source_type varchar(100) NOT NULL CHECK(btrim(source_type)<>''),
 category varchar(30) NOT NULL CHECK(category IN ('BMS','BESS','PCS','HVAC','MTR','FSS','PV','OTHER')),
 manufacturer varchar(120), model varchar(120),
 rated_power_kw numeric(14,3) CHECK(rated_power_kw>=0),
 capacity_kwh numeric(14,3) CHECK(capacity_kwh>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE device_reference_import (
 source_host varchar(200) NOT NULL CHECK(source_host='ess-cloud-login.qudeox.com'),
 source_key varchar(64) NOT NULL CHECK(source_key~'^[0-9a-f]{64}$'),
 device_id bigint NOT NULL UNIQUE REFERENCES device(id) ON DELETE RESTRICT,
 station_source_id varchar(200) NOT NULL,
 content_hash varchar(64) NOT NULL CHECK(content_hash~'^[0-9a-f]{64}$'),
 provenance jsonb NOT NULL CHECK(jsonb_typeof(provenance)='object'),
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_host,source_key),
 FOREIGN KEY(source_host,station_source_id) REFERENCES station_reference_import(source_host,source_id) ON DELETE RESTRICT
);
COMMENT ON TABLE device_reference_import IS 'Private source inventory evidence only; never grants connectivity, commands or current telemetry.';
