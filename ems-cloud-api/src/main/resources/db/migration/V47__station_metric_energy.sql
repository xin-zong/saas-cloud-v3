DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V47 requires isolated toyingzhen database and owner';
 END IF;
END $$;
CREATE TABLE station_metric_source (
 station_id bigint NOT NULL REFERENCES station(id),metric_key varchar(40) NOT NULL,
 mode varchar(10) NOT NULL CHECK(mode IN ('DYNAMIC','STATIC')),
 point_id bigint REFERENCES measurement_point(id) ON DELETE RESTRICT,
 version bigint NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(station_id,metric_key),CHECK(mode='STATIC' OR point_id IS NULL)
);
CREATE TABLE station_energy_offset (
 station_id bigint NOT NULL REFERENCES station(id),metric_key varchar(40) NOT NULL,
 kind varchar(10) NOT NULL CHECK(kind IN ('DAILY','TOTAL')),offset_date date NOT NULL,
 value numeric(10,2) NOT NULL CHECK(value BETWEEN -99999999.99 AND 99999999.99),
 reason varchar(500) NOT NULL CHECK(length(trim(reason))>0),version bigint NOT NULL CHECK(version>0),
 active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(station_id,metric_key,kind,offset_date),CHECK(kind='DAILY' OR offset_date=DATE '1970-01-01')
);
CREATE TABLE station_metric_job (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,station_id bigint NOT NULL REFERENCES station(id),
 from_date date NOT NULL,to_date date NOT NULL,status varchar(15) NOT NULL CHECK(status IN ('running','completed')),
 missing_days integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(to_date>=from_date AND to_date-from_date<31)
);
CREATE INDEX station_metric_job_station ON station_metric_job(station_id,id DESC);
CREATE TABLE station_metric_result (
 station_id bigint NOT NULL REFERENCES station(id),metric_key varchar(40) NOT NULL,
 period varchar(8) NOT NULL CHECK(period IN ('DAY','MONTH','YEAR')),period_start date NOT NULL,
 raw_value numeric,corrected_value numeric,daily_offset numeric NOT NULL,total_offset numeric NOT NULL,calibrated_total numeric,
 complete_days integer NOT NULL,expected_days integer NOT NULL,
 status varchar(15) NOT NULL CHECK(status IN ('complete','missing')),missing_reason text,
 source_version bigint NOT NULL,resolved_point_id bigint,calculation_timezone varchar(100) NOT NULL,job_id bigint NOT NULL REFERENCES station_metric_job(id),
 PRIMARY KEY(station_id,metric_key,period,period_start),
 CHECK(complete_days>=0 AND complete_days<=expected_days),
 CHECK((status='complete' AND raw_value IS NOT NULL AND corrected_value IS NOT NULL AND complete_days=expected_days)
    OR (status='missing' AND raw_value IS NULL AND corrected_value IS NULL AND calibrated_total IS NULL))
);
COMMENT ON TABLE station_metric_result IS 'Local conservative power integral, station calendar timezone including DST. Daily corrections affect flows; TOTAL is added only once to complete month/year calibrated_total. Native ClickHouse history and unreviewed direction/formulas are unsupported. Never modifies raw samples.';
