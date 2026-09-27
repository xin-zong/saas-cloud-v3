package com.enerlution.ems.ingestion;

import org.postgresql.ds.PGSimpleDataSource;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.math.BigInteger;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.common.TopicPartition;

/** Root-run actual PG/Kafka/mTLS check. Fixtures/roles/topics are provisioned outside this harness. */
public final class ReliableLiveCheck {
 static final UUID EMS=ReliableStorePostgresTest.EMS;
 public static void main(String[] args)throws Exception {
  var p=IngestionProperties.environment();
  require(p.topics().values().stream().allMatch(t->t.startsWith("ems-cloud-v3.test.task5-20260928.")),"Dedicated Task5 topics");
  require(p.reliableConsumerProperties().getProperty("group.id").startsWith("ems-cloud-v3.ingestion.task5-20260928"),"Dedicated Task5 group");
  var source=new PGSimpleDataSource();source.setURL(p.databaseUrl());source.setUser(p.databaseUser());source.setPassword(p.databasePassword());source.setConnectTimeout(5);source.setSocketTimeout(5);
  try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT current_database(),current_user,current_schema()")){r.next();require(r.getString(1).equals("ems_cloud_v2_proto")&&r.getString(2).equals("ems_ingestion_test")&&r.getString(3).equals("ems_ingestion_tests"),"Isolated DB role/schema guard");}
  // Only this dedicated EMS's isolated fixture relations are cleared, after exact guard.
  try(var c=source.getConnection();var s=c.createStatement()){for(String table:List.of("outbox","query_request","ems_alarm_event","alarm_current_member","alarm_current_snapshot","history_sample_identity","reliable_message","ems_alarm_identity"))s.executeUpdate("DELETE FROM "+table+" WHERE ems_uuid='"+EMS+"'");s.executeUpdate("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+EMS+"'");}
  var acks=new ArrayBlockingQueue<String>(16);var beforeCommit=new java.util.concurrent.atomic.AtomicBoolean();
  var device=new MqttClient(p.mqttUri(),EMS.toString(),new MemoryPersistence());
  device.setTimeToWait(10000);
  device.setCallback(new MqttCallback(){public void connectionLost(Throwable c){}public void deliveryComplete(IMqttDeliveryToken t){}public void messageArrived(String topic,MqttMessage m)throws Exception {
   var json=new ObjectMapper().readTree(m.getPayload());if(!json.has("error"))try(var c=source.getConnection();var q=c.prepareStatement("SELECT 1 FROM reliable_message WHERE ems_uuid=?::uuid AND task_id=?::uuid AND part=?")){q.setString(1,EMS.toString());q.setString(2,json.path("taskId").asText());q.setBigDecimal(3,json.path("part").decimalValue());try(var r=q.executeQuery()){if(!r.next())beforeCommit.set(true);}}
   acks.offer(new String(m.getPayload(),StandardCharsets.UTF_8));
  }});
  var options=new MqttConnectOptions();options.setMqttVersion(MqttConnectOptions.MQTT_VERSION_3_1_1);options.setCleanSession(true);options.setSocketFactory(MqttTls.create(Path.of(required("EMS_TEST_MQTT_CA")),Path.of(required("EMS_TEST_MQTT_CERT")),Path.of(required("EMS_TEST_MQTT_KEY"))));options.setHttpsHostnameVerificationEnabled(true);
  try {
   device.connect(options);device.subscribe("ems/v1/"+EMS+"/down/ack",1);
   var lease=new GatewayLease(source,"task5-runtime-first",30);var adminProperties=p.reliableConsumerProperties();adminProperties.remove("group.id");
   try(var admin=AdminClient.create(adminProperties);var worker=new IngestionWorker(p,lease,source)) {
    long baseline=offset(admin,p);
    var first=raw("47d99f91-74e4-4738-aaab-17fc1550978c","[[0,0,[65535,0,12,42]]]");
    publish(device,first);require(ack(acks).equals("{\"v\":1,\"type\":\"important_history\",\"taskId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"part\":1}"),"Exact saved ACK");
    publish(device,first);require(!ack(acks).contains("error"),"Duplicate receives fresh ACK");
    publish(device,raw("dff19b22-9ac1-4e49-8942-92f672c20794","[[1,0,7],[0,0,[65535,0,12,43]]]"));require(ack(acks).contains("\"error\":\"rejected\""),"Cross-task conflict rejected");
    require(count(source,"reliable_message")==1&&count(source,"history_sample_identity")==1,"Whole package rollback and dedup");require(!beforeCommit.get(),"ACK only after committed saved facts");
    long before=awaitOffset(admin,p,baseline+3);
    try(var c=source.getConnection();var s=c.createStatement()){s.execute("CREATE FUNCTION task5_live_fail_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected before commit'; END $$");s.execute("CREATE TRIGGER task5_live_fail_ack BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION task5_live_fail_ack()");}
    try {
     publish(device,raw("33333333-3333-4333-8333-333333333333","[[2,0,7]]"));
     require(acks.poll(2,TimeUnit.SECONDS)==null,"No saved ACK during PG rollback");require(offset(admin,p)==before,"Kafka offset does not precede PG commit");require(count(source,"reliable_message")==1,"DB fault leaves no partial package");
    }finally{try(var c=source.getConnection();var s=c.createStatement()){s.execute("DROP TRIGGER task5_live_fail_ack ON outbox");s.execute("DROP FUNCTION task5_live_fail_ack()");}}
    require(ack(acks).contains("33333333-3333-4333-8333-333333333333"),"PG recovery saves retried Kafka record");require(awaitOffset(admin,p,before+1)>before,"Kafka offset advances after recovered PG commit");
   }
   // Simulate durable accept followed by process death with an abandoned sending claim.
   try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+EMS+"'");}
   var crashLease=new GatewayLease(source,"task5-runtime-crash",30);var fence=crashLease.acquire(EMS).orElseThrow();
   String raw=raw("44444444-4444-4444-8444-444444444444","[[3,0,7]]");String topic="ems/v1/"+EMS+"/up/important";var wire=new com.enerlution.ems.protocol.WireDecoder().decode(topic,raw.getBytes(StandardCharsets.UTF_8));
   require(new ReliableMessageStore(source).accept(new IngressEnvelope(EMS,"important",wire.type(),wire.canonicalHash(),raw,topic,Instant.now(),UUID.randomUUID(),BigInteger.ONE,fence))==ReliableMessageStore.Outcome.SAVED,"Committed package before crash");
   try(var c=source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE outbox SET status='sending',lease_owner='dead-process',lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+EMS+"' AND status='pending'");s.executeUpdate("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+EMS+"'");}
   try(var restarted=new IngestionWorker(p,new GatewayLease(source,"task5-runtime-restart",30),source)){require(ack(acks).contains("44444444-4444-4444-8444-444444444444"),"Restart reclaims committed outbox");require(!beforeCommit.get(),"Recovery ACK sees committed facts");}
   System.out.println("PASS actual PG/Kafka/mTLS: committed saved ACK, duplicate reACK, atomic cross-task rejection, PG rollback keeps Kafka offset, recovery advances offset, abandoned outbox restart recovery");
  }finally{if(device.isConnected())device.disconnect();device.close();}
 }
 static String raw(String task,String rows){return "{\"v\":1,\"type\":\"important_history\",\"taskId\":\""+task+"\",\"c\":1,\"part\":1,\"parts\":1,\"ts\":1789353000000,\"p\":[20062],\"data\":"+rows+"}";}
 static void publish(MqttClient device,String raw)throws Exception{device.publish("ems/v1/"+EMS+"/up/important",raw.getBytes(StandardCharsets.UTF_8),1,false);}
 static String ack(BlockingQueue<String> acks)throws Exception{var value=acks.poll(25,TimeUnit.SECONDS);require(value!=null,"ACK arrived within bounded wait");return value;}
 static long offset(AdminClient admin,IngestionProperties p)throws Exception{var offsets=admin.listConsumerGroupOffsets(p.reliableConsumerProperties().getProperty("group.id")).partitionsToOffsetAndMetadata().get(10,TimeUnit.SECONDS);var value=offsets.get(new TopicPartition(p.topics().get(IngressEnvelope.Lane.RELIABLE),0));return value==null?0:value.offset();}
 static long awaitOffset(AdminClient admin,IngestionProperties p,long atLeast)throws Exception{long deadline=System.nanoTime()+Duration.ofSeconds(15).toNanos();while(System.nanoTime()<deadline){long value=offset(admin,p);if(value>=atLeast)return value;Thread.sleep(100);}throw new AssertionError("Committed offset deadline");}
 static long count(javax.sql.DataSource source,String table)throws Exception{try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM "+table+" WHERE ems_uuid='"+EMS+"'")){r.next();return r.getLong(1);}}
 static String required(String key){return Objects.requireNonNull(System.getenv(key),key);}
 static void require(boolean ok,String message){if(!ok)throw new AssertionError(message);}
}
