package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.*;
import com.fasterxml.jackson.databind.node.*;
import org.postgresql.ds.PGSimpleDataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.time.*;
import java.math.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA", matches="ems_ingestion_tests")
class TelemetryProjectionPostgresTest {
    PGSimpleDataSource source;
    UUID ems;
    long period, device, binding, point;
    BigInteger fence;
    final List<ObjectNode> written = new ArrayList<>();
    final TelemetryConsumer.FactSink sink = new TelemetryConsumer.FactSink() {
        public void observations(List<ObjectNode> rows) { rows.forEach(r -> written.add(r.deepCopy())); }
        public void cells(List<ObjectNode> rows) { rows.forEach(r -> written.add(r.deepCopy())); }
    };

    @BeforeEach void setup() throws Exception {
        source = new PGSimpleDataSource();
        source.setURL(System.getenv("EMS_TEST_DB_URL")); source.setUser(System.getenv("EMS_TEST_DB_USER"));
        source.setPassword(System.getenv("EMS_TEST_DB_PASSWORD")); source.setCurrentSchema("ems_ingestion_tests,public");
        ems = UUID.randomUUID();
        try (var c = source.getConnection(); var s = c.createStatement()) {
            try (var r = s.executeQuery("SELECT current_database(), current_schema()")) {
                assertTrue(r.next()); assertEquals("ems_cloud_v2_proto", r.getString(1)); assertEquals("ems_ingestion_tests", r.getString(2));
            }
            s.executeUpdate("INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh) VALUES(991,'task6','Task6 test',1,1) ON CONFLICT(id) DO NOTHING");
            s.executeUpdate("INSERT INTO measurement_kind(code,name,unit) VALUES('task6_exact','Task6 exact test','') ON CONFLICT DO NOTHING");
            device = scalar(c, "INSERT INTO device(station_id,code,name) VALUES(991,'" + ems + "','Task6 isolated') RETURNING id");
            s.executeUpdate("INSERT INTO ems_gateway(ems_uuid,device_id) VALUES('" + ems + "'," + device + ")");
            period = scalar(c, "INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES('" + ems + "',991,'2026-09-01Z') RETURNING id");
            binding = scalar(c, "INSERT INTO device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(" + period + ",'cabinet',1,'bms',1," + device + ",'2026-09-01Z') RETURNING id");
            String catalog = PointCatalog.loadDefault().version();
            long definition = scalar(c, "INSERT INTO point_definition(catalog_version,namespace,source_id,value_type) VALUES('" + catalog + "','cabinet',20062,'u16_words') ON CONFLICT(catalog_version,namespace,source_id) DO UPDATE SET value_type=point_definition.value_type RETURNING id");
            point = scalar(c, "INSERT INTO measurement_point(device_id,kind_code,code) VALUES(" + device + ",'task6_exact','bitmap') RETURNING id");
            s.executeUpdate("INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) VALUES(" + binding + "," + definition + "," + point + ",'2026-09-01Z')");
        }
        fence = new GatewayLease(source, "task6-test", 120).acquire(ems).orElseThrow();
    }

    @Test void committedHistoryProjectsAfterLeaseExpiresAndPeriodCloses() throws Exception {
        var envelope = history("[[1,0,[65535,0,12,42]],[2,0,null]]");
        assertEquals(ReliableMessageStore.Outcome.SAVED, new ReliableMessageStore(source).accept(envelope));
        try (var c = source.getConnection(); var s = c.createStatement()) {
            c.setAutoCommit(false); ReliableMessageStore.lock(c, ems.toString());
            s.executeUpdate("UPDATE point_binding SET valid_to=clock_timestamp() WHERE device_binding_id=" + binding);
            s.executeUpdate("UPDATE device_binding SET valid_to=clock_timestamp() WHERE id=" + binding);
            s.executeUpdate("UPDATE ems_binding_period SET valid_to=clock_timestamp() WHERE id=" + period);
            s.executeUpdate("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='" + ems + "'"); c.commit();
        }
        assertTrue(new ReliableProjection(source, sink).projectNext());
        assertEquals(2, written.size());
        assertEquals("[65535,0,12,42]", written.get(0).path("u16_words").toString());
        assertEquals("archive", written.get(0).path("source_time_kind").asText());
        assertEquals(period, written.get(0).path("binding_period_id").longValue());
        assertEquals(1, count("reliable_message", "status='projected'"));
    }

