-- Cabinet-scoped wire link observation; no inferred physical device or heartbeat state.
-- Period determines EMS/station, avoiding redundant ownership columns.
CREATE TABLE cabinet_link_current (
 binding_period_id bigint NOT NULL REFERENCES ems_binding_period(id),
 cabinet_no smallint NOT NULL CHECK(cabinet_no BETWEEN 1 AND 30),
 online boolean,
 source_at_ms bigint CHECK(source_at_ms>=0),
 received_at timestamptz NOT NULL,
 ingress_generation uuid NOT NULL,
 ingress_order ems_positive_counter NOT NULL,
 fencing_token ems_counter NOT NULL,
 PRIMARY KEY(binding_period_id,cabinet_no)
);
