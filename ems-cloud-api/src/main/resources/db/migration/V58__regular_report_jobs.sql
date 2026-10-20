DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V58 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
CREATE TABLE regular_report_job (
 id uuid PRIMARY KEY,tenant_id bigint NOT NULL REFERENCES tenant(id),user_id bigint NOT NULL REFERENCES app_user(id),
 category text NOT NULL CHECK(category IN ('regular','production')),
 name varchar(200) NOT NULL CHECK(name=btrim(name) AND char_length(name)>0),
 report_type text NOT NULL CHECK(report_type IN ('daily','monthly','yearly','total','production-day')),
 create_type text NOT NULL DEFAULT 'M' CHECK(create_type IN ('M','A')),template_id uuid,template_name text NOT NULL,template_snapshot jsonb NOT NULL,
 station_ids bigint[] NOT NULL CHECK(cardinality(station_ids) BETWEEN 1 AND 200 AND array_position(station_ids,NULL) IS NULL),
 from_date date NOT NULL,to_date date NOT NULL CHECK(to_date>=from_date),language text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','completed','failed')),
 progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),error_code text,error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 columns jsonb NOT NULL DEFAULT '[]',preview_rows jsonb NOT NULL DEFAULT '[]',notes jsonb NOT NULL DEFAULT '[]',
 artifact bytea,deleted_at timestamptz,version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((status='completed' AND artifact IS NOT NULL AND octet_length(artifact)>0 AND progress=100) OR (status<>'completed' AND artifact IS NULL)),
 CHECK(artifact IS NULL OR octet_length(artifact)<=8388608)
);
CREATE INDEX regular_report_job_owner ON regular_report_job(tenant_id,user_id,created_at DESC,id) WHERE deleted_at IS NULL;
COMMENT ON TABLE regular_report_job IS 'Private manual generation records; real artifacts only, explicit persisted failures for unavailable generators; no scheduled/external execution.';

