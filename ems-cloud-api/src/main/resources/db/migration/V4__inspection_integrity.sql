ALTER TABLE inspection ADD CONSTRAINT completed_inspection_has_result
 CHECK(status<>'completed' OR (result IS NOT NULL AND btrim(result)<>''));
