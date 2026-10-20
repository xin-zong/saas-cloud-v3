DO $$ BEGIN
 IF current_database() <> 'ems_cloud_saas_toyingzhen' OR current_user <> 'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V52 requires isolated toyingzhen database and owner';
 END IF;
END $$;
ALTER TABLE alarm DROP CONSTRAINT alarm_severity_check;
ALTER TABLE alarm ADD CONSTRAINT alarm_severity_check CHECK(severity IN ('critical','warning','minor','info'));
ALTER TABLE alarm_rule_config DROP CONSTRAINT alarm_rule_config_severity_check;
ALTER TABLE alarm_rule_config ADD CONSTRAINT alarm_rule_config_severity_check CHECK(severity IN ('critical','warning','minor','info'));
