ALTER TABLE market_service DROP CONSTRAINT market_service_status_check;
ALTER TABLE market_service ADD CONSTRAINT market_service_status_check
 CHECK(status IN ('draft','submitted','confirmed','running','completed','cancelled','withdrawn'));