    @Test void failedClickHouseRetainsAcceptedObjectAndRecoversWithSameIdentity() throws Exception {
        assertEquals(ReliableMessageStore.Outcome.SAVED, new ReliableMessageStore(source).accept(history("[[1,0,[65535,0,12,42]]]")));
        var failedRows = new ArrayList<ObjectNode>();
        var fail = new TelemetryConsumer.FactSink() {
            public void observations(List<ObjectNode> rows) throws Exception { failedRows.addAll(rows); throw new java.io.IOException("injected CH unavailable"); }
            public void cells(List<ObjectNode> rows) throws Exception { throw new java.io.IOException("injected"); }
        };
        assertTrue(new ReliableProjection(source, fail).projectNext());
        assertEquals(1, count("reliable_message", "status='projection_failed'"));
        assertEquals(1, count("outbox", "true"));
        assertTrue(new ReliableProjection(source, sink).projectNext());
        assertEquals(failedRows, written);
        assertEquals(1, count("reliable_message", "status='projected'"));
    }

    @Test void mappingAbsentRetainsReliablePendingWithoutInventingPoint() throws Exception {
        assertEquals(ReliableMessageStore.Outcome.SAVED, new ReliableMessageStore(source).accept(history("[[1,0,[65535,0,12,42]]]")));
        try (var c = source.getConnection(); var s = c.createStatement()) { s.executeUpdate("DELETE FROM point_binding WHERE device_binding_id=" + binding); }
        assertTrue(new ReliableProjection(source, sink).projectNext());
        assertTrue(written.isEmpty());
        assertEquals(1, count("reliable_message", "status<>'projected'"));
    }

    @Test void fastMissingMappingsRemainBoundedEvidenceAndStaleFenceWritesNothing() throws Exception {
        var diagnostics = new TransportDiagnostics();
        var consumer = new TelemetryConsumer(source, sink, diagnostics);
        for (int i=0; i<35; i++) assertTrue(consumer.accept(ordinary(i)));
        assertEquals(32, count("telemetry_diagnostic_evidence", "true"));
        assertEquals(35, written.size());
        assertTrue(written.stream().allMatch(r->r.path("point_id").longValue()==point));
        var e = ordinary(99);
        var stale = new IngressEnvelope(e.emsId(), e.channel(), e.type(), e.canonicalHash(), e.rawBody(), e.sourceTopic(), e.receivedAt(), e.ingressEpoch(), e.sequence(), fence.subtract(BigInteger.ONE));
        assertTrue(consumer.accept(stale));
        assertEquals(32, count("telemetry_diagnostic_evidence", "true"));
        assertEquals(35, written.size());
    }

    @Test void cellsNeedCurrentMatchingReadyLayoutAndPreserveNullPositions() throws Exception {
        var consumer=new TelemetryConsumer(source,sink,new TransportDiagnostics());
        var unknown=envelope("telemetry","{\"v\":1,\"type\":\"cell_voltage\",\"c\":1,\"sv\":2,\"d\":{\"ts\":null,\"q\":\"valid\",\"values\":[[null,3.2]]}}");
        assertTrue(consumer.accept(unknown));assertTrue(written.isEmpty());
        try(var c=source.getConnection();var s=c.createStatement()) {
            assertEquals(1,scalar(c,"SELECT count(*) FROM structure_refresh_demand WHERE binding_period_id="+period+" AND pending"));
            c.setAutoCommit(false);ReliableMessageStore.lock(c,ems.toString());
            String layout="{\"clusterLayout\":{\"bms\":{\"bmuType\":1,\"bmuCount\":1,\"voltCount\":2,\"tempCount\":2}},\"clusters\":[{\"c\":1}],\"publicMeters\":[]}";
            long revision=scalar(c,"INSERT INTO structure_revision(ems_uuid,sv,layout,content_hash) VALUES('"+ems+"',1,'"+layout+"','"+"a".repeat(64)+"') RETURNING id");
            s.executeUpdate("INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at) VALUES("+period+","+revision+",clock_timestamp())");
            String connection=UUID.randomUUID().toString();
            s.executeUpdate("UPDATE connection_state SET connection_id='"+connection+"',ingress_generation='"+UUID.randomUUID()+"' WHERE ems_uuid='"+ems+"'");
            String metadata="{\"clusterLayout\":{\"bms\":{\"bmuType\":1,\"bmuCount\":1,\"voltCount\":2,\"tempCount\":2}},\"clusters\":[{\"c\":1,\"state\":\"active\",\"cellReady\":false}]}";
            s.executeUpdate("INSERT INTO structure_current(ems_uuid,binding_period_id,connection_id,seq,revision_id,metadata,received_at) VALUES('"+ems+"',"+period+",'"+connection+"',1,"+revision+",'"+metadata+"',clock_timestamp())");c.commit();
        }
        var valid=envelope("telemetry",unknown.rawBody().replace("\"sv\":2","\"sv\":1"));
        assertTrue(consumer.accept(valid));assertTrue(written.isEmpty());
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE structure_current SET metadata=jsonb_set(metadata,'{clusters,0,cellReady}','true'),received_at=clock_timestamp() WHERE ems_uuid='"+ems+"'");}
        assertTrue(consumer.accept(valid));assertTrue(written.isEmpty(),"Do not reinterpret an old diagnosed sample through future readiness");
        var fresh=envelope("telemetry",valid.rawBody());
        assertTrue(consumer.accept(fresh));assertEquals(1,written.size());
        assertTrue(written.getFirst().path("cell_values").get(0).get(0).isNull());
        assertEquals("3.2",written.getFirst().path("cell_values").get(0).get(1).textValue());
        assertTrue(written.getFirst().path("source_at_ms").isNull());
        assertEquals("cell_voltage",written.getFirst().path("cell_kind").textValue());
        assertFalse(written.getFirst().has("source_type"),"Cell kind is the sole source subtype");
        assertTrue(consumer.accept(fresh));assertEquals(written.get(0),written.get(1),"Same ingress replay produces byte-identical fact payload");
    }

