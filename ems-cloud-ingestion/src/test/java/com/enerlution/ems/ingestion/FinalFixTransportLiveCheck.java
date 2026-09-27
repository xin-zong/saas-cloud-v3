package com.enerlution.ems.ingestion;

import org.postgresql.ds.PGSimpleDataSource;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Actual isolated MQTT persistent-session + Kafka + PG check. Managed environment only. */
public final class FinalFixTransportLiveCheck {
 public static void main(String[] args)throws Exception {
  var p=IngestionProperties.environment();
  require(p.mqttUri().equals("ssl://127.0.0.1:18887")&&p.leaseSeconds()==30,"Isolated broker and 30-second lease required");
  require(p.topics().values().stream().allMatch(t->t.startsWith("ems-cloud-v3.test.finalfix-20260928.")),"Isolated topics required");
  var source=new PGSimpleDataSource();source.setURL(p.databaseUrl());source.setUser(p.databaseUser());source.setPassword(p.databasePassword());source.setConnectTimeout(5);source.setSocketTimeout(5);
  source.setCurrentSchema("ems_ingestion_tests,public");
  UUID ems=UUID.fromString("755facdc-9bdf-43d0-9412-c94f860a01ec"),connection=UUID.randomUUID(),alarm=UUID.randomUUID();
  try(var c=source.getConnection();var s=c.createStatement()) {
   try(var r=s.executeQuery("SELECT current_database(),current_user,current_schema()")){r.next();require(r.getString(1).equals("ems_cloud_v2_proto")&&r.getString(2).equals("ems_ingestion_test")&&r.getString(3).equals("ems_ingestion_tests"),"Isolated PG required");}
   s.executeUpdate("INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh) VALUES(995,'finalfix','Final fix synthetic',1,1) ON CONFLICT DO NOTHING");
   long device;try(var r=s.executeQuery("INSERT INTO device(station_id,code,name) VALUES(995,'"+ems+"','Final fix synthetic') RETURNING id")){r.next();device=r.getLong(1);}
   s.executeUpdate("INSERT INTO ems_gateway VALUES('"+ems+"',"+device+")");
   s.executeUpdate("INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from) VALUES('"+ems+"',995,clock_timestamp()-interval '1 hour')");
  }
  var savedAcks=new AtomicInteger();var legalAcks=new AtomicInteger();
  var device=new MqttClient(p.mqttUri(),ems.toString(),new MemoryPersistence());
  device.setCallback(new MqttCallback(){public void connectionLost(Throwable e){}public void deliveryComplete(IMqttDeliveryToken t){}public void messageArrived(String t,MqttMessage m)throws Exception {
   var body=new com.fasterxml.jackson.databind.ObjectMapper().readTree(m.getPayload());
   // Protocol success ACK is type + identity with no error; it has no invented "saved" status field.
   if(t.endsWith("/down/ack")&&!body.has("error")) {
    savedAcks.incrementAndGet();
    if(body.path("type").asText().equals("alarm_event")&&body.path("alarmId").asText().equals(alarm.toString())&&body.path("seq").asInt()==1)legalAcks.incrementAndGet();
   }
  }});
  var options=new MqttConnectOptions();options.setMqttVersion(MqttConnectOptions.MQTT_VERSION_3_1_1);options.setCleanSession(true);
  options.setSocketFactory(MqttTls.create(Path.of(required("EMS_TEST_MQTT_CA")),Path.of(required("EMS_TEST_MQTT_CERT")),Path.of(required("EMS_TEST_MQTT_KEY"))));options.setHttpsHostnameVerificationEnabled(true);
  var lease=new GatewayLease(source,"finalfix-live:"+UUID.randomUUID(),30);
  try {
   device.connect(options);device.subscribe("ems/v1/"+ems+"/down/#",1);
   try(var worker=new IngestionWorker(p,lease,source)) {
    device.publish("ems/v1/"+ems+"/up/alarm","{".getBytes(StandardCharsets.UTF_8),1,false);
    await(()->worker.diagnostics().get("DECODER_REJECTION")==1,10,"Invalid frame diagnosed once");
    require(savedAcks.get()==0,"Invalid input has no saved business ACK");
    publishHeartbeat(device,ems,connection);
    await(()->scalar(source,"SELECT count(*) FROM connection_state WHERE ems_uuid='"+ems+"' AND connection_id='"+connection+"'")==1,15,"Valid frame progresses after poison input through Kafka/PG");
    var fence=lease.acquire(ems).orElseThrow();
    // Wall-clock silence crosses the default TTL; renewal must preserve the connection and fence.
    long quietStart=System.nanoTime();Thread.sleep(35000);
    require(Duration.ofNanos(System.nanoTime()-quietStart).toSeconds()>=35,"Observed quiet duration");
    require(lease.isOwner(ems,fence),"Quiet worker retains live lease");
    require(scalar(source,"SELECT count(*) FROM connection_state WHERE ems_uuid='"+ems+"' AND connection_id='"+connection+"' AND last_fresh_heartbeat<clock_timestamp()-interval '30 seconds'")==1,"Renewal preserves quiet heartbeat and connection");
    require(scalar(source,"SELECT count(*) FROM ems_connection_read WHERE ems_uuid='"+ems+"' AND reachable")==1,"Quiet gateway reachable before heartbeat timeout");
    require(worker.diagnostics().get("DECODER_REJECTION")==1,"No poison reconnect/redelivery loop");
    String event="{\"v\":1,\"type\":\"alarm_event\",\"sv\":null,\"alarmId\":\""+alarm+"\",\"seq\":1,\"device\":{\"c\":1,\"type\":\"bms\",\"id\":1},\"code\":\"020101\",\"level\":2,\"state\":\"active\",\"ts\":"+System.currentTimeMillis()+"}";
    device.publish("ems/v1/"+ems+"/up/alarm",event.getBytes(StandardCharsets.UTF_8),1,false);
    await(()->legalAcks.get()>0,15,"Subsequent legal reliable object saves and ACKs");
    require(scalar(source,"SELECT count(*) FROM reliable_message WHERE ems_uuid='"+ems+"'")==1,"Only legal object durably saved");
   }
   require(scalar(source,"SELECT count(*) FROM connection_state WHERE ems_uuid='"+ems+"' AND lease_owner IS NOT NULL")==0,"Shutdown releases lease");
   try(var worker=new IngestionWorker(p,new GatewayLease(source,"finalfix-restart:"+UUID.randomUUID(),30),source)) {
    var next=UUID.randomUUID();publishHeartbeat(device,ems,next);
    await(()->scalar(source,"SELECT count(*) FROM connection_state WHERE ems_uuid='"+ems+"' AND connection_id='"+next+"'")==1,15,"Same persistent client session progresses after restart");
    Thread.sleep(1500);require(worker.diagnostics().get("DECODER_REJECTION")==0,"Rejected frame does not return in persistent session");
   }
  } finally {if(device.isConnected())device.disconnect();device.close();}
  System.out.println("FINAL_FIX_TRANSPORT_PASS invalid_qos1_consumed valid_kafka_pg_progress no_invalid_saved_ack persistent_restart quiet_35s_live_fence shutdown_release");
 }
 static void publishHeartbeat(MqttClient device,UUID ems,UUID connection)throws Exception {device.publish("ems/v1/"+ems+"/up/heartbeat",("{\"v\":1,\"emsId\":\""+ems+"\",\"connectionId\":\""+connection+"\",\"uptimeSeconds\":120}").getBytes(StandardCharsets.UTF_8),1,false);}
 interface Check {boolean get()throws Exception;}
 static void await(Check check,int seconds,String label)throws Exception {long deadline=System.nanoTime()+Duration.ofSeconds(seconds).toNanos();while(System.nanoTime()<deadline){if(check.get())return;Thread.sleep(100);}throw new AssertionError(label);}
 static long scalar(javax.sql.DataSource ds,String sql)throws Exception {try(var c=ds.getConnection();var s=c.createStatement();var r=s.executeQuery(sql)){r.next();return r.getLong(1);}}
 static void require(boolean ok,String label){if(!ok)throw new AssertionError(label);}
 static String required(String name){return Objects.requireNonNull(System.getenv(name),name);}
}
