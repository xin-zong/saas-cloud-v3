DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V68 isolated database required';
 END IF;
END $$;

ALTER TABLE company_application ADD COLUMN language varchar(10) NOT NULL DEFAULT 'en'
 CHECK(language IN ('en','zh-CN'));
