DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V39 requires isolated toyingzhen database and owner';
 END IF;
END $$;
ALTER TABLE monitor_station_capture ADD COLUMN charge_status varchar(20)
 CHECK(charge_status IN ('charging','discharging','idle','unknown'));
CREATE OR REPLACE FUNCTION monitor_capture_metrics_valid(document jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT CASE WHEN jsonb_typeof(document)<>'object' THEN false ELSE NOT EXISTS (
  SELECT 1 FROM jsonb_each(document) e WHERE e.key<>ALL(ARRAY[
   'pvCapacity','pvPower','pvNormalization','pvDaily','pvMonthly','pvTotal','pvPeak7','pvPeakMonth','pvPeakYear',
   'pvPrYesterday','pvPr7','pvPrMonth','pvPrYear','pvCompletionMonthBasic','pvCompletionMonthSuperior',
   'pvCompletionYearBasic','pvCompletionYearSuperior','storagePower','storageCapacity','storageSoc','storageSoh','storageActivePower',
   'storageDailyCharged','storageDailyDischarged','storageMonthlyCharged','storageMonthlyDischarged',
   'storageTotalCharged','storageTotalDischarged','storageEfficiency','storageEfficiency7','storageEfficiencyMonth','storageEfficiencyYear',
   'storageUtilization7','storageUtilizationMonth','storageUtilizationYear']::text[])
   OR jsonb_typeof(e.value) NOT IN ('number','null')
 ) END
$$;
