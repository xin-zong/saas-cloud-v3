-- Run only against the new database named below. No dimension copies or rollup tables.
CREATE TABLE ems_cloud_v2_proto_telemetry.measurement_sample
(
 point_id UInt64,
 sampled_at DateTime64(3,'UTC'),
 value Float64,
 revision UInt64,
 CONSTRAINT positive_point CHECK point_id>0,
 CONSTRAINT positive_revision CHECK revision>0,
 CONSTRAINT finite_value CHECK isFinite(value)
)
ENGINE=ReplacingMergeTree(revision)
PARTITION BY toYYYYMM(sampled_at)
ORDER BY(point_id,sampled_at);

-- All queries use FINAL so duplicate observations are deduplicated before aggregation.
-- Controlled imports must use monotonically increasing revision for corrections.
-- Runtime user is SELECT-only; this service has no external telemetry write endpoint.
