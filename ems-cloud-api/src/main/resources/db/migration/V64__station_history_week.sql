DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V64 requires isolated database and owner';
 END IF;
END $$;
ALTER TABLE station_reference_history_capture DROP CONSTRAINT station_reference_history_capture_period_check;
ALTER TABLE station_reference_history_capture ADD CONSTRAINT station_reference_history_capture_period_check CHECK(period IN ('day','week','month','year','total'));
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='station_reference_history_capture'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%period_key%' LOOP
  EXECUTE format('ALTER TABLE station_reference_history_capture DROP CONSTRAINT %I',item.conname);
 END LOOP;
END $$;
ALTER TABLE station_reference_history_capture ADD CONSTRAINT station_history_period_key_check CHECK(
 (period IN ('day','week') AND period_key~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
 (period='month' AND period_key~'^[0-9]{4}-[0-9]{2}$') OR
 (period='year' AND period_key~'^[0-9]{4}$') OR
 (period='total' AND period_key~'^[0-9]{4}:[0-9]{4}$'));
CREATE TABLE station_history_mock_dataset (
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 dataset_id text NOT NULL,
 dataset_version integer NOT NULL CHECK(dataset_version>0),
 period text NOT NULL CHECK(period IN ('day','week','month','year')),
 period_key text NOT NULL,
 timezone text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 PRIMARY KEY(station_id,dataset_id,dataset_version,period,period_key)
);
COMMENT ON TABLE station_history_mock_dataset IS 'Explicit isolated chart demonstration data; never canonical telemetry or reference captures. Real captures take precedence.';
