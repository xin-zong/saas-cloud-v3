-- Read only, ClickHouse database ems_cloud_v2_proto_telemetry.
-- Bind start_ms (Int64) to the new sender start time, so previous samples cannot satisfy coverage.
SELECT source_type,uniqExact(point_id) AS distinct_points,count() AS observations,
       min(source_at_ms) AS first_source_ms,max(source_at_ms) AS latest_source_ms,
       max(received_at_ms) AS latest_receive_ms
FROM ems_cloud_v2_proto_telemetry.ems_observation FINAL
WHERE binding_period_id=2 AND received_at_ms>={start_ms:Int64}
GROUP BY source_type ORDER BY source_type;
-- cabinet_30s=241, cabinet_60s=54, ems=6; total distinct ordinary/EMS=301.
SELECT source_type,quality,value_kind,count() AS rows
FROM ems_cloud_v2_proto_telemetry.ems_observation FINAL
WHERE binding_period_id=2 AND received_at_ms>={start_ms:Int64}
GROUP BY source_type,quality,value_kind ORDER BY source_type,quality,value_kind;
SELECT point_id,source_at_ms,received_at_ms,quality,value_kind,number_exact,text_value,u16_words
FROM ems_cloud_v2_proto_telemetry.ems_observation FINAL
WHERE binding_period_id=2 AND received_at_ms>={start_ms:Int64} AND point_id IN(19,21,22,441,442,443,444,445,446)
ORDER BY received_at_ms DESC,point_id LIMIT 100;
-- 441..443 remain null/invalid/source_time_kind=unknown. Bitmap retained as 4 U16 words.
SELECT cell_kind,connection_id,structure_revision_id,quality,values_present,
       length(cell_values) AS rows,arrayMap(row->length(row),cell_values) AS columns,
       arraySum(arrayMap(row->arrayCount(value->isNull(value),row),cell_values)) AS null_slots,
       source_at_ms,received_at_ms
FROM ems_cloud_v2_proto_telemetry.ems_cell FINAL
WHERE binding_period_id=2 AND cabinet_no=1 AND received_at_ms>={start_ms:Int64}
ORDER BY received_at_ms DESC LIMIT 10;
-- voltage rows=5/columns=[32,32,32,32,32]; temperature rows=5/columns=[16,16,16,16,16]. Each 1 null.
