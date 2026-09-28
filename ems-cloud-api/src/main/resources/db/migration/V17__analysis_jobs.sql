-- Requests and selections are normalized; generated immutable documents are shared by all API instances.
CREATE TABLE analysis_job (
 id uuid PRIMARY KEY,
 station_id bigint NOT NULL REFERENCES station(id),
 created_by bigint NOT NULL REFERENCES app_user(id),
 kind varchar(20) NOT NULL CHECK(kind IN ('operations','revenue','health','telemetry')),
 from_at timestamptz NOT NULL, to_at timestamptz NOT NULL,
 minutes integer,
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
 error varchar(300), artifact_id uuid,
 CHECK(to_at>from_at AND to_at-from_at<=interval '366 days'),
 CHECK((kind='telemetry' AND minutes IS NOT NULL AND minutes IN (0,1,5,15,30,60) AND to_at-from_at<=interval '31 days')
   OR (kind<>'telemetry' AND minutes IS NULL)),
 CHECK((status IN ('completed','failed'))=(completed_at IS NOT NULL)),
 CHECK((status='failed')=(error IS NOT NULL)),
 CHECK((status='completed')=(artifact_id IS NOT NULL)),
 CHECK(error IS NULL OR btrim(error)<>'')
);
CREATE INDEX analysis_job_station_created ON analysis_job(station_id,created_at DESC,id);
CREATE TABLE analysis_job_point (
 job_id uuid NOT NULL REFERENCES analysis_job(id),
 point_id bigint NOT NULL REFERENCES measurement_point(id),
 position smallint NOT NULL CHECK(position BETWEEN 0 AND 199),
 PRIMARY KEY(job_id,point_id), UNIQUE(job_id,position)
);
CREATE TABLE analysis_job_artifact (
 id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES analysis_job(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 json_sha256 char(64) NOT NULL CHECK(json_sha256 ~ '^[0-9a-f]{64}$'),
 csv_sha256 char(64) NOT NULL CHECK(csv_sha256 ~ '^[0-9a-f]{64}$'),
 json_bytes integer NOT NULL CHECK(json_bytes BETWEEN 1 AND 16777216),
 csv_bytes integer NOT NULL CHECK(csv_bytes BETWEEN 1 AND 16777216),
 json_content bytea NOT NULL, csv_content bytea NOT NULL,
 CHECK(octet_length(json_content)=json_bytes AND encode(sha256(json_content),'hex')=json_sha256),
 CHECK(octet_length(csv_content)=csv_bytes AND encode(sha256(csv_content),'hex')=csv_sha256),
 UNIQUE(id,job_id)
);
ALTER TABLE analysis_job ADD CONSTRAINT analysis_job_artifact_owner
 FOREIGN KEY(artifact_id,id) REFERENCES analysis_job_artifact(id,job_id);
CREATE FUNCTION keep_analysis_job_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.station_id,NEW.created_by,NEW.kind,NEW.from_at,NEW.to_at,NEW.minutes,NEW.created_at)
   IS DISTINCT FROM (OLD.id,OLD.station_id,OLD.created_by,OLD.kind,OLD.from_at,OLD.to_at,OLD.minutes,OLD.created_at) THEN
   RAISE EXCEPTION 'Analysis job request is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.status='completed' AND NEW IS DISTINCT FROM OLD THEN
   RAISE EXCEPTION 'Completed analysis job is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analysis_job_request_immutable BEFORE UPDATE ON analysis_job
 FOR EACH ROW EXECUTE FUNCTION keep_analysis_job_request();
CREATE FUNCTION keep_analysis_job_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' OR NOT EXISTS(SELECT 1 FROM analysis_job WHERE id=NEW.job_id AND status='pending') THEN
   RAISE EXCEPTION 'Analysis job selection is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analysis_job_selection_immutable BEFORE INSERT OR UPDATE OR DELETE ON analysis_job_point
 FOR EACH ROW EXECUTE FUNCTION keep_analysis_job_selection();
CREATE FUNCTION keep_analysis_job_artifact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Analysis artifacts are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER analysis_job_artifact_immutable BEFORE UPDATE OR DELETE ON analysis_job_artifact
 FOR EACH ROW EXECUTE FUNCTION keep_analysis_job_artifact();
