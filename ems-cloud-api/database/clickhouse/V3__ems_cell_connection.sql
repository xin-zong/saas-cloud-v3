-- Deployed V1/V2 are immutable. Legacy cells have no trustworthy connection identity.
ALTER TABLE ems_cloud_v2_proto_telemetry.ems_cell
    ADD COLUMN IF NOT EXISTS connection_id Nullable(UUID);
-- Recreate the read projection explicitly so the new provenance is present on all CH versions.
CREATE OR REPLACE VIEW ems_cloud_v2_proto_telemetry.ems_cell_final AS
    SELECT * FROM ems_cloud_v2_proto_telemetry.ems_cell FINAL;
