DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V57 requires isolated toyingzhen database and owner';
 END IF;
END $$;
ALTER TABLE alarm_rule_config ADD COLUMN auto_recovery_duration_hours smallint NOT NULL DEFAULT 48 CHECK(auto_recovery_duration_hours BETWEEN 1 AND 72);
COMMENT ON COLUMN alarm_rule_config.auto_recovery_duration_hours IS 'Saved default auto-recovery window in integer hours; execution not connected. Independent of recovery_duration consecutive normal-sampling seconds.';
