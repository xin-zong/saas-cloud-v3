package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** One synthetic scenario, only task8 tables; PG rolls back and CH fixture IDs are unique per run. */
@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
@EnabledIfEnvironmentVariable(named="EMS_TEST_CH_URL",matches=".+")
class EmsTelemetryClickHouseTest {
  EmsControllerPostgresTest fixture;
  final long point=900000000000L+new java.security.SecureRandom().nextInt(100000000);
  @BeforeEach void setup()throws Exception{fixture=new EmsControllerPostgresTest();fixture.setup();}
  @AfterEach void cleanup()throws Exception{if(fixture!=null)fixture.cleanup();}
  @Test void exactTypedFactsFinalDedupLiveLatestAndHistoricalStationScope()throws Exception {
    var db=fixture.db;fixture.stationPermission("telemetry.read");
    // This explicitly models a previously accepted asset move; it is not a retroactive management API.
    db.update("UPDATE ems_binding_period SET valid_to=now()-interval '13 hours' WHERE id=101");
    db.update("UPDATE device SET station_id=102 WHERE id=101");
    db.update("INSERT INTO measurement_kind(code,name,unit) VALUES('typed_test','Synthetic exact fixture','')");
    for(int i=0;i<4;i++)db.update("INSERT INTO measurement_point(id,device_id,kind_code,code) VALUES(?,101,'typed_test',?)",point+i,"p"+i);
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from,valid_to) VALUES(104,102,'cabinet',1,'pcs',1,101,now()-interval '12 hours',now()-interval '2 hours')");
    db.update("INSERT INTO point_definition(id,catalog_version,namespace,source_id,value_type,aggregation) VALUES(104,'synthetic','cabinet',1,'number','average'),(105,'synthetic','cabinet',2,'text','last'),(106,'synthetic','cabinet',3,'u16_words','last'),(107,'synthetic','cabinet',4,'number','last')");
    db.update("INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from,valid_to) VALUES(104,104,?,now()-interval '12 hours',now()-interval '2 hours')",point);
    db.update("UPDATE device SET station_id=101 WHERE id=101");
    db.update("INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from) VALUES(103,?,101,now()-interval '1 hour')",fixture.ems);
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(105,103,'cabinet',1,'pcs',1,101,now()-interval '1 hour')");
    for(int i=0;i<4;i++)db.update("INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) VALUES(105,?,?,now()-interval '1 hour')",104+i,point+i);
    long now=db.queryForObject("SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint",Long.class);
    long bucket=Math.floorDiv(now-60000,60000)*60000;
    var rows=new ArrayList<ObjectNode>();
    var first=observation(point,103,bucket+1000,now-1000,"number","9007199254740993","cabinet_30s");
    rows.add(first);rows.add(first.deepCopy()); // Identical immutable fact replay before FINAL merges.
    rows.add(observation(point,103,bucket+1000,now-900,"number","9007199254740993","cabinet_30s")); // Independent MQTT receipt.
    rows.add(observation(point,103,bucket+3000,now-800,"number","9007199254740995","cabinet_30s"));
    rows.add(observation(point,103,bucket+2000,now+1000,"number","9007199254740994","important_history"));
    rows.add(observation(point,102,now-3*3600000,now+2000,"number","1E+99","cabinet_30s"));
    rows.add(observation(point+1,103,bucket+1000,now-700,"text","1.02","cabinet_60s"));
    var bitmap=observation(point+2,103,bucket+1000,now-600,"u16_words",null,"cabinet_30s");bitmap.putArray("u16_words").add(65535).add(0).add(12).add(4);rows.add(bitmap);
    var missing=observation(point+3,103,null,now-500,"null",null,"cabinet_30s");missing.put("quality","invalid");rows.add(missing);
    insert("task8_observation",rows);
    var queries=new EmsTelemetryQueries(fixture.json,System.getenv("EMS_TEST_CH_URL"),System.getenv("EMS_TEST_CH_USER"),System.getenv("EMS_TEST_CH_PASSWORD"),true);
    var controller=new EmsController(fixture.support,fixture.json,queries);
    var page=(Map<?,?>)controller.latest(101,2,0).data();assertEquals(4L,page.get("total"));assertEquals(true,page.get("hasMore"));
    var latest=(List<?>)page.get("items");var numeric=(Map<?,?>)latest.getFirst();assertEquals("9007199254740995",numeric.get("value"));assertEquals("cabinet_30s",numeric.get("source"));
    assertTrue(((List<?>)numeric.get("supportedAggregations")).contains("avg"));assertEquals("1.02",((Map<?,?>)latest.get(1)).get("value"));
    var second=(Map<?,?>)controller.latest(101,2,2).data();assertEquals(false,second.get("hasMore"));
    var tail=(List<?>)second.get("items");assertEquals(List.of(65535,0,12,4),((Map<?,?>)tail.getFirst()).get("value"));
    assertNull(((Map<?,?>)tail.get(1)).get("value"));assertNull(((Map<?,?>)tail.get(1)).get("sourceTime"));assertEquals(now-500,((Map<?,?>)tail.get(1)).get("receivedAt"));
    var history=new TelemetryController(fixture.support,fixture.json,System.getenv("EMS_TEST_CH_URL"),"unused","unused","ems_cloud_v2_proto_telemetry",queries);
    var aggregates=(List<?>)history.history(point,OffsetDateTime.ofInstant(Instant.ofEpochMilli(now-4*3600000),ZoneOffset.UTC),OffsetDateTime.now(ZoneOffset.UTC),1,"ems","avg").data();
    assertEquals(1,aggregates.size());var average=(Map<?,?>)aggregates.getFirst();assertEquals("9007199254740994",average.get("value"));assertEquals(3,average.get("samples"));
    var conflict=observation(point,103,bucket+1000,now-100,"number","9","cabinet_30s");insert("task8_observation",List.of(conflict));
    var conflicting=EmsTelemetryQueries.aggregate(queries.history(point,List.of(103L),bucket,bucket+60000),"avg",1).getFirst();assertEquals(true,conflicting.get("conflict"));assertNull(conflicting.get("value"));
    UUID oldConnection=UUID.randomUUID(),newConnection=UUID.randomUUID();
    db.update("INSERT INTO connection_state(ems_uuid,connection_id,ingress_generation,ingress_order,last_fresh_heartbeat,lease_owner,lease_until) VALUES(?,?,?,1,clock_timestamp(),'worker',clock_timestamp()+interval '1 minute')",fixture.ems,oldConnection,UUID.randomUUID());
    db.update("INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(106,103,'cabinet',1,'bms',1,101,clock_timestamp())");
    db.update("INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash) VALUES(?,?,1,'{}',repeat('a',64))",point,fixture.ems);
    db.update("INSERT INTO structure_acceptance VALUES(103,?,clock_timestamp())",point);
    db.update("INSERT INTO structure_current VALUES(?,103,?,1,?,'{\"clusterLayout\":{\"bms\":{\"count\":1,\"bmuCount\":1}},\"clusters\":[{\"c\":1,\"state\":\"active\",\"cellReady\":true}]}',clock_timestamp())",fixture.ems,oldConnection,point);
    var cell=fixture.json.createObjectNode();cell.put("fact_id",id());cell.put("binding_period_id",103);cell.put("cabinet_no",1);cell.put("structure_revision_id",point);cell.put("connection_id",oldConnection.toString());
    cell.put("cell_kind","cell_voltage");cell.put("source_message_id",id());cell.put("source_time_kind","source");cell.put("source_at_ms",bucket+1000);cell.put("received_at_ms",now);cell.put("quality","valid");cell.put("values_present",1);
    cell.putArray("cell_values").addArray().add("3.141592653589793238462643383279").addNull();insert("task8_cell",List.of(cell,cell));
    var cells=queries.cells(List.of(103L),1,point,oldConnection);assertEquals(1,cells.size());assertEquals(List.of(Arrays.asList("3.141592653589793238462643383279",null)),cells.getFirst().get("value"));
    assertEquals(true,((Map<?,?>)controller.cells(101).data()).get("known"));
    db.update("UPDATE connection_state SET connection_id=? WHERE ems_uuid=?",newConnection,fixture.ems);
    db.update("UPDATE structure_current SET connection_id=?,received_at=clock_timestamp() WHERE ems_uuid=?",newConnection,fixture.ems);
    var reconnected=(Map<?,?>)controller.cells(101).data();
    assertEquals(false,reconnected.get("known"),"Same period/revision readiness must not revive the previous connection frame");
    assertEquals("no_accepted_cell_observation",reconnected.get("unknownReason"));
    var legacy=cell.deepCopy();legacy.put("fact_id",id());legacy.putNull("connection_id");legacy.put("received_at_ms",now+1);insert("task8_cell",List.of(legacy));
    assertEquals(false,((Map<?,?>)controller.cells(101).data()).get("known"),"Legacy null provenance cannot establish current cells");
    var currentCell=cell.deepCopy();currentCell.put("fact_id",id());currentCell.put("connection_id",newConnection.toString());currentCell.put("received_at_ms",now+2);insert("task8_cell",List.of(currentCell));
    var currentCells=(Map<?,?>)controller.cells(101).data();assertEquals(true,currentCells.get("known"));
    assertEquals(List.of(Arrays.asList("3.141592653589793238462643383279",null)),((Map<?,?>)((List<?>)currentCells.get("values")).getFirst()).get("value"));
    var beforeNull=observation(point+3,103,bucket+1000,now-200,"number","42","cabinet_30s");
    var lastNull=observation(point+3,103,bucket+3000,now-100,"null",null,"cabinet_30s");lastNull.put("quality","invalid");
    insert("task8_observation",List.of(beforeNull,lastNull));
    var lastRows=(List<?>)history.history(point+3,OffsetDateTime.ofInstant(Instant.ofEpochMilli(bucket),ZoneOffset.UTC),OffsetDateTime.now(ZoneOffset.UTC),1,"ems","last").data();
    var last=(Map<?,?>)lastRows.getFirst();assertNull(last.get("value"));assertEquals("invalid",last.get("quality"));assertEquals(bucket+3000,last.get("sourceTime"));
  }
  ObjectNode observation(long point,long period,Long source,long receipt,String kind,String value,String type) {
    var row=fixture.json.createObjectNode();row.put("fact_id",id());row.put("binding_period_id",period);row.put("point_id",point);row.put("source_message_id",id());row.put("source_type",type);
    row.put("source_time_kind",source==null?"unknown":type.equals("important_history")?"archive":"source");if(source==null)row.putNull("source_at_ms");else row.put("source_at_ms",source);
    row.put("received_at_ms",receipt);row.put("quality","valid");row.put("value_kind",kind);row.putNull("number_exact");row.putNull("text_value");row.putArray("u16_words");
    if(kind.equals("number"))row.put("number_exact",value);if(kind.equals("text"))row.put("text_value",value);return row;
  }
  String id(){return UUID.randomUUID().toString().replace("-","")+UUID.randomUUID().toString().replace("-","");}
  void insert(String table,List<ObjectNode> rows)throws Exception {
    assertTrue(Set.of("task8_observation","task8_cell").contains(table));
    String payload="INSERT INTO ems_cloud_v2_proto_telemetry."+table+" FORMAT JSONEachRow\n"+String.join("\n",rows.stream().map(Object::toString).toList());
    var request=HttpRequest.newBuilder(URI.create(System.getenv("EMS_TEST_CH_URL"))).timeout(Duration.ofSeconds(10))
        .header("Authorization","Basic "+Base64.getEncoder().encodeToString((System.getenv("EMS_TEST_CH_USER")+":"+System.getenv("EMS_TEST_CH_PASSWORD")).getBytes(StandardCharsets.UTF_8)))
        .POST(HttpRequest.BodyPublishers.ofString(payload)).build();
    var response=HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build().send(request,HttpResponse.BodyHandlers.discarding());
    assertEquals(200,response.statusCode(),"Synthetic task8 fixture insert failed");
  }
}
