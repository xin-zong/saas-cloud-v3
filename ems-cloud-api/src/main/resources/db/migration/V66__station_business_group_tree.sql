DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN RAISE EXCEPTION 'V66 isolated database required'; END IF;
END $$;
CREATE TABLE station_business_group_dataset (
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 dataset_id varchar(100) NOT NULL CHECK(length(trim(dataset_id))>0),
 dataset_version integer NOT NULL CHECK(dataset_version>0),
 source varchar(30) NOT NULL CHECK(source IN ('reference-observed','local-config')),
 evidence_ref varchar(200) NOT NULL CHECK(length(trim(evidence_ref))>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,dataset_id,dataset_version)
);
CREATE TABLE station_business_group (
 tenant_id bigint NOT NULL,
 dataset_id varchar(100) NOT NULL,
 dataset_version integer NOT NULL,
 id varchar(100) NOT NULL CHECK(length(trim(id))>0),
 parent_id varchar(100),
 name varchar(160) NOT NULL CHECK(length(trim(name))>0),
 kind varchar(16) NOT NULL CHECK(kind IN ('group','project')),
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,dataset_id,dataset_version,id),
 FOREIGN KEY(tenant_id,dataset_id,dataset_version) REFERENCES station_business_group_dataset(tenant_id,dataset_id,dataset_version) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,dataset_id,dataset_version,parent_id) REFERENCES station_business_group(tenant_id,dataset_id,dataset_version,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(id IS DISTINCT FROM parent_id)
);
ALTER TABLE station ADD CONSTRAINT station_id_tenant_for_business_group UNIQUE(id,tenant_id);
CREATE TABLE station_business_group_station (
 tenant_id bigint NOT NULL,
 dataset_id varchar(100) NOT NULL,
 dataset_version integer NOT NULL,
 group_id varchar(100) NOT NULL,
 station_id bigint NOT NULL,
 PRIMARY KEY(tenant_id,dataset_id,dataset_version,group_id,station_id),
 FOREIGN KEY(tenant_id,dataset_id,dataset_version,group_id) REFERENCES station_business_group(tenant_id,dataset_id,dataset_version,id) ON DELETE RESTRICT,
 FOREIGN KEY(station_id,tenant_id) REFERENCES station(id,tenant_id) ON DELETE RESTRICT
);
CREATE FUNCTION station_business_group_cycle_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(78291066);
 IF NEW.parent_id IS NOT NULL AND EXISTS (
  WITH RECURSIVE ancestors AS (
   SELECT id,parent_id FROM station_business_group WHERE tenant_id=NEW.tenant_id AND dataset_id=NEW.dataset_id AND dataset_version=NEW.dataset_version AND id=NEW.parent_id
   UNION
   SELECT g.id,g.parent_id FROM station_business_group g JOIN ancestors a ON g.id=a.parent_id WHERE g.tenant_id=NEW.tenant_id AND g.dataset_id=NEW.dataset_id AND g.dataset_version=NEW.dataset_version
  ) SELECT 1 FROM ancestors WHERE id=NEW.id
 ) THEN RAISE EXCEPTION 'business group cycle' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER station_business_group_cycle AFTER INSERT OR UPDATE ON station_business_group DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION station_business_group_cycle_guard();
COMMENT ON TABLE station_business_group IS 'Immutable tenant-local observed or configured business scope nodes; membership never grants station access.';

