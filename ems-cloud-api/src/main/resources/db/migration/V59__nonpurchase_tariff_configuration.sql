DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V59 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
-- Configuration only. These IDs deliberately cannot reference tariff_template or station_tariff.
CREATE TABLE tariff_configuration (
 id uuid PRIMARY KEY, tenant_id bigint NOT NULL REFERENCES tenant(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 50),
 price_type text NOT NULL CHECK(price_type IN ('sell','subsidy','selfUse')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_by bigint NOT NULL REFERENCES app_user(id),created_at timestamptz NOT NULL DEFAULT now(),
 archived boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX tariff_configuration_active_name ON tariff_configuration(tenant_id,lower(name)) WHERE NOT archived;
CREATE TABLE tariff_configuration_version (
 configuration_id uuid NOT NULL,tenant_id bigint NOT NULL,version bigint NOT NULL CHECK(version>0),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 50),currency text NOT NULL CHECK(currency='EUR'),pricing_mode text NOT NULL CHECK(pricing_mode IN ('fixed','tou')),
 periods jsonb NOT NULL CHECK(jsonb_typeof(periods)='array' AND jsonb_array_length(periods) BETWEEN 1 AND 96),
 site_type text NOT NULL CHECK(site_type IN ('COMMERCIAL_INDUSTRIAL_ROOF','HOUSE_ROOF')),
 country text NOT NULL CHECK(country='ES'),area text NOT NULL CHECK(area='all'),
 valid_from date NOT NULL,valid_until date NOT NULL CHECK(valid_until>valid_from),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(configuration_id,version),
 FOREIGN KEY(tenant_id,configuration_id) REFERENCES tariff_configuration(tenant_id,id)
);
CREATE FUNCTION tariff_configuration_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'tariff configuration versions are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER tariff_configuration_version_guard BEFORE UPDATE OR DELETE ON tariff_configuration_version FOR EACH ROW EXECUTE FUNCTION tariff_configuration_version_immutable();
COMMENT ON TABLE tariff_configuration IS 'Manual nonpurchase configuration only; no settlement, purchase binding, external feed or execution.';
