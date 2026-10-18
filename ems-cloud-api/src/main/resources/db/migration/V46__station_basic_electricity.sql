DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V46 requires isolated toyingzhen database and owner';
 END IF;
END $$;
CREATE TABLE station_basic_electricity (
 station_id bigint PRIMARY KEY REFERENCES station(id),
 price_policy text NOT NULL CHECK(price_policy IN ('single','two-part')),
 price_type text CHECK(price_type IN ('capacity','contract-demand','actual-demand')),
 transformer_capacity_kva numeric(7,2),
 contract_demand_kw numeric(7,2),
 consumer_number varchar(50) NOT NULL DEFAULT '',
 version bigint NOT NULL CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(transformer_capacity_kva BETWEEN 0 AND 65535),
 CHECK(contract_demand_kw BETWEEN 0 AND 65535),
 CHECK((price_policy='single' AND price_type IS NULL AND transformer_capacity_kva IS NULL AND contract_demand_kw IS NULL)
 OR (price_policy='two-part' AND price_type IS NOT NULL AND (
 (price_type='capacity' AND transformer_capacity_kva IS NOT NULL AND contract_demand_kw IS NULL)
 OR (price_type='contract-demand' AND contract_demand_kw IS NOT NULL AND transformer_capacity_kva IS NULL)
 OR (price_type='actual-demand' AND transformer_capacity_kva IS NULL AND contract_demand_kw IS NULL))))
);
COMMENT ON TABLE station_basic_electricity IS 'Configuration only; no billing algorithm is connected and saving does not enable or recalculate billing.';
