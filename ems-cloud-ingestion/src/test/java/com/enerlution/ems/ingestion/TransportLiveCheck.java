package com.enerlution.ems.ingestion;

import org.postgresql.ds.PGSimpleDataSource;
import org.apache.kafka.clients.consumer.*;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.math.BigInteger;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Server-only standalone check. Requires pre-created temporary registration/topics and managed credentials. */
public final class TransportLiveCheck {
 public static void main(String[] args)throws Exception {
  var p=IngestionProperties.environment();
  if(p.topics().values().stream().anyMatch(t->!t.startsWith("ems-cloud-v3.test.task4-")))throw new IllegalStateException("Temporary topics required");
  var id=UUID.fromString("755facdc-9bdf-43d0-9412-c94f860a01ec");
  var ds=new PGSimpleDataSource();ds.setURL(p.databaseUrl());ds.setUser(p.databaseUser());ds.setPassword(p.databasePassword());ds.setConnectTimeout(5);ds.setSocketTimeout(5);ds.setCancelSignalTimeout(2);
  var first=new GatewayLease(ds,"task4-check-a",1);var second=new GatewayLease(ds,"task4-check-b",30);
  require(first.acquire(UUID.randomUUID()).isEmpty(),"Unknown registration rejected");
  require(first.acquire(UUID.fromString("c75fa8ae-bb83-49a2-8f72-bc83db7f4267")).isEmpty(),"Registered gateway without active binding rejected");
  var old=first.acquire(id).orElseThrow();require(first.isOwner(id,old),"Initial owner");
  require(second.acquire(id).isEmpty(),"Concurrent owner rejected");
  Thread.sleep(1200);var fresh=second.acquire(id).orElseThrow();
  require(fresh.compareTo(old)>0&&!first.isOwner(id,old),"Expired fence rejected");
  // Allow test lease to expire so actual worker can acquire without administrative writes.
  try(var c=ds.getConnection();var q=c.prepareStatement("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid=?::uuid AND lease_owner='task4-check-b'")){q.setString(1,id.toString());q.executeUpdate();}
  var cp=p.producerProperties();cp.remove("key.serializer");cp.remove("value.serializer");
  cp.setProperty("key.deserializer","org.apache.kafka.common.serialization.StringDeserializer");cp.setProperty("value.deserializer","org.apache.kafka.common.serialization.StringDeserializer");
  cp.setProperty("group.id","ems-cloud-v3.ingestion.task4-20260928.live");cp.setProperty("auto.offset.reset","earliest");cp.setProperty("enable.auto.commit","false");
  var ackCount=new AtomicInteger();
  try(var consumer=new KafkaConsumer<String,String>(cp);var worker=new IngestionWorker(p,new GatewayLease(ds,"task4-check-worker",30))) {
   consumer.subscribe(p.topics().values());
   var device=new MqttClient(p.mqttUri(),id.toString(),new MemoryPersistence());
   device.setCallback(new MqttCallback(){public void connectionLost(Throwable c){}public void deliveryComplete(IMqttDeliveryToken t){}public void messageArrived(String t,MqttMessage m){ackCount.incrementAndGet();}});
   var options=new MqttConnectOptions();options.setMqttVersion(MqttConnectOptions.MQTT_VERSION_3_1_1);options.setCleanSession(true);
   options.setSocketFactory(MqttTls.create(Path.of(required("EMS_TEST_MQTT_CA")),Path.of(required("EMS_TEST_MQTT_CERT")),Path.of(required("EMS_TEST_MQTT_KEY"))));options.setHttpsHostnameVerificationEnabled(true);
   try {
    device.connect(options);device.subscribe("ems/v1/"+id+"/down/#",1);
    var raw="{\"v\":1,\"emsId\":\""+id+"\",\"connectionId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"uptimeSeconds\":120}";
    var fast="{\"v\":1,\"type\":\"cell_voltage\",\"c\":1,\"sv\":1,\"d\":{\"ts\":1,\"q\":\"valid\",\"values\":[[1]]}}";
    var reliable="{\"v\":1,\"type\":\"important_history\",\"taskId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"c\":1,\"part\":1,\"parts\":1,\"ts\":1,\"p\":[1],\"data\":[[1,0,1]]}";
    var expected=Map.of(raw,IngressEnvelope.Lane.STATE,fast,IngressEnvelope.Lane.FAST,reliable,IngressEnvelope.Lane.RELIABLE);
    var sentAt=Instant.now();device.publish("ems/v1/"+id+"/up/heartbeat",raw.getBytes(StandardCharsets.UTF_8),1,false);
    device.publish("ems/v1/"+id+"/up/telemetry",fast.getBytes(StandardCharsets.UTF_8),1,false);
    device.publish("ems/v1/"+id+"/up/important",reliable.getBytes(StandardCharsets.UTF_8),1,false);
    var matched=new HashSet<String>();var epochs=new HashSet<String>();var orders=new HashSet<String>();long deadline=System.nanoTime()+Duration.ofSeconds(25).toNanos();var mapper=new ObjectMapper();
    while(System.nanoTime()<deadline&&matched.size()<3)for(var r:consumer.poll(Duration.ofMillis(500))) {
     var e=mapper.readTree(r.value());var body=e.path("rawBody").asText();if(!expected.containsKey(body))continue;
     require(r.topic().equals(p.topics().get(expected.get(body))),"Correct lane topic");require(r.key().equals(id.toString()),"Partition key");
     require(!Instant.parse(e.path("receivedAt").asText()).isBefore(sentAt),"Arrival timestamp");
     require(new BigInteger(e.path("fencingToken").asText()).compareTo(fresh)>0,"Worker authoritative fence");
     require(!e.path("ingressEpoch").asText().isBlank()&&new BigInteger(e.path("sequence").asText()).signum()>0,"Immutable arrival identity");matched.add(body);epochs.add(e.path("ingressEpoch").asText());orders.add(e.path("sequence").asText());
    }
    require(matched.size()==3&&epochs.size()==1&&orders.size()==3,"Real MQTT three lanes consumed with shared epoch and unique arrival order");Thread.sleep(300);require(ackCount.get()==0,"No business ACK");
   }finally{if(device.isConnected())device.disconnect();device.close();}
  }
  System.out.println("TASK4_LIVE_PASS lease_unknown competing_owner stale_fence mqtt_mtls kafka_consumed no_business_ack close");
 }
 private static void require(boolean ok,String label){if(!ok)throw new AssertionError(label);}
 private static String required(String key){return Objects.requireNonNull(System.getenv(key),key);}
}
