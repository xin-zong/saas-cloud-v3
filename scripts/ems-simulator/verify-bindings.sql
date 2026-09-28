-- Read only. Run against ems_cloud_v2_proto after applying generated/bindings.sql twice.
DO $$ BEGIN IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
SELECT db.scope,db.role,count(*) AS current_points
FROM point_binding pb JOIN point_definition pd ON pd.id=pb.definition_id
JOIN device_binding db ON db.id=pb.device_binding_id JOIN ems_binding_period ep ON ep.id=db.binding_period_id
WHERE ep.id=2 AND ep.ems_uuid='4a8be161-7ee9-458f-b412-7d256e64eed9' AND ep.station_id=4
  AND pd.catalog_version='ems-v1-profile-20260917' AND db.valid_to IS NULL AND pb.valid_to IS NULL
  AND db.valid_from<=clock_timestamp() AND pb.valid_from<=clock_timestamp()
GROUP BY db.scope,db.role ORDER BY db.scope,db.role;
-- cabinet emu21,bms99,tms21,dcdc76,pcs58,meter20; ems6. Total301.
SELECT pd.namespace,pd.source_id,pb.measurement_point_id,db.device_id
FROM point_binding pb JOIN point_definition pd ON pd.id=pb.definition_id JOIN device_binding db ON db.id=pb.device_binding_id
WHERE db.binding_period_id=2 AND db.valid_to IS NULL AND pb.valid_to IS NULL
  AND ((pd.namespace='cabinet' AND pd.source_id IN(20018,20021,20023)) OR pd.namespace='ems')
ORDER BY pd.namespace,pd.source_id;
SELECT count(*) AS config_definitions FROM point_definition
WHERE catalog_version='ems-v1-profile-20260917' AND namespace='config';
-- Expected173; config facts only arrive via MQTT EMS frames, never seeded by SQL.
SELECT count(*) AS config_values FROM config_current cc JOIN config_value cv ON cv.revision_id=cc.revision_id
WHERE cc.ems_uuid='4a8be161-7ee9-458f-b412-7d256e64eed9' AND cc.binding_period_id=2;
-- Expected173 after a received EMS frame; reservednull values remain present.
SELECT sc.connection_id,sc.seq,sr.sv,sc.metadata,br.slot,br.voltage_count,br.temperature_count
FROM structure_current sc JOIN structure_revision sr ON sr.id=sc.revision_id
LEFT JOIN bmu_layout br ON br.ems_uuid=sr.ems_uuid AND br.sv=sr.sv AND br.cabinet_no=1
WHERE sc.ems_uuid='4a8be161-7ee9-458f-b412-7d256e64eed9' ORDER BY br.slot;
