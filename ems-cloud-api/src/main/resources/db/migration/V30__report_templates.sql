DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V30 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
CREATE TABLE report_template (
 id uuid PRIMARY KEY,
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 name varchar(50) NOT NULL CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 50),
 kind varchar(20) NOT NULL CHECK(kind IN ('operations','revenue','health')),
 time_type varchar(10) NOT NULL CHECK(time_type IN ('day','month','year','range')),
 fields text[] NOT NULL CHECK(cardinality(fields)>=4 AND array_position(fields,NULL) IS NULL),
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE UNIQUE INDEX report_template_personal_name ON report_template(tenant_id,user_id,lower(name));
CREATE FUNCTION report_template_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.tenant_id,NEW.user_id,NEW.kind,NEW.schema_version) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.user_id,OLD.kind,OLD.schema_version) THEN
  RAISE EXCEPTION 'report template identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_template_identity BEFORE UPDATE ON report_template FOR EACH ROW EXECUTE FUNCTION report_template_identity_guard();
ALTER TABLE analysis_job ADD COLUMN template_snapshot jsonb;
CREATE FUNCTION analysis_job_template_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot THEN
  RAISE EXCEPTION 'report job template snapshot is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER analysis_job_template_immutable BEFORE UPDATE ON analysis_job FOR EACH ROW EXECUTE FUNCTION analysis_job_template_guard();
