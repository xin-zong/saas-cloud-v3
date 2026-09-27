package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.WireDecoder;
import org.postgresql.ds.PGSimpleDataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.time.*;
import java.math.*;
import java.util.*;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA", matches="ems_ingestion_tests")
class StateQueryPostgresTest {
    PGSimpleDataSource source;
    UUID ems = UUID.randomUUID(), epoch = UUID.randomUUID(), connection = UUID.randomUUID();
    BigInteger fence;
    long period;
    @BeforeEach void setup() throws Exception {
        source = new PGSimpleDataSource(); source.setURL(System.getenv("EMS_TEST_DB_URL"));
        source.setUser(System.getenv("EMS_TEST_DB_USER")); source.setPassword(System.getenv("EMS_TEST_DB_PASSWORD"));
        source.setCurrentSchema("ems_ingestion_tests,public");
        try (var c=source.getConnection(); var s=c.createStatement()) {
            try(var r=s.executeQuery("SELECT current_database(),current_schema()")) {assertTrue(r.next());assertEquals("ems_cloud_v2_proto",r.getString(1));assertEquals("ems_ingestion_tests",r.getString(2));}
            s.executeUpdate("INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh) VALUES(992,'task7','Task7',1,1) ON CONFLICT DO NOTHING");
            long device;
            try(var r=s.executeQuery("INSERT INTO device(station_id,code,name) VALUES(992,'"+ems+"','Task7') RETURNING id")){r.next();device=r.getLong(1);}
            s.executeUpdate("INSERT INTO ems_gateway VALUES('"+ems+"',"+device+")");
            try(var r=s.executeQuery("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES('"+ems+"',992,'2026-09-01Z') RETURNING id")){r.next();period=r.getLong(1);}
            s.executeUpdate("INSERT INTO device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES("+period+",'cabinet',1,'bms',1,"+device+",'2026-09-01Z')");
        }
        fence=new GatewayLease(source,"task7",120).acquire(ems).orElseThrow();
    }
    IngressEnvelope envelope(String channel,String body,long sequence,Instant received) {
        String topic="ems/v1/"+ems+"/up/"+channel;
        var m=new WireDecoder().decode(topic,body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return new IngressEnvelope(ems,channel,m.type(),m.canonicalHash(),body,topic,received,epoch,BigInteger.valueOf(sequence),fence);
    }
    IngressEnvelope heartbeat(UUID id,long sequence,Instant received) {
        return envelope("heartbeat","{\"v\":1,\"emsId\":\""+ems+"\",\"connectionId\":\""+id+"\",\"uptimeSeconds\":1}",sequence,received);
    }
    String value(String sql) throws Exception {try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery(sql)){assertTrue(r.next());return r.getString(1);}}
    Instant now() throws Exception {try(var c=source.getConnection()){return StateTransaction.now(c);}}
    @Test void freshConnectionCannotBeRestoredByReplayOrRetiredHeartbeat() throws Exception {
        var state=new ConnectionState(source);var first=heartbeat(connection,1,now());
        assertTrue(state.accept(first));
        assertEquals(connection.toString(),value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+ems+"'"));
        UUID next=UUID.randomUUID();assertTrue(state.accept(heartbeat(next,2,now())));
        assertTrue(state.accept(first));assertTrue(state.accept(heartbeat(connection,3,now())));
        assertEquals(next.toString(),value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+ems+"'"));
    }
    @Test void structureAcceptsMetadataButRejectsSameVersionDimensionChange() throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        String raw=Files.readString(Path.of("../ems-cloud-protocol/src/test/resources/telemetry/structure-matched-synthetic.json"));
        var n=(com.fasterxml.jackson.databind.node.ObjectNode)new com.fasterxml.jackson.databind.ObjectMapper().readTree(raw);
        n.remove("_testFixtureProvenance");n.put("connectionId",connection.toString());
        var store=new StructureStore(source);assertTrue(store.accept(envelope("telemetry",n.toString(),2,Instant.now())));
        assertEquals("1",value("SELECT count(*) FROM structure_current WHERE ems_uuid='"+ems+"'"));
        n.put("seq",3);((com.fasterxml.jackson.databind.node.ObjectNode)n.path("d").path("clusters").get(0)).put("cellReady",false);
        ((com.fasterxml.jackson.databind.node.ObjectNode)n.path("d").path("clusterLayout")).set("bms",new com.fasterxml.jackson.databind.ObjectMapper().readTree("{\"tempCount\":16,\"voltCount\":32,\"bmuCount\":5,\"bmuType\":2,\"count\":1}"));
        assertTrue(store.accept(envelope("telemetry",n.toString(),3,Instant.now())));
        assertEquals("false",value("SELECT metadata->'clusters'->0->>'cellReady' FROM structure_current WHERE ems_uuid='"+ems+"'"));
        n.put("seq",4);((com.fasterxml.jackson.databind.node.ObjectNode)n.path("d").path("clusterLayout").path("bms")).put("voltCount",33);
        assertTrue(store.accept(envelope("telemetry",n.toString(),4,Instant.now())));
        assertEquals("3",value("SELECT seq FROM structure_current WHERE ems_uuid='"+ems+"'"));
    }
    @Test void durableQueryConsumesDemandAndResponseDoesNotClearNewDemand() throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        try(var c=source.getConnection()){c.setAutoCommit(false);ReliableMessageStore.lock(c,ems.toString());AlarmProjection.requireRefresh(c,period,1);c.commit();}
        List<String> sent=new ArrayList<>();var dispatcher=new QueryDispatcher(source,(topic,bytes)->sent.add(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)));
        assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));
        assertEquals("f",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period));
        assertTrue(dispatcher.publishNext());assertEquals(1,sent.size());
        String id=new com.fasterxml.jackson.databind.ObjectMapper().readTree(sent.getFirst()).path("id").asText();
        try(var c=source.getConnection()){c.setAutoCommit(false);ReliableMessageStore.lock(c,ems.toString());AlarmProjection.requireRefresh(c,period,1);c.commit();}
        String response="{\"v\":1,\"emsId\":\""+ems+"\",\"id\":\""+id+"\",\"ok\":true,\"data\":{\"v\":1,\"type\":\"alarm_current\",\"connectionId\":\""+connection+"\",\"c\":1,\"seq\":1,\"alarms\":[]}}";
        assertTrue(new ResponseConsumer(source).accept(envelope("response",response,2,Instant.now())));
        assertEquals("succeeded",value("SELECT status FROM query_request WHERE id='"+id+"'"));
        assertEquals("t",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period));
    }
    @Test void leaseHandoverInvalidatesPreviouslyFreshConnection() throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+ems+"'");}
        var nextFence=new GatewayLease(source,"task7-next",120).acquire(ems).orElseThrow();
        assertTrue(nextFence.compareTo(fence)>0);
        assertNull(value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+ems+"'"));
    }
    @Test void oldAndFutureHeartbeatsDoNotMakeNewConnectionReachableAndStatusCannotClearIt()throws Exception {
        var state=new ConnectionState(source);assertTrue(state.accept(heartbeat(connection,1,now().minusSeconds(90))));
        assertNull(value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+ems+"'"));
        assertTrue(state.accept(heartbeat(connection,2,now().plusSeconds(60))));
        assertNull(value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+ems+"'"));
        assertTrue(state.accept(heartbeat(connection,3,now())));
        assertTrue(state.accept(envelope("status","{\"v\":1,\"emsId\":\""+ems+"\",\"state\":\"disconnected\"}",4,now())));
        assertEquals(connection.toString(),value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+ems+"'"));
        assertEquals("1",value("SELECT count(*) FROM structure_refresh_demand WHERE binding_period_id="+period+" AND pending"));
        assertEquals("1",value("SELECT count(*) FROM alarm_refresh_demand WHERE binding_period_id="+period+" AND pending AND cabinet_no=1"));
    }
    @Test void unknownAlarmSnapshotRetainsRecordButCannotAppearKnownAndSameSeqConflicts()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        UUID alarm=UUID.randomUUID();String entry="{\"sv\":null,\"alarmId\":\""+alarm+"\",\"seq\":4,\"device\":{\"c\":1,\"type\":\"bms\",\"id\":null},\"code\":\"010001\",\"level\":2,\"state\":\"active\",\"ts\":1789353000000}";
        var projection=new AlarmProjection();assertTrue(projection.current(source,alarmCurrent(1,"["+entry+"]")));
        assertEquals("010001",value("SELECT record->>'code' FROM alarm_current_member WHERE ems_uuid='"+ems+"'"));
        assertTrue(projection.current(source,alarmCurrent(2,"null")));
        assertEquals("f",value("SELECT known FROM alarm_current_snapshot WHERE ems_uuid='"+ems+"'"));
        assertEquals("1",value("SELECT count(*) FROM alarm_current_member WHERE ems_uuid='"+ems+"'"));
        assertTrue(projection.current(source,alarmCurrent(2,"[]")));
        assertEquals("f",value("SELECT known FROM alarm_current_snapshot WHERE ems_uuid='"+ems+"'"));
        assertTrue(projection.current(source,alarmCurrent(3,"[]")));
        assertEquals("0",value("SELECT count(*) FROM alarm_current_member WHERE ems_uuid='"+ems+"'"));
    }
    IngressEnvelope alarmCurrent(long seq,String alarms)throws Exception {
        return envelope("alarm","{\"v\":1,\"type\":\"alarm_current\",\"connectionId\":\""+connection+"\",\"c\":1,\"seq\":"+seq+",\"alarms\":"+alarms+"}",seq+1,now());
    }
    @Test void expiredAndChangedConnectionQueriesCannotPublishAndFailureRestoresDemand()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));var sent=new ArrayList<String>();
        var dispatcher=new QueryDispatcher(source,(topic,bytes)->sent.add(topic));
        assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE query_request SET created_at=clock_timestamp()-interval '40 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+ems+"'");}
        assertTrue(dispatcher.publishNext());assertTrue(sent.isEmpty());
        assertEquals("expired",value("SELECT status FROM query_request WHERE ems_uuid='"+ems+"'"));
        assertEquals("t",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period));
        assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));
        new ConnectionState(source).accept(heartbeat(UUID.randomUUID(),9,now()));
        assertTrue(dispatcher.publishNext());assertTrue(sent.isEmpty());
        assertEquals("1",value("SELECT count(*) FROM query_request WHERE ems_uuid='"+ems+"' AND status='failed'"));
        assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));
        assertTrue(new QueryDispatcher(source,(topic,bytes)->{throw new java.io.IOException("simulated transport failure");}).publishNext());
        assertEquals("1",value("SELECT count(*) FROM query_request WHERE ems_uuid='"+ems+"' AND status='sent'"));
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE query_request SET created_at=clock_timestamp()-interval '40 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+ems+"' AND status='sent'");}
        assertTrue(dispatcher.publishNext());
        assertEquals("1",value("SELECT count(*) FROM query_request WHERE ems_uuid='"+ems+"' AND status='unknown'"));
        assertEquals("t",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period));
    }
    @Test void thirtyTwoRequestsPerConnectionWindowAndUnsupportedScopeAreBounded()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));var dispatcher=new QueryDispatcher(source,(topic,bytes)->{});
        // Completed requests still consume the wire dedup/rate window.
        try(var c=source.getConnection();var q=c.prepareStatement("INSERT INTO query_request(id,ems_uuid,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?::uuid,?::uuid,?,?::uuid,'structure.get','{}',clock_timestamp(),clock_timestamp()+interval '30 seconds','failed')")) {
            for(int i=0;i<32;i++){q.setString(1,UUID.randomUUID().toString());q.setString(2,ems.toString());q.setLong(3,period);q.setString(4,connection.toString());q.addBatch();}q.executeBatch();
        }
        assertFalse(dispatcher.enqueueAutomatic(ems,"structure.get",null));
        try(var c=source.getConnection()){c.setAutoCommit(false);ReliableMessageStore.lock(c,ems.toString());AlarmProjection.requireRefresh(c,period,null);c.commit();}
        assertFalse(dispatcher.enqueueDemand());assertEquals("t",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period));
    }
    @Test void apiAuthenticatedPendingMaterializesAndRevokedActorCannotSend()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));long actor,role,grant;
        try(var c=source.getConnection();var s=c.createStatement()) {
            try(var r=s.executeQuery("INSERT INTO app_user(account,password_hash,display_name) VALUES('task7-"+ems+"','test-only','Task7 test actor') RETURNING id")){r.next();actor=r.getLong(1);}
            try(var r=s.executeQuery("INSERT INTO app_role(code,name) VALUES('task7-"+ems+"','Task7 test role') RETURNING id")){r.next();role=r.getLong(1);}
            s.executeUpdate("INSERT INTO role_permission VALUES("+role+",'ems.query')");
            try(var r=s.executeQuery("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES("+actor+","+role+",'2026-09-01Z') RETURNING id")){r.next();grant=r.getLong(1);}
            s.executeUpdate("INSERT INTO member_grant_station VALUES("+grant+",992)");
        }
        var sent=new ArrayList<String>();var dispatcher=new QueryDispatcher(source,(topic,bytes)->sent.add(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)));
        UUID first=apiRequest(actor);assertTrue(dispatcher.publishNext());assertEquals(1,sent.size());
        assertEquals("sent",value("SELECT status FROM query_request WHERE id='"+first+"'"));
        UUID next=apiRequest(actor);assertTrue(dispatcher.materializePending());
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("DELETE FROM member_grant WHERE id="+grant);}
        assertTrue(dispatcher.publishNext());assertEquals(1,sent.size());
        assertEquals("failed",value("SELECT status FROM query_request WHERE id='"+next+"'"));
    }
    UUID apiRequest(long actor)throws Exception {
        return apiRequest(actor,"structure.get","{}");
    }
    UUID apiRequest(long actor,String operation,String params)throws Exception {
        UUID id=UUID.randomUUID();try(var c=source.getConnection();var q=c.prepareStatement("INSERT INTO query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?::uuid,?::uuid,?,?,?::uuid,?,?::jsonb,statement_timestamp(),statement_timestamp()+interval '30 seconds','pending')")) {
            q.setString(1,id.toString());q.setString(2,ems.toString());q.setLong(3,actor);q.setLong(4,period);q.setString(5,connection.toString());q.setString(6,operation);q.setString(7,params);q.executeUpdate();
        }return id;
    }
    @Test void responseCannotCompleteUnsentRequestAndAbandonedAttemptRecoversSamePayload()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));var sent=new ArrayList<String>();
        var dispatcher=new QueryDispatcher(source,(topic,bytes)->sent.add(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)));
        assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));String id=value("SELECT id FROM query_request WHERE ems_uuid='"+ems+"'");
        var response=envelope("response","{\"v\":1,\"emsId\":\""+ems+"\",\"id\":\""+id+"\",\"ok\":false,\"error\":{\"code\":\"BUSY\",\"message\":\"test busy\"}}",2,now());
        assertTrue(new ResponseConsumer(source).accept(response));assertEquals("pending",value("SELECT status FROM query_request WHERE id='"+id+"'"));
        String original=value("SELECT convert_from(payload,'UTF8') FROM outbox WHERE query_request_id='"+id+"'");
        try(var c=source.getConnection();var s=c.createStatement()) {
            s.executeUpdate("UPDATE query_request SET status='sent' WHERE id='"+id+"'");
            s.executeUpdate("UPDATE outbox SET status='sending',attempts=1,first_attempt_at=clock_timestamp(),lease_owner='abandoned',lease_until=clock_timestamp()-interval '1 second' WHERE query_request_id='"+id+"'");
        }
        assertTrue(dispatcher.publishNext());assertEquals(List.of(original),sent);
        assertTrue(new ResponseConsumer(source).accept(response));assertEquals("BUSY",value("SELECT result->'error'->>'code' FROM query_request WHERE id='"+id+"'"));
    }
    @Test void permanentAndUnclassifiedErrorsPauseAutomaticRefreshUntilNewManualSuccess()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        var dispatcher=new QueryDispatcher(source,(t,b)->{});
        long actor=grantActor();long snapshotSequence=1;
        assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));
        for(String code:List.of("RESULT_TOO_LARGE","VENDOR_UNCLASSIFIED")) {
            String failedId=value("SELECT id FROM query_request WHERE ems_uuid='"+ems+"' AND status='pending'");
            assertTrue(dispatcher.publishNext());
            var failed=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            failed.put("v",1);failed.put("emsId",ems.toString());failed.put("id",failedId);failed.put("ok",false);
            failed.putObject("error").put("code",code).put("message","Isolated error result");
            assertTrue(new ResponseConsumer(source).accept(envelope("response",failed.toString(),10+snapshotSequence,now())));
            assertFalse(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1));
            assertEquals("t",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period+" AND cabinet_no=1"));
            UUID manual=apiRequest(actor,"alarm.current.get","{\"c\":1}");
            assertTrue(dispatcher.publishNext());
            var succeeded=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            succeeded.put("v",1);succeeded.put("emsId",ems.toString());succeeded.put("id",manual.toString());succeeded.put("ok",true);
            var data=succeeded.putObject("data");data.put("v",1);data.put("type","alarm_current");data.put("connectionId",connection.toString());
            data.put("c",1);data.put("seq",snapshotSequence++);data.putArray("alarms");
            assertTrue(new ResponseConsumer(source).accept(envelope("response",succeeded.toString(),20+snapshotSequence,now())));
            assertEquals("succeeded",value("SELECT status FROM query_request WHERE id='"+manual+"'"));
            assertEquals("failed",value("SELECT status FROM query_request WHERE id='"+failedId+"'"),"Old failed outcome is immutable in this regression");
            assertTrue(dispatcher.enqueueAutomatic(ems,"alarm.current.get",1),"A genuinely newer authorized success resumes automatic refresh");
        }
    }
    @Test void delayedFirstSendCannotExceedActualSixtySecondRateWindow()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));var sent=new ArrayList<String>();
        var dispatcher=new QueryDispatcher(source,(t,b)->sent.add(t));assertTrue(dispatcher.enqueueAutomatic(ems,"structure.get",null));
        try(var c=source.getConnection();var query=c.prepareStatement("INSERT INTO query_request(id,ems_uuid,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?::uuid,?::uuid,?,?::uuid,'structure.get','{}',clock_timestamp()-interval '70 seconds',clock_timestamp()-interval '40 seconds','failed')");
            var outbox=c.prepareStatement("INSERT INTO outbox(ems_uuid,type,query_request_id,topic,payload,status,attempts,first_attempt_at) VALUES(?::uuid,'query',?::uuid,'isolated-test',?,'sent',1,clock_timestamp()-interval '41 seconds')")) {
            for(int i=0;i<32;i++) {
                String id=UUID.randomUUID().toString();query.setString(1,id);query.setString(2,ems.toString());query.setLong(3,period);query.setString(4,connection.toString());query.executeUpdate();
                outbox.setString(1,ems.toString());outbox.setString(2,id);outbox.setBytes(3,new byte[]{1});outbox.addBatch();
            }outbox.executeBatch();
        }
        assertFalse(dispatcher.publishNext());assertTrue(sent.isEmpty());
        assertEquals("0",value("SELECT attempts FROM outbox WHERE ems_uuid='"+ems+"' AND status='pending'"));
    }
    @Test void duplicateAlarmIdentityRejectsWholeSnapshotBeforeMutation()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));var projection=new AlarmProjection();assertTrue(projection.current(source,alarmCurrent(1,"[]")));
        String entry="{\"sv\":null,\"alarmId\":\""+UUID.randomUUID()+"\",\"seq\":1,\"device\":{\"c\":1,\"type\":\"bms\",\"id\":null},\"code\":\"010001\",\"level\":null,\"state\":\"active\",\"ts\":1789353000000}";
        assertTrue(projection.current(source,alarmCurrent(2,"["+entry+","+entry+"]")));
        assertEquals("1",value("SELECT seq FROM alarm_current_snapshot WHERE ems_uuid='"+ems+"'"));
        assertEquals("0",value("SELECT count(*) FROM alarm_current_member WHERE ems_uuid='"+ems+"'"));
    }
    @Test void removedCabinetDemandDoesNotStarveEligibleStructureRefresh()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE device_binding SET valid_to=clock_timestamp() WHERE binding_period_id="+period);}
        var dispatcher=new QueryDispatcher(source,(t,b)->{});
        assertTrue(dispatcher.enqueueDemand());
        assertEquals("structure.get",value("SELECT operation FROM query_request WHERE ems_uuid='"+ems+"'"));
        assertEquals("t",value("SELECT pending FROM alarm_refresh_demand WHERE binding_period_id="+period+" AND cabinet_no=1"));
    }
    @Test void identicalSameSequenceStructureQueryResponseIsSucceeded()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));
        var n=(com.fasterxml.jackson.databind.node.ObjectNode)new com.fasterxml.jackson.databind.ObjectMapper().readTree(Files.readString(Path.of("../ems-cloud-protocol/src/test/resources/telemetry/structure-matched-synthetic.json")));
        n.remove("_testFixtureProvenance");n.put("connectionId",connection.toString());
        assertTrue(new StructureStore(source).accept(envelope("telemetry",n.toString(),2,now())));
        var dispatcher=new QueryDispatcher(source,(t,b)->{});assertTrue(dispatcher.enqueueAutomatic(ems,"structure.get",null));assertTrue(dispatcher.publishNext());
        String id=value("SELECT id FROM query_request WHERE ems_uuid='"+ems+"'");
        var response=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();response.put("v",1);response.put("emsId",ems.toString());response.put("id",id);response.put("ok",true);response.set("data",n);
        assertTrue(new ResponseConsumer(source).accept(envelope("response",response.toString(),3,now())));
        assertEquals("succeeded",value("SELECT status FROM query_request WHERE id='"+id+"'"));
    }
    @Test void wideApiCabinetDoesNotTruncateIntoAnAllocatedCabinet()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));long actor=grantActor();UUID id=apiRequest(actor);
        try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE query_request SET operation='alarm.current.get',params='{\"c\":4294967297}' WHERE id='"+id+"'");}
        var sent=new ArrayList<String>();assertFalse(new QueryDispatcher(source,(t,b)->sent.add(t)).publishNext());
        assertTrue(sent.isEmpty());assertEquals("failed",value("SELECT status FROM query_request WHERE id='"+id+"'"));
        assertEquals("0",value("SELECT count(*) FROM outbox WHERE query_request_id='"+id+"'"));
    }
    long grantActor()throws Exception {
        long actor,role,grant;String identity=UUID.randomUUID().toString();
        try(var c=source.getConnection();var s=c.createStatement()) {
            try(var r=s.executeQuery("INSERT INTO app_user(account,password_hash,display_name) VALUES('task7-"+identity+"','test-only','Task7 test actor') RETURNING id")){r.next();actor=r.getLong(1);}
            try(var r=s.executeQuery("INSERT INTO app_role(code,name) VALUES('task7-"+identity+"','Task7 test role') RETURNING id")){r.next();role=r.getLong(1);}
            s.executeUpdate("INSERT INTO role_permission VALUES("+role+",'ems.query')");
            try(var r=s.executeQuery("INSERT INTO member_grant(user_id,role_id,valid_from) VALUES("+actor+","+role+",'2026-09-01Z') RETURNING id")){r.next();grant=r.getLong(1);}
            s.executeUpdate("INSERT INTO member_grant_station VALUES("+grant+",992)");
        }return actor;
    }
    @Test void rateBlockedOldFirstSendDoesNotHideNewerEligibleRetry()throws Exception {
        new ConnectionState(source).accept(heartbeat(connection,1,now()));var sent=new ArrayList<String>();var dispatcher=new QueryDispatcher(source,(t,b)->sent.add(new String(b,java.nio.charset.StandardCharsets.UTF_8)));
        assertTrue(dispatcher.enqueueAutomatic(ems,"structure.get",null));String blocked=value("SELECT id FROM query_request WHERE ems_uuid='"+ems+"'");
        UUID retry=UUID.randomUUID();
        try(var c=source.getConnection();var q=c.prepareStatement("INSERT INTO query_request(id,ems_uuid,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?::uuid,?::uuid,?,?::uuid,'alarm.current.get','{\"c\":1}',statement_timestamp()+interval '1 millisecond',statement_timestamp()+interval '30 seconds','sent')")) {
            q.setString(1,retry.toString());q.setString(2,ems.toString());q.setLong(3,period);q.setString(4,connection.toString());q.executeUpdate();
        }
        try(var c=source.getConnection();var s=c.createStatement()) {
            s.executeUpdate("INSERT INTO outbox(ems_uuid,type,query_request_id,topic,payload,status,attempts,first_attempt_at) VALUES('"+ems+"','query','"+retry+"','isolated-test',convert_to('retry-exact-payload','UTF8'),'pending',1,clock_timestamp())");
            for(int i=0;i<31;i++) {
                UUID previous=UUID.randomUUID();
                s.executeUpdate("INSERT INTO query_request(id,ems_uuid,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES('"+previous+"','"+ems+"',"+period+",'"+connection+"','structure.get','{}',clock_timestamp()-interval '70 seconds',clock_timestamp()-interval '40 seconds','failed')");
                s.executeUpdate("INSERT INTO outbox(ems_uuid,type,query_request_id,topic,payload,status,attempts,first_attempt_at) VALUES('"+ems+"','query','"+previous+"','isolated-test',convert_to('previous','UTF8'),'sent',1,clock_timestamp())");
            }
        }
        assertTrue(dispatcher.publishNext());assertEquals(List.of("retry-exact-payload"),sent);
        assertEquals("pending",value("SELECT status FROM query_request WHERE id='"+blocked+"'"));
    }
    @Test void newerLowConfigRevisionWinsButDelayedOldIngressCannotReplaceIt() throws Exception {
        var store=new ConfigurationStore(source);
        assertTrue(store.accept(configuration(10,2,10)));
        assertTrue(store.accept(configuration(1,3,1)));
        assertEquals("1",value("SELECT r.cfg_rev FROM config_current c JOIN config_revision r ON r.id=c.revision_id WHERE c.ems_uuid='"+ems+"'"));
        assertTrue(store.accept(configuration(20,1,20)));
        assertEquals("1",value("SELECT r.cfg_rev FROM config_current c JOIN config_revision r ON r.id=c.revision_id WHERE c.ems_uuid='"+ems+"'"));
        assertTrue(store.accept(configuration(1,4,99)));
        assertEquals("1",value("SELECT number_value FROM config_value v JOIN config_current c ON c.revision_id=v.revision_id JOIN point_definition p ON p.id=v.definition_id WHERE c.ems_uuid='"+ems+"' AND p.source_id=101"));
        assertEquals("173",value("SELECT count(*) FROM config_value v JOIN config_current c ON c.revision_id=v.revision_id WHERE c.ems_uuid='"+ems+"'"));
    }
    IngressEnvelope configuration(long rev,long order,long firstValue)throws Exception {
        var n=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();n.put("v",1);n.put("type","ems");
        var d=n.putObject("d");var block=d.putArray("base").addObject();block.putNull("ts");block.put("q","invalid");var p=block.putArray("p");
        var cfg=d.putObject("cfg");cfg.put("rev",rev);var config=cfg.putArray("p");
        for(var definition:com.enerlution.ems.protocol.PointCatalog.loadDefault().definitions()) {
            if(definition.namespace().equals("ems"))p.addArray().add(definition.sourcePointId()).addNull();
            if(definition.namespace().equals("config")) {
                var pair=config.addArray().add(definition.sourcePointId());
                if(definition.sourcePointId()==101)pair.add(firstValue);else pair.addNull();
            }
        }
        return envelope("telemetry",n.toString(),order,now());
    }
    @Test void configurationPreservesWideExtensionNumericIdWithoutPhysicalMapping()throws Exception {
        var e=configuration(1,1,1);var n=(com.fasterxml.jackson.databind.node.ObjectNode)new com.fasterxml.jackson.databind.ObjectMapper().readTree(e.rawBody());
        ((com.fasterxml.jackson.databind.node.ArrayNode)n.path("d").path("cfg").path("p")).addArray().add(new BigInteger("999999999999999999999")).add("wide extension");
        assertTrue(new ConfigurationStore(source).accept(envelope("telemetry",n.toString(),1,now())));
        assertEquals("wide extension",value("SELECT v.text_value FROM config_value v JOIN config_current c ON c.revision_id=v.revision_id JOIN point_definition p ON p.id=v.definition_id WHERE c.ems_uuid='"+ems+"' AND p.source_id=999999999999999999999"));
        assertEquals("scalar",value("SELECT value_type FROM point_definition WHERE namespace='config' AND source_id=999999999999999999999"));
    }
    @AfterEach void cleanupMutableWork()throws Exception {
        if(source==null)return;
        try(var c=source.getConnection();var s=c.createStatement()) {
            c.setAutoCommit(false);ReliableMessageStore.lock(c,ems.toString());
            s.executeUpdate("DELETE FROM outbox WHERE ems_uuid='"+ems+"'");
            s.executeUpdate("DELETE FROM query_request WHERE ems_uuid='"+ems+"'");
            s.executeUpdate("DELETE FROM alarm_refresh_demand WHERE binding_period_id="+period);
            s.executeUpdate("DELETE FROM structure_refresh_demand WHERE binding_period_id="+period);
            c.commit();
        }
    }
}
