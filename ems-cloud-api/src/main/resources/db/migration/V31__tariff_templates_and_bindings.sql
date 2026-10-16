-- Isolated manual purchase tariffs only; never assigns ownership to legacy prices or changes bills.
DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V31 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
CREATE TABLE tariff_template (
 id uuid PRIMARY KEY,
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 name varchar(50) NOT NULL CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 50),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 archived boolean NOT NULL DEFAULT false,
 created_by bigint NOT NULL REFERENCES app_user(id),
 UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX tariff_template_tenant_name ON tariff_template(tenant_id,lower(name)) WHERE NOT archived;
CREATE TABLE tariff_template_version (
 template_id uuid NOT NULL,
 tenant_id bigint NOT NULL,
 version bigint NOT NULL CHECK(version>0),
 tariff_id bigint NOT NULL UNIQUE REFERENCES tariff(id),
 pricing_mode varchar(10) NOT NULL CHECK(pricing_mode IN ('fixed','tou')),
 PRIMARY KEY(template_id,version),
 FOREIGN KEY(tenant_id,template_id) REFERENCES tariff_template(tenant_id,id)
);
ALTER TABLE station_tariff ADD COLUMN active boolean NOT NULL DEFAULT true,
 ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN template_id uuid,
 ADD COLUMN template_version bigint,
 ADD CONSTRAINT station_tariff_template_version FOREIGN KEY(template_id,template_version)
  REFERENCES tariff_template_version(template_id,version) MATCH FULL;
-- Replace only the old date exclusion, preserving every existing row and the same [from,until) meaning.
DO $$ DECLARE constraint_name text; BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='station_tariff'::regclass AND contype='x' LOOP
  EXECUTE format('ALTER TABLE station_tariff DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
ALTER TABLE station_tariff ADD CONSTRAINT station_tariff_active_dates
 EXCLUDE USING gist(station_id WITH =,daterange(valid_from,valid_until,'[)') WITH &&) WHERE(active);
CREATE TABLE station_tariff_history (
 binding_id bigint NOT NULL REFERENCES station_tariff(id),
 version bigint NOT NULL,
 station_id bigint NOT NULL REFERENCES station(id),
 tariff_id bigint NOT NULL REFERENCES tariff(id),
 template_id uuid,
 template_version bigint,
 name varchar(120) NOT NULL,
 currency char(3) NOT NULL,
 pricing_mode varchar(10),
 periods jsonb NOT NULL,
 valid_from date NOT NULL,
 valid_until date NOT NULL,
 active boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(binding_id,version),
 FOREIGN KEY(template_id,template_version) REFERENCES tariff_template_version(template_id,version) MATCH FULL,
 CHECK(valid_until>valid_from)
);
CREATE FUNCTION tariff_template_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.archived OR (NEW.id,NEW.tenant_id,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.created_by)
     OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'tariff template identity/archival/version is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tariff_template_identity BEFORE UPDATE ON tariff_template FOR EACH ROW EXECUTE FUNCTION tariff_template_identity_guard();
CREATE FUNCTION tariff_template_publish_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_count integer; start_at integer; end_at integer; total_minutes integer; only_band text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'published tariff versions are immutable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tariff-price:' || NEW.tariff_id::text,0));
 IF EXISTS(SELECT 1 FROM station_tariff WHERE tariff_id=NEW.tariff_id) THEN
  RAISE EXCEPTION 'legacy bound tariffs cannot acquire guessed template ownership' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM tariff_template WHERE id=NEW.template_id AND tenant_id=NEW.tenant_id AND version=NEW.version AND NOT archived) THEN
  RAISE EXCEPTION 'tariff version must match current tenant template identity' USING ERRCODE='23514';
 END IF;
 SELECT count(*),min(start_minute),max(end_minute),sum(end_minute-start_minute),min(band)
  INTO row_count,start_at,end_at,total_minutes,only_band FROM tariff_period WHERE tariff_id=NEW.tariff_id;
 IF row_count NOT BETWEEN 1 AND 96 OR start_at<>0 OR end_at<>1440 OR total_minutes<>1440
     OR (NEW.pricing_mode='fixed' AND (row_count<>1 OR only_band<>'flat')) THEN
  RAISE EXCEPTION 'published tariff periods must cover a complete valid day' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tariff_template_publish BEFORE INSERT OR UPDATE OR DELETE ON tariff_template_version FOR EACH ROW EXECUTE FUNCTION tariff_template_publish_guard();
