DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V67 isolated database required';
 END IF;
END $$;

-- Directory type reflects any saved observation, including older text/number rows.
-- Match both correlated predicates without scanning a point's entire history.
CREATE INDEX reference_device_sample_point_quality_idx
 ON reference_device_sample(point_id,quality);
