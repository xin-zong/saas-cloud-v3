DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V38 requires isolated toyingzhen database and owner';
 END IF;
END $$;

-- Append-only observations imported from private read-only screen evidence.
-- They never update station/device identity, telemetry or live connectivity.
CREATE FUNCTION monitor_capture_metrics_valid(document jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT CASE WHEN jsonb_typeof(document)<>'object' THEN false ELSE NOT EXISTS (
  SELECT 1 FROM jsonb_each(document) e WHERE e.key<>ALL(ARRAY[
   'pvCapacity','pvPower','pvNormalization','pvDaily','pvMonthly','pvTotal','pvPeak7','pvPeakMonth','pvPeakYear',
   'pvPrYesterday','pvPr7','pvPrMonth','pvPrYear','pvCompletionMonthBasic','pvCompletionMonthSuperior',
   'pvCompletionYearBasic','pvCompletionYearSuperior','storagePower','storageCapacity','storageSoc',
   'storageDailyCharged','storageDailyDischarged','storageMonthlyCharged','storageMonthlyDischarged',
   'storageTotalCharged','storageTotalDischarged','storageEfficiency']::text[])
   OR jsonb_typeof(e.value) NOT IN ('number','null')
 ) END
$$;
CREATE TABLE monitor_station_capture (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 captured_at timestamptz NOT NULL, source_updated_at timestamptz,
 communication varchar(20) CHECK(communication IN ('online','partial','offline','connecting','unknown')),
 metrics jsonb NOT NULL CHECK(monitor_capture_metrics_valid(metrics)),
 source_host text NOT NULL CHECK(source_host='ess-cloud-login.qudeox.com'),
 source_fingerprint char(64) NOT NULL CHECK(source_fingerprint~'^[0-9a-f]{64}$'),
 UNIQUE(station_id,source_fingerprint)
);
CREATE INDEX monitor_station_capture_latest ON monitor_station_capture(station_id,captured_at DESC,id DESC);
COMMENT ON TABLE monitor_station_capture IS 'Historical reference screen observations in kW/kWh/percent/h; not live telemetry or current communication.';
CREATE TABLE monitor_user_workspace (
 user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 tenant_id bigint NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
 client varchar(3) NOT NULL CHECK(client IN ('web','app')),
 settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(settings)='object'),
 watched_station_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
 version bigint NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,tenant_id,client),
 CHECK(cardinality(watched_station_ids)<=2000 AND array_position(watched_station_ids,NULL) IS NULL)
);
