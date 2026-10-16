-- This branch must never migrate either legacy business database.
DO $$ BEGIN
  IF current_database() <> 'ems_cloud_saas_toyingzhen' THEN
    RAISE EXCEPTION 'V26 requires ems_cloud_saas_toyingzhen';
  END IF;
  IF current_user <> 'ems_toyingzhen_owner' THEN
    RAISE EXCEPTION 'V26 requires ems_toyingzhen_owner';
  END IF;
END $$;

CREATE TABLE station_tag (
  id uuid PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
  created_by bigint NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  name varchar(50) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50 AND name=btrim(name)),
  description varchar(500) NOT NULL DEFAULT '',
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id)
);
CREATE UNIQUE INDEX station_tag_tenant_name_unique ON station_tag(tenant_id,lower(name));

CREATE TABLE station_tag_link (
  station_id bigint NOT NULL REFERENCES station(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL,
  tenant_id bigint NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
  created_by bigint NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id,tag_id),
  FOREIGN KEY (tenant_id,tag_id) REFERENCES station_tag(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX station_tag_link_tag ON station_tag_link(tag_id);

CREATE FUNCTION station_tag_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'station tag identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER station_tag_identity BEFORE UPDATE ON station_tag
  FOR EACH ROW EXECUTE FUNCTION station_tag_identity_guard();

CREATE FUNCTION station_tag_link_tenant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM station WHERE id=NEW.station_id AND tenant_id=NEW.tenant_id) THEN
    RAISE EXCEPTION 'station tag link tenant mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER station_tag_link_tenant BEFORE INSERT OR UPDATE ON station_tag_link
  FOR EACH ROW EXECUTE FUNCTION station_tag_link_tenant_guard();
