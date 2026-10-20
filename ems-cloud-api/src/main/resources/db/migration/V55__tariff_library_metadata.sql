DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V55 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
CREATE TABLE tariff_library_metadata (
 template_id uuid NOT NULL,
 version bigint NOT NULL,
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 site_type text NOT NULL CHECK(site_type IN ('COMMERCIAL_INDUSTRIAL_ROOF','HOUSE_ROOF')),
 price_type text NOT NULL CHECK(price_type='purchase'),
 country text NOT NULL CHECK(country='ES'),
 area text NOT NULL CHECK(area='all'),
 valid_from date NOT NULL,
 valid_until date NOT NULL CHECK(valid_until>valid_from),
 demand_price numeric(14,6),capacity_price numeric(14,6),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(template_id,version),
 FOREIGN KEY(template_id,version) REFERENCES tariff_template_version(template_id,version),
 FOREIGN KEY(tenant_id,template_id) REFERENCES tariff_template(tenant_id,id)
);
-- Generic template edits continue publishing proper immutable price versions. Carry applicability
-- forward; the library editor may replace only the newly published, unbound version in its transaction.
CREATE FUNCTION tariff_library_copy_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO tariff_library_metadata(template_id,version,tenant_id,site_type,price_type,country,area,valid_from,valid_until,demand_price,capacity_price,created_at)
 SELECT NEW.template_id,NEW.version,NEW.tenant_id,site_type,price_type,country,area,valid_from,valid_until,demand_price,capacity_price,created_at
 FROM tariff_library_metadata WHERE template_id=NEW.template_id AND version=NEW.version-1;
 IF EXISTS(SELECT 1 FROM tariff_library_metadata m JOIN tariff t ON t.id=NEW.tariff_id WHERE m.template_id=NEW.template_id AND m.version=NEW.version AND t.currency<>'EUR') THEN
  RAISE EXCEPTION 'library country and currency mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tariff_library_copy AFTER INSERT ON tariff_template_version FOR EACH ROW EXECUTE FUNCTION tariff_library_copy_metadata();
CREATE FUNCTION tariff_library_metadata_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (NEW.template_id,NEW.version,NEW.tenant_id) IS DISTINCT FROM (OLD.template_id,OLD.version,OLD.tenant_id)
 OR EXISTS(SELECT 1 FROM station_tariff WHERE template_id=OLD.template_id AND template_version=OLD.version) THEN
  RAISE EXCEPTION 'bound tariff metadata is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tariff_library_metadata_immutable BEFORE UPDATE OR DELETE ON tariff_library_metadata FOR EACH ROW EXECUTE FUNCTION tariff_library_metadata_guard();
CREATE TABLE tariff_automatic_catalog (
 code text PRIMARY KEY,source text NOT NULL,country text NOT NULL,area text NOT NULL,postal_code text NOT NULL,currency text NOT NULL,
 is_mock boolean NOT NULL DEFAULT true CHECK(is_mock),live_connected boolean NOT NULL DEFAULT false CHECK(NOT live_connected)
);
INSERT INTO tariff_automatic_catalog(code,source,country,area,postal_code,currency)
 VALUES('10YES-REE------0','entsoe','ES','all','all','EUR') ON CONFLICT(code) DO NOTHING;
COMMENT ON TABLE tariff_automatic_catalog IS 'Development catalog metadata only; no prices, live feed, subscription, or station binding.';

