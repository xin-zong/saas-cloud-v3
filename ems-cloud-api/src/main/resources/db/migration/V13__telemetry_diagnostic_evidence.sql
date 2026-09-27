-- Diagnostic samples only: never replay unknown layouts using later structure.
CREATE TABLE telemetry_diagnostic_evidence (
    fact_id ems_content_hash PRIMARY KEY,
    binding_period_id bigint NOT NULL REFERENCES ems_binding_period,
    reason text NOT NULL CHECK(reason IN ('missing_mapping','unknown_layout','invalid_profile')),
    received_at timestamptz NOT NULL,
    raw_envelope bytea NOT NULL CHECK(octet_length(raw_envelope)<=262144)
);
CREATE INDEX telemetry_diagnostic_oldest ON telemetry_diagnostic_evidence(binding_period_id,received_at,fact_id);
CREATE TABLE structure_refresh_demand (
    binding_period_id bigint PRIMARY KEY REFERENCES ems_binding_period,
    pending boolean NOT NULL DEFAULT true
);