CREATE FUNCTION tariff_published_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id bigint;
BEGIN
 IF TG_TABLE_NAME='tariff' THEN source_id=OLD.id;
 ELSE source_id=CASE WHEN TG_OP='INSERT' THEN NEW.tariff_id ELSE OLD.tariff_id END;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tariff-price:' || source_id::text,0));
 IF EXISTS(SELECT 1 FROM tariff_template_version WHERE tariff_id=source_id)
     OR EXISTS(SELECT 1 FROM station_tariff WHERE tariff_id=source_id)
     OR EXISTS(SELECT 1 FROM station_tariff_history WHERE tariff_id=source_id) THEN
  RAISE EXCEPTION 'published or historically bound tariff prices are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='tariff_period' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.tariff_id IS DISTINCT FROM OLD.tariff_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tariff-price:' || NEW.tariff_id::text,0));
    IF EXISTS(SELECT 1 FROM tariff_template_version WHERE tariff_id=NEW.tariff_id)
        OR EXISTS(SELECT 1 FROM station_tariff WHERE tariff_id=NEW.tariff_id)
        OR EXISTS(SELECT 1 FROM station_tariff_history WHERE tariff_id=NEW.tariff_id) THEN
     RAISE EXCEPTION 'cannot move periods into a published tariff' USING ERRCODE='23514';
    END IF;
   END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER tariff_price_immutable BEFORE UPDATE OR DELETE ON tariff FOR EACH ROW EXECUTE FUNCTION tariff_published_price_guard();
CREATE TRIGGER tariff_period_price_immutable BEFORE INSERT OR UPDATE OR DELETE ON tariff_period FOR EACH ROW EXECUTE FUNCTION tariff_published_price_guard();
CREATE FUNCTION station_tariff_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_tariff bigint; source_tenant bigint; station_tenant bigint; is_archived boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'tariff bindings must be unbound without deleting history' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tariff-binding:' || NEW.station_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('tariff-price:' || NEW.tariff_id::text,0));
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.station_id,NEW.tariff_id,NEW.template_id,NEW.template_version) IS DISTINCT FROM (OLD.id,OLD.station_id,OLD.tariff_id,OLD.template_id,OLD.template_version)
      OR NOT OLD.active OR NEW.version<>OLD.version+1 THEN
   RAISE EXCEPTION 'tariff binding identity/version is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.valid_from<((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date+1)
      OR NEW.valid_from<((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date+1) THEN
   RAISE EXCEPTION 'effective historical tariff bindings are read only' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.template_id IS NOT NULL THEN
  IF TG_OP='INSERT' AND NEW.valid_from<((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date+1) THEN
   RAISE EXCEPTION 'new template bindings must start tomorrow or later' USING ERRCODE='23514';
  END IF;
  SELECT v.tariff_id,v.tenant_id,t.archived INTO source_tariff,source_tenant,is_archived
   FROM tariff_template_version v JOIN tariff_template t ON t.id=v.template_id
   WHERE v.template_id=NEW.template_id AND v.version=NEW.template_version;
  SELECT tenant_id INTO station_tenant FROM station WHERE id=NEW.station_id;
  IF source_tariff IS DISTINCT FROM NEW.tariff_id OR source_tenant IS DISTINCT FROM station_tenant
      OR (TG_OP='INSERT' AND is_archived) THEN
   RAISE EXCEPTION 'tariff template and binding station must have the same tenant and price identity' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER station_tariff_binding BEFORE INSERT OR UPDATE OR DELETE ON station_tariff FOR EACH ROW EXECUTE FUNCTION station_tariff_binding_guard();
CREATE FUNCTION station_tariff_record_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO station_tariff_history(binding_id,version,station_id,tariff_id,template_id,template_version,name,currency,pricing_mode,periods,valid_from,valid_until,active)
 SELECT NEW.id,NEW.version,NEW.station_id,NEW.tariff_id,NEW.template_id,NEW.template_version,t.name,t.currency,v.pricing_mode,
  coalesce((SELECT jsonb_agg(jsonb_build_object('startMinute',p.start_minute,'endMinute',p.end_minute,'band',p.band,'pricePerKwh',p.price_per_kwh::text) ORDER BY p.start_minute,p.id) FROM tariff_period p WHERE p.tariff_id=NEW.tariff_id),'[]'::jsonb),
  NEW.valid_from,NEW.valid_until,NEW.active
 FROM tariff t LEFT JOIN tariff_template_version v ON v.template_id=NEW.template_id AND v.version=NEW.template_version WHERE t.id=NEW.tariff_id;
 RETURN NEW;
END $$;
CREATE TRIGGER station_tariff_capture AFTER INSERT OR UPDATE ON station_tariff FOR EACH ROW EXECUTE FUNCTION station_tariff_record_history();
-- Snapshot original legacy bindings without inferring a tenant/template identity.
INSERT INTO station_tariff_history(binding_id,version,station_id,tariff_id,template_id,template_version,name,currency,pricing_mode,periods,valid_from,valid_until,active)
SELECT st.id,st.version,st.station_id,st.tariff_id,NULL,NULL,t.name,t.currency,NULL,
 coalesce((SELECT jsonb_agg(jsonb_build_object('startMinute',p.start_minute,'endMinute',p.end_minute,'band',p.band,'pricePerKwh',p.price_per_kwh::text) ORDER BY p.start_minute,p.id) FROM tariff_period p WHERE p.tariff_id=st.tariff_id),'[]'::jsonb),
 st.valid_from,st.valid_until,st.active FROM station_tariff st JOIN tariff t ON t.id=st.tariff_id;
CREATE FUNCTION station_tariff_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'tariff binding history is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER station_tariff_history_immutable BEFORE UPDATE OR DELETE ON station_tariff_history FOR EACH ROW EXECUTE FUNCTION station_tariff_history_guard();
