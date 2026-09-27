-- Run only in ems_cloud_v2_proto_telemetry. Existing measurement_sample is untouched.
-- Exact NUMBER representation is normalized decimal text: no finite Decimal/Float coercion.
CREATE TABLE IF NOT EXISTS ems_cloud_v2_proto_telemetry.ems_observation
(
    fact_id FixedString(64),
    binding_period_id Int64,
    point_id Int64,
    source_message_id FixedString(64),
    source_type LowCardinality(String),
    source_time_kind LowCardinality(String),
    source_at_ms Nullable(Int64),
    received_at_ms Int64,
    quality LowCardinality(String),
    value_kind LowCardinality(String),
    number_exact Nullable(String),
    text_value Nullable(String),
    u16_words Array(UInt16),
    CONSTRAINT observation_kind CHECK value_kind IN ('null','number','text','u16_words'),
    CONSTRAINT observation_number CHECK isNotNull(number_exact) = (value_kind = 'number'),
    CONSTRAINT observation_text CHECK isNotNull(text_value) = (value_kind = 'text'),
    CONSTRAINT observation_words CHECK length(u16_words) = if(value_kind = 'u16_words',4,0),
    CONSTRAINT observation_period CHECK binding_period_id > 0,
    CONSTRAINT observation_point CHECK point_id > 0,
    CONSTRAINT observation_quality CHECK quality IN ('valid','stale','invalid'),
    CONSTRAINT observation_source CHECK source_type IN ('ems','cabinet_30s','cabinet_60s','important_history','alarm_data'),
    CONSTRAINT observation_time CHECK
        (source_time_kind IN ('source', 'archive') AND isNotNull(source_at_ms)) OR
        (source_time_kind = 'unknown' AND isNull(source_at_ms))
)
ENGINE = ReplacingMergeTree()
ORDER BY (binding_period_id, point_id, fact_id);

CREATE TABLE IF NOT EXISTS ems_cloud_v2_proto_telemetry.ems_cell
(
    fact_id FixedString(64),
    binding_period_id Int64,
    cabinet_no UInt8,
    structure_revision_id Int64,
    cell_kind LowCardinality(String),
    source_message_id FixedString(64),
    source_time_kind LowCardinality(String),
    source_at_ms Nullable(Int64),
    received_at_ms Int64,
    quality LowCardinality(String),
    values_present UInt8,
    cell_values Array(Array(Nullable(String))),
    CONSTRAINT cell_presence_flag CHECK values_present IN (0,1),
    CONSTRAINT cell_presence CHECK notEmpty(cell_values) = (values_present = 1),
    CONSTRAINT cell_cabinet CHECK cabinet_no BETWEEN 1 AND 30,
    CONSTRAINT cell_period CHECK binding_period_id > 0,
    CONSTRAINT cell_revision CHECK structure_revision_id > 0,
    CONSTRAINT cell_quality CHECK quality IN ('valid','stale','invalid'),
    CONSTRAINT cell_kind_valid CHECK cell_kind IN ('cell_voltage','cell_temperature'),
    CONSTRAINT cell_time_kind CHECK source_time_kind IN ('source','unknown'),
    CONSTRAINT cell_time CHECK isNotNull(source_at_ms) = (source_time_kind = 'source'),
    CONSTRAINT cell_null_quality CHECK values_present = 1 OR quality = 'invalid'
)
ENGINE = ReplacingMergeTree()
ORDER BY (binding_period_id, cabinet_no, structure_revision_id, cell_kind, fact_id);

-- All business reads must use FINAL semantics, including before background merges.
-- Resolve authorized historical binding_period_id sets in PG before filtering these views.
CREATE VIEW IF NOT EXISTS ems_cloud_v2_proto_telemetry.ems_observation_final AS
    SELECT * FROM ems_cloud_v2_proto_telemetry.ems_observation FINAL;
CREATE VIEW IF NOT EXISTS ems_cloud_v2_proto_telemetry.ems_cell_final AS
    SELECT * FROM ems_cloud_v2_proto_telemetry.ems_cell FINAL;
CREATE VIEW IF NOT EXISTS ems_cloud_v2_proto_telemetry.ems_live_observation_final AS
    SELECT * FROM ems_cloud_v2_proto_telemetry.ems_observation FINAL
    WHERE source_type IN ('ems','cabinet_30s','cabinet_60s');
-- Latest telemetry queries must additionally restrict source_type to ordinary live types;
-- reliable archive facts are historical evidence and never overwrite live latest values.