    @AfterEach void removeOnlyThisTestsMutableObjects()throws Exception {
        if(source==null||ems==null)return;
        try(var c=source.getConnection();var s=c.createStatement()) {
            c.setAutoCommit(false);ReliableMessageStore.lock(c,ems.toString());
            for(String table:List.of("outbox","history_sample_identity","reliable_message"))s.executeUpdate("DELETE FROM "+table+" WHERE ems_uuid='"+ems+"'");
            for(String table:List.of("telemetry_diagnostic_evidence","structure_refresh_demand"))s.executeUpdate("DELETE FROM "+table+" WHERE binding_period_id="+period);
            c.commit();
        }
    }

    IngressEnvelope history(String rows) {
        return envelope("important", "{\"v\":1,\"type\":\"important_history\",\"taskId\":\"" + UUID.randomUUID() + "\",\"c\":1,\"part\":1,\"parts\":1,\"ts\":1789353000000,\"p\":[20062],\"data\":" + rows + "}");
    }
    IngressEnvelope ordinary(int variation) {
        var n = JsonNodeFactory.instance.objectNode(); n.put("v",1); n.put("type","cabinet_30s"); n.put("c",1);
        var d=n.putObject("d");
        for(String subsystem:List.of("emu","bms","tms","pvdc","pcs","grid")) {
            var block=d.putObject(subsystem); block.put("ts",1789353000000L+variation); block.put("q","valid"); var points=block.putArray("p");
            for(var def:PointCatalog.loadDefault().definitions()) if("cabinet_30s".equals(def.sourceType()) && subsystem.equals(def.subsystem())) {
                var pair=points.addArray().add(def.sourcePointId());
                if(def.wireType()==PointCatalog.WireType.U16_WORDS) pair.addArray().add(65535).add(0).add(12).add(42);
                else if(def.wireType()==PointCatalog.WireType.TEXT) pair.add("01.2"); else pair.addNull();
            }
        }
        var link=d.putObject("link"); link.put("ts",1789353000000L); link.putNull("online");
        return envelope("telemetry",n.toString());
    }
    IngressEnvelope envelope(String channel,String raw) {
        String topic="ems/v1/"+ems+"/up/"+channel; var m=new WireDecoder().decode(topic,raw.getBytes(StandardCharsets.UTF_8));
        return new IngressEnvelope(ems,channel,m.type(),m.canonicalHash(),raw,topic,Instant.now(),UUID.randomUUID(),BigInteger.ONE,fence);
    }
    long count(String table,String predicate) throws Exception {
        String scope=table.equals("telemetry_diagnostic_evidence")?"binding_period_id="+period:"ems_uuid='"+ems+"'";
        try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM "+table+" WHERE "+scope+" AND "+predicate)){r.next();return r.getLong(1);}
    }
    static long scalar(Connection c,String sql)throws SQLException {try(var s=c.createStatement();var r=s.executeQuery(sql)){r.next();return r.getLong(1);}}
}
