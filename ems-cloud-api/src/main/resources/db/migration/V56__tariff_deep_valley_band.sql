DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V56 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
-- Expand the allowed vocabulary only. Every existing period, price, version and binding is preserved.
ALTER TABLE tariff_period DROP CONSTRAINT IF EXISTS tariff_period_band_check;
ALTER TABLE tariff_period ADD CONSTRAINT tariff_period_band_check
 CHECK(band IN ('peak','flat','valley','superPeak','deepValley'));
COMMENT ON COLUMN tariff_period.band IS 'Distinct sharp, peak, flat, valley and deepValley bands; deepValley is never coerced to valley.';
