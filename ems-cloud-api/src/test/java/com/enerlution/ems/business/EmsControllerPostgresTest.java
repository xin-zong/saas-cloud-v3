package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

/** All DDL and facts are rolled back in the guarded, dedicated schema. */
@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
class EmsControllerPostgresTest {
  Connection connection;JdbcTemplate db;DomainSupport support;EmsController controller;EmsTelemetryQueries telemetry;
  final ObjectMapper json=new ObjectMapper();
  final UUID ems=UUID.fromString("11111111-1111-4111-8111-111111111111");
  final UUID outside=UUID.fromString("22222222-2222-4222-8222-222222222222");
  @BeforeEach void setup()throws Exception {
    connection=DriverManager.getConnection(System.getenv("EMS_TEST_DB_URL"),System.getenv("EMS_TEST_DB_USER"),System.getenv("EMS_TEST_DB_PASSWORD"));
    connection.setAutoCommit(false);db=new JdbcTemplate(new SingleConnectionDataSource(connection,true));
    assertEquals("ems_cloud_v2_proto",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_ingestion_test",db.queryForObject("select current_user",String.class));
    db.execute("SET LOCAL search_path TO ems_ingestion_tests,public");db.execute("SELECT pg_advisory_xact_lock(78291028)");
    assertEquals(0,db.queryForObject("select count(*) from information_schema.tables where table_schema='ems_ingestion_tests'",Integer.class));
    for(int v=1;v<=15;v++) {
      if(v==11)db.update("INSERT INTO app_role(code,name) VALUES('bootstrap_super_admin__o2','Superadmin')");
      final String prefix="V"+v+"__";
      try(var paths=Files.list(Path.of("src/main/resources/db/migration"))) {
        var file=paths.filter(p->p.getFileName().toString().startsWith(prefix)).findFirst().orElseThrow();
        db.execute(Files.readString(file).replace("CREATE EXTENSION IF NOT EXISTS btree_gist;",""));
      }
    }
    db.execute("""
      INSERT INTO organization(id,name) VALUES(1,'Root');
      INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id) VALUES(7,'actor','Actor','unused',1,1);
      INSERT INTO app_role(id,code,name,organization_id) VALUES(11,'ems_operator','EMS operator',1);
      INSERT INTO role_permission SELECT 11,code FROM permission WHERE code IN ('ems.read','ems.manage','ems.query');
      INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES(101,'a','A',1,1,1),(102,'b','B',1,1,1);
      INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(21,7,11,now()-interval '1 day');
      INSERT INTO member_grant_station VALUES(21,101);
      INSERT INTO device(id,station_id,code,name) VALUES(101,101,'a','A'),(102,102,'b','B');
      INSERT INTO ems_gateway VALUES('11111111-1111-4111-8111-111111111111',101),('22222222-2222-4222-8222-222222222222',102);
      INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from) VALUES(101,'11111111-1111-4111-8111-111111111111',101,now()-interval '1 day'),(102,'22222222-2222-4222-8222-222222222222',102,now()-interval '1 day');
      """);
    var session=mock(SessionTokens.class);when(session.userId()).thenReturn(7L);
    support=new DomainSupport(db,new AccessControl(db,session));
    telemetry=mock(EmsTelemetryQueries.class);controller=new EmsController(support,json,telemetry);
  }
  @AfterEach void cleanup()throws Exception {if(connection!=null){connection.rollback();connection.close();}}
  @Test void outsideStationCannotReadRegisterOrQuery() {
    assertEquals(403,assertThrows(BusinessException.class,()->controller.structure(outside)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->controller.register(102,new EmsController.Registration(UUID.randomUUID(),102))).status());
    assertEquals(403,assertThrows(BusinessException.class,()->controller.query(outside,new EmsController.Query("structure.get",json.createObjectNode()))).status());
  }
  @Test void registrationRejectsForeignAssetWithoutWriting() {
    assertEquals(400,assertThrows(BusinessException.class,()->controller.register(101,new EmsController.Registration(UUID.randomUUID(),102))).status());
    assertEquals(2,db.queryForObject("select count(*) from ems_gateway",Integer.class));
  }
  @Test void invalidOperationAndUnsupportedCabinetRejected() {
    assertEquals(400,assertThrows(BusinessException.class,()->controller.query(ems,new EmsController.Query("device.start",json.createObjectNode()))).status());
    assertEquals(400,assertThrows(BusinessException.class,()->controller.query(ems,new EmsController.Query("alarm.current.get",json.createObjectNode().put("c",1)))).status());
    assertEquals(0,db.queryForObject("select count(*) from query_request",Integer.class));
  }
  @Test void pollingRechecksRevocationAndHistoricalStation() {
    UUID request=UUID.randomUUID();
    db.update("INSERT INTO query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status,result) VALUES(?,?::uuid,7,101,?::uuid,'structure.get','{}',now(),now()+interval '30 seconds','succeeded','{\"ok\":true}')",request,ems.toString(),UUID.randomUUID().toString());
    assertNotNull(controller.poll(ems,request).data());
    db.update("DELETE FROM member_grant WHERE id=21");
    assertEquals(403,assertThrows(BusinessException.class,()->controller.poll(ems,request)).status());
  }
  void stationPermission(String permission) {
    db.update("INSERT INTO permission(code,name) VALUES(?,?) ON CONFLICT DO NOTHING",permission,permission);
    db.update("INSERT INTO role_permission VALUES(11,?) ON CONFLICT DO NOTHING",permission);
  }
  @Test void transferRequiresBothStationsThenInvalidatesAuthorityWithoutReattributingHistory() {
    assertEquals(403,assertThrows(BusinessException.class,()->controller.transfer(ems,new EmsController.Transfer(102))).status());
    db.update("INSERT INTO member_grant_station VALUES(21,102)");
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until,fencing_token) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute',7)",ems,UUID.randomUUID(),UUID.randomUUID());
    var pending=UUID.randomUUID();var sent=UUID.randomUUID();
    for(var id:List.of(pending,sent))db.update("INSERT INTO query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?,?,7,101,?,'structure.get','{}',clock_timestamp(),clock_timestamp()+interval '30 seconds','pending')",id,ems,UUID.randomUUID());
    db.update("INSERT INTO outbox(ems_uuid,type,query_request_id,topic,payload,status,attempts,first_attempt_at) VALUES(?,'query',?,'ems/test',?,'sent',1,clock_timestamp())",ems,sent,new byte[]{1});
    assertNotNull(controller.transfer(ems,new EmsController.Transfer(102)).data());
    assertNull(db.queryForObject("SELECT connection_id FROM connection_state WHERE ems_uuid=?",UUID.class,ems));
    assertEquals("expired",db.queryForObject("SELECT status FROM query_request WHERE id=?",String.class,pending));
    assertEquals("unknown",db.queryForObject("SELECT status FROM query_request WHERE id=?",String.class,sent));
    assertEquals(101,db.queryForObject("SELECT station_id FROM ems_binding_period WHERE id=101",Integer.class));
    assertEquals(102,db.queryForObject("SELECT station_id FROM device WHERE id=101",Integer.class));
    db.update("DELETE FROM member_grant_station WHERE station_id=101");
    assertEquals(403,assertThrows(BusinessException.class,()->controller.poll(ems,pending)).status());
  }
  @Test void queryQueueUsesActorAndCabinetBoundsWithoutExposingOutbox() {
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute')",ems,UUID.randomUUID(),UUID.randomUUID());
    var response=(Map<?,?>)controller.query(ems,new EmsController.Query("structure.get",json.createObjectNode())).data();
    assertEquals("pending",response.get("status"));assertFalse(response.containsKey("actor_id"));assertFalse(response.containsKey("connection_id"));
    assertEquals(7,db.queryForObject("SELECT actor_id FROM query_request",Integer.class));assertEquals(0,db.queryForObject("SELECT count(*) FROM outbox",Integer.class));
    db.update("INSERT INTO device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(101,'cabinet',1,'pcs',1,101,clock_timestamp())");
    assertEquals(400,assertThrows(BusinessException.class,()->controller.query(ems,new EmsController.Query("alarm.current.get",json.createObjectNode().put("c",new java.math.BigInteger("18446744073709551617"))))).status());
    for(int i=1;i<32;i++)controller.query(ems,new EmsController.Query("structure.get",json.createObjectNode()));
    assertEquals(429,assertThrows(BusinessException.class,()->controller.query(ems,new EmsController.Query("structure.get",json.createObjectNode()))).status());
  }
  @Test void currentConfigurationIsExactAndDoesNotExposeArbitrationFields() {
    db.update("INSERT INTO config_revision(id,ems_uuid,cfg_rev,content_hash) VALUES(101,?,0,repeat('a',64))",ems);
    db.update("INSERT INTO config_acceptance VALUES(101,101,clock_timestamp())");
    db.update("INSERT INTO config_current VALUES(?,101,101,7,1)",ems);
    db.update("INSERT INTO point_definition(id,catalog_version,namespace,source_id,value_type) VALUES(101,'test','config',9007199254740993,'scalar')");
    db.update("INSERT INTO config_value(revision_id,definition_id,value_type,number_value) VALUES(101,101,'scalar',9007199254740993.000000000001)");
    var response=(Map<?,?>)controller.configuration(ems).data();assertEquals("0",response.get("revision"));
    assertFalse(response.containsKey("ingress_fence"));assertFalse(response.containsKey("ingress_order"));
    var value=(Map<?,?>)((List<?>)response.get("values")).getFirst();assertEquals("9007199254740993",value.get("source_id"));assertEquals("9007199254740993.000000000001",value.get("value"));
  }
  @Test void businessAlarmHandlingAndWorkOrderLinkUseOriginalStationAfterDeviceMove() {
    stationPermission("alarm.read");stationPermission("alarm.handle");stationPermission("workorder.create");
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from,valid_to) VALUES(103,101,'cabinet',1,'pcs',1,101,now()-interval '12 hours',now()-interval '1 minute')");
    db.update("INSERT INTO alarm(id,device_id,code,title,severity,occurred_at) VALUES(103,101,'050001','EMS 告警 050001','critical',now()-interval '1 hour')");
    db.update("INSERT INTO ems_alarm_identity(ems_uuid,alarm_id,business_alarm_id,business_device_binding_id) VALUES(?,?,103,103)",ems,UUID.randomUUID());
    db.update("UPDATE ems_binding_period SET valid_to=clock_timestamp() WHERE id=101");
    db.update("UPDATE device SET station_id=102 WHERE id=101");
    var maintenance=new MaintenanceController(support);
    assertEquals(1,((List<?>)maintenance.alarms(101,100,0).data()).size());
    maintenance.acknowledge(103);maintenance.alarmNote(103,new MaintenanceController.Note("Observed by operator"));
    maintenance.create(new MaintenanceController.NewOrder(101,"EMS investigation","Inspect saved alarm evidence",null,null,103L));
    assertEquals(1,db.queryForObject("SELECT count(*) FROM work_order_alarm",Integer.class));
    assertEquals(0,db.queryForObject("SELECT count(*) FROM outbox",Integer.class));
    db.update("INSERT INTO member_grant_station VALUES(21,102)");db.update("DELETE FROM member_grant_station WHERE station_id=101");
    assertTrue(((List<?>)maintenance.alarms(102,100,0).data()).isEmpty());
    assertEquals(403,assertThrows(BusinessException.class,()->maintenance.acknowledge(103)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->maintenance.alarmNotes(103)).status());
    assertEquals(400,assertThrows(BusinessException.class,()->maintenance.create(new MaintenanceController.NewOrder(102,"Wrong station","Cannot link historical alarm",null,null,103L))).status());
  }
  @Test void historicalTypedReadsFilterSavedPeriodsAndRejectUnconfirmedSemanticAndWindow() {
    stationPermission("telemetry.read");
    db.update("INSERT INTO measurement_kind(code,name,unit) VALUES('exact','Exact','')");
    db.update("INSERT INTO measurement_point(id,device_id,kind_code,code) VALUES(101,101,'exact','p')");
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(103,101,'cabinet',1,'pcs',1,101,now()-interval '12 hours')");
    db.update("INSERT INTO point_definition(id,catalog_version,namespace,source_id,value_type,aggregation) VALUES(103,'test','cabinet',1,'number','last')");
    db.update("INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) VALUES(103,103,101,now()-interval '11 hours')");
    var history=new TelemetryController(support,json,"http://127.0.0.1","test","test","ems_cloud_v2_proto_telemetry",telemetry);
    var now=java.time.OffsetDateTime.now();
    assertEquals(400,assertThrows(BusinessException.class,()->history.history(101,now.minusHours(1),now,15,"ems","avg")).status());
    assertEquals(400,assertThrows(BusinessException.class,()->history.history(101,now.minusDays(32),now,15,"ems","last")).status());
    assertEquals(400,assertThrows(BusinessException.class,()->history.history(101,now.minusHours(1),now,15,"ems","sum")).status());
    when(telemetry.history(eq(101L),eq(List.of(101L)),anyLong(),anyLong())).thenReturn(json.createArrayNode());
    assertNotNull(history.history(101,now.minusHours(1),now,15,"ems","last").data());
    verify(telemetry).history(eq(101L),eq(List.of(101L)),anyLong(),anyLong());
    db.update("UPDATE point_binding SET valid_to=clock_timestamp() WHERE device_binding_id=103");
    db.update("UPDATE device_binding SET valid_to=clock_timestamp() WHERE id=103");
    db.update("UPDATE ems_binding_period SET valid_to=clock_timestamp() WHERE id=101");
    db.update("UPDATE device SET station_id=102 WHERE id=101");
    assertNotNull(history.history(101,now.minusHours(1),now,15,"ems","last").data());
    db.update("INSERT INTO member_grant_station VALUES(21,102)");db.update("DELETE FROM member_grant_station WHERE station_id=101");
    clearInvocations(telemetry);assertTrue(((List<?>)history.history(101,now.minusHours(1),now,15,"ems","last").data()).isEmpty());
    verifyNoInteractions(telemetry);
  }
  @Test void sameRevisionReadinessFalseDoesNotExposePreviouslyAcceptedCells() {
    stationPermission("telemetry.read");
    UUID connectionId=UUID.randomUUID();
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute')",ems,connectionId,UUID.randomUUID());
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(103,101,'cabinet',1,'bms',1,101,clock_timestamp())");
    db.update("INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash) VALUES(103,?,1,'{}',repeat('a',64))",ems);
    db.update("INSERT INTO structure_acceptance VALUES(101,103,clock_timestamp())");
    db.update("INSERT INTO structure_current VALUES(?,101,?,1,103,'{\"clusters\":[{\"c\":1,\"state\":\"active\",\"cellReady\":false}]}',clock_timestamp())",ems,connectionId);
    when(telemetry.cells(List.of(101L),1,103,connectionId)).thenReturn(List.of(Map.of("value",List.of(List.of("3.14")))));
    assertEquals(false,((Map<?,?>)controller.cells(101).data()).get("known"));verifyNoInteractions(telemetry);
    db.update("UPDATE structure_current SET metadata='{\"clusterLayout\":{\"bms\":{\"count\":1,\"bmuCount\":1}},\"clusters\":[{\"c\":1,\"state\":\"active\",\"cellReady\":true}]}'");
    assertEquals(true,((Map<?,?>)controller.cells(101).data()).get("known"));
  }
  @Test void currentAlarmMissingUnknownAndConfirmedEmptyHaveDistinctParentDtos() {
    UUID connectionId=UUID.randomUUID();
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute')",ems,connectionId,UUID.randomUUID());
    var missing=(Map<?,?>)controller.alarms(ems,"current",null,100,0).data();
    assertEquals(false,missing.get("known"));assertEquals("no_current_connection_snapshot",missing.get("unknownReason"));
    db.update("INSERT INTO alarm_current_snapshot(ems_uuid,cabinet_no,connection_id,seq,known,observed_at,binding_period_id,content_hash) VALUES(?,1,?,1,false,clock_timestamp(),101,repeat('a',64))",ems,connectionId);
    var unknown=(Map<?,?>)controller.alarms(ems,"current",null,100,0).data();
    assertEquals(false,unknown.get("known"));assertEquals(false,((Map<?,?>)((List<?>)unknown.get("snapshots")).getFirst()).get("known"));
    db.update("UPDATE alarm_current_snapshot SET known=true");
    var empty=(Map<?,?>)controller.alarms(ems,"current",null,100,0).data();assertEquals(true,empty.get("known"));
    var parent=(Map<?,?>)((List<?>)empty.get("snapshots")).getFirst();assertTrue(((List<?>)parent.get("alarms")).isEmpty());assertEquals(0L,parent.get("total_members"));assertEquals(false,parent.get("hasMore"));
  }
  @Test void bmuDeviceOnlySeesExplicitMappedSlotsAndLatestPaginationIsExplicit() {
    stationPermission("telemetry.read");UUID connectionId=UUID.randomUUID();
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute')",ems,connectionId,UUID.randomUUID());
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(103,101,'cabinet',1,'bmu',2,101,clock_timestamp()),(104,101,'cabinet',1,'bmu',3,101,clock_timestamp())");
    db.update("INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash) VALUES(103,?,1,'{}',repeat('a',64))",ems);
    db.update("INSERT INTO structure_acceptance VALUES(101,103,clock_timestamp())");
    db.update("INSERT INTO structure_current VALUES(?,101,?,1,103,'{\"clusterLayout\":{\"bms\":{\"count\":1,\"bmuCount\":3}},\"clusters\":[{\"c\":1,\"state\":\"active\",\"cellReady\":true}]}',clock_timestamp())",ems,connectionId);
    when(telemetry.cells(List.of(101L),1,103,connectionId)).thenReturn(List.of(Map.of("value",List.of(List.of("1"),List.of("2"),List.of("3")))));
    var cells=(Map<?,?>)controller.cells(101).data();var value=(Map<?,?>)((List<?>)cells.get("values")).getFirst();
    assertEquals(List.of("2","3"),value.get("bmuSlots"));assertEquals(List.of(List.of("2"),List.of("3")),value.get("value"));
    var page=(Map<?,?>)controller.latest(101,1,0).data();assertEquals(false,page.get("hasMore"));assertEquals(0L,page.get("total"));
    assertEquals(400,assertThrows(BusinessException.class,()->controller.latest(101,201,0)).status());
  }
  @Test void managementRegistersGenuineAssetAndApprovedSourceMappingWithSafeClosure() {
    assertTrue(support.access.permissions().containsAll(List.of("ems.read","ems.manage","ems.query")));
    assertEquals(3,db.queryForObject("SELECT count(*) FROM role_permission p JOIN app_role r ON r.id=p.role_id WHERE r.code='bootstrap_super_admin__o2' AND p.permission_code IN ('ems.read','ems.manage','ems.query')",Integer.class));
    db.update("INSERT INTO device(id,station_id,code,name) VALUES(103,101,'genuine_test_ems','Synthetic isolated EMS')");
    UUID identity=UUID.randomUUID();controller.register(101,new EmsController.Registration(identity,103));
    var device=(Map<?,?>)controller.deviceBinding(identity,new EmsController.DeviceMapping("ems",null,"ems","1",103)).data();
    long binding=Long.parseLong(device.get("id").toString());
    var definition=com.enerlution.ems.protocol.PointCatalog.loadDefault().definitions().stream().filter(d->d.namespace().equals("ems")&&d.wireType()==com.enerlution.ems.protocol.PointCatalog.WireType.NUMBER).findFirst().orElseThrow();
    db.update("INSERT INTO measurement_kind(code,name,unit) VALUES('management_test','Synthetic approved mapping',?)",Objects.toString(definition.verifiedUnit(),""));
    db.update("INSERT INTO measurement_point(id,device_id,kind_code,code) VALUES(103,103,'management_test','test')");
    var mapped=(Map<?,?>)controller.pointBinding(identity,new EmsController.PointMapping(binding,"ems",Integer.toString(definition.sourcePointId()),103)).data();assertNotNull(mapped.get("catalogVersion"));
    assertEquals(400,assertThrows(BusinessException.class,()->controller.pointBinding(identity,new EmsController.PointMapping(binding,"config","1",103))).status());
    assertEquals(1,db.queryForObject("SELECT count(*) FROM point_binding WHERE device_binding_id=? AND valid_to IS NULL",Integer.class,binding));
    controller.closeDeviceBinding(identity,binding);
    assertEquals(0,db.queryForObject("SELECT count(*) FROM point_binding WHERE device_binding_id=? AND valid_to IS NULL",Integer.class,binding));
    assertEquals(0,db.queryForObject("SELECT count(*) FROM device_binding WHERE id=? AND valid_to IS NULL",Integer.class,binding));
  }
  @Test void currentAlarmParentPaginationEndsAtTheFinalAndExhaustedGlobalPages() {
    UUID connectionId=UUID.randomUUID();
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute')",ems,connectionId,UUID.randomUUID());
    db.update("INSERT INTO alarm_current_snapshot(ems_uuid,cabinet_no,connection_id,seq,known,observed_at,binding_period_id,content_hash) VALUES(?,1,?,1,true,clock_timestamp(),101,repeat('a',64))",ems,connectionId);
    for(int i=1;i<=2;i++) {
      UUID alarm=UUID.fromString("00000000-0000-4000-8000-00000000000"+i);
      db.update("INSERT INTO ems_alarm_identity(ems_uuid,alarm_id) VALUES(?,?)",ems,alarm);
      String record="{\"alarmId\":\""+alarm+"\",\"seq\":1,\"sv\":1,\"device\":{\"c\":1,\"type\":\"pcs\",\"id\":null},\"code\":\"050001\",\"level\":2,\"state\":\"active\",\"ts\":1788220800000}";
      db.update("INSERT INTO alarm_current_member(ems_uuid,cabinet_no,connection_id,seq,alarm_id,record) VALUES(?,1,?,1,?,?::jsonb)",ems,connectionId,alarm,record);
    }
    var first=(Map<?,?>)controller.alarms(ems,"current",null,1,0).data();
    assertEquals(true,((Map<?,?>)((List<?>)first.get("snapshots")).getFirst()).get("hasMore"));
    var last=(Map<?,?>)controller.alarms(ems,"current",null,1,1).data();
    assertEquals(false,((Map<?,?>)((List<?>)last.get("snapshots")).getFirst()).get("hasMore"));
    var exhausted=(Map<?,?>)controller.alarms(ems,"current",null,1,2).data();
    assertEquals(false,((Map<?,?>)((List<?>)exhausted.get("snapshots")).getFirst()).get("hasMore"));
  }
}
