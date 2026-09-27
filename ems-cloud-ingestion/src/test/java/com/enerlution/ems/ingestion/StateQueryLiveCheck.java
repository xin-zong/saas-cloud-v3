package com.enerlution.ems.ingestion;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.apache.kafka.clients.producer.*;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Isolated real MQTT/Kafka/PG read-query roundtrip; no claim of real EMS verification. */
public final class StateQueryLiveCheck {
    private static final String DEVICE="755facdc-9bdf-43d0-9412-c94f860a01ec";
    public static void main(String[] args)throws Exception {
        if(!"ems_ingestion_tests".equals(required("EMS_TEST_SCHEMA")))throw new IllegalArgumentException("Isolated schema required");
        String uri=required("EMS_TEST_MQTT_URI"),topic=required("EMS_TEST_KAFKA_STATE_TOPIC"),group=required("EMS_TEST_KAFKA_GROUP");
        if(!uri.equals("ssl://127.0.0.1:18885")||!topic.equals("ems-cloud-v3.test.task7-20260928.state.v1")||!group.startsWith("ems-cloud-v3.ingestion.task7-20260928."))throw new IllegalArgumentException("Isolated Task7 resources required");
        var f=new StateQueryPostgresTest();f.ems=UUID.fromString(DEVICE);f.setup();
        try(var c=f.source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE connection_state SET lease_until=clock_timestamp()-interval '1 second' WHERE ems_uuid='"+DEVICE+"'");}
        var properties=new Properties();try(var in=Files.newInputStream(Path.of(required("EMS_TEST_KAFKA_CONFIG")))){properties.load(in);}properties.setProperty("group.id",group);
        var producerProperties=new Properties();producerProperties.putAll(properties);producerProperties.setProperty("key.serializer","org.apache.kafka.common.serialization.StringSerializer");producerProperties.setProperty("value.serializer","org.apache.kafka.common.serialization.StringSerializer");producerProperties.setProperty("acks","all");
        var ingress=new MqttIngress(new GatewayLease(f.source,"task7-live",120),32,Clock.systemUTC());
        var cloud=new MqttClient(uri,"ems-cloud-v3-ingestion",new MemoryPersistence());
        var device=new MqttClient(uri,DEVICE,new MemoryPersistence());
        cloud.setTimeToWait(10000);device.setTimeToWait(10000);
        var responseSent=new CountDownLatch(1);
        Thread consumerThread=null;
        try(var producer=new KafkaProducer<String,String>(producerProperties);
            var consumer=new ReliableConsumer(properties,List.of(topic),new ReliableMessageStore(f.source),(t,b)->cloud.publish(t,b,1,false),new StateConsumer(f.source))) {
            cloud.setCallback(new MqttCallback() {
                public void connectionLost(Throwable cause){}
                public void deliveryComplete(IMqttDeliveryToken token){}
                public void messageArrived(String t,MqttMessage m)throws Exception {
                    if(!ingress.accept(t,m.getPayload()))throw new IllegalStateException("Isolated ingress rejected");
                    var e=ingress.poll(IngressEnvelope.Lane.STATE);
                    if(e==null)throw new IllegalStateException("Expected STATE envelope");
                    producer.send(new ProducerRecord<>(topic,DEVICE,new ObjectMapper().writeValueAsString(new IngestionWorker.EnvelopeJson(e)))).get(10,TimeUnit.SECONDS);
                }
            });
            device.setCallback(new MqttCallback() {
                public void connectionLost(Throwable cause){}
                public void deliveryComplete(IMqttDeliveryToken token){}
                public void messageArrived(String t,MqttMessage m)throws Exception {
                    var request=new ObjectMapper().readTree(m.getPayload());
                    if(!request.path("op").asText().equals("alarm.current.get")||request.path("params").path("c").intValue()!=1)throw new IllegalStateException("Unexpected query");
                    var response=new ObjectMapper().createObjectNode();response.put("v",1);response.put("emsId",DEVICE);response.set("id",request.get("id"));response.put("ok",true);
                    var data=response.putObject("data");data.put("v",1);data.put("type","alarm_current");data.set("connectionId",request.get("connectionId"));data.put("c",1);data.put("seq",1);data.putArray("alarms");
                    device.publish("ems/v1/"+DEVICE+"/up/response",response.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),1,false);responseSent.countDown();
                }
            });
            cloud.connect(options("EMS_TEST_MQTT_CLOUD_CERT","EMS_TEST_MQTT_CLOUD_KEY"));cloud.subscribe(new String[]{"ems/v1/"+DEVICE+"/up/heartbeat","ems/v1/"+DEVICE+"/up/response"},new int[]{1,1});
            device.connect(options("EMS_TEST_MQTT_DEVICE_CERT","EMS_TEST_MQTT_DEVICE_KEY"));device.subscribe("ems/v1/"+DEVICE+"/down/request",1);
            consumerThread=new Thread(consumer,"task7-state-live");consumerThread.start();
            String heartbeat="{\"v\":1,\"emsId\":\""+DEVICE+"\",\"connectionId\":\""+f.connection+"\",\"uptimeSeconds\":1}";
            device.publish("ems/v1/"+DEVICE+"/up/heartbeat",heartbeat.getBytes(java.nio.charset.StandardCharsets.UTF_8),0,false);
            await(()->f.connection.toString().equals(f.value("SELECT connection_id FROM connection_state WHERE ems_uuid='"+DEVICE+"'")));
            try(var c=f.source.getConnection()){c.setAutoCommit(false);ReliableMessageStore.lock(c,DEVICE);AlarmProjection.requireRefresh(c,f.period,1);c.commit();}
            var dispatcher=new QueryDispatcher(f.source,(t,b)->cloud.publish(t,b,1,false));
            if(!dispatcher.enqueueAutomatic(f.ems,"alarm.current.get",1)||!dispatcher.publishNext())throw new IllegalStateException("Query was not durably dispatched");
            if(!responseSent.await(10,TimeUnit.SECONDS))throw new IllegalStateException("MQTT response not received");
            await(()->"succeeded".equals(f.value("SELECT status FROM query_request WHERE ems_uuid='"+DEVICE+"'")));
            if(!"t".equals(f.value("SELECT known FROM alarm_current_snapshot WHERE ems_uuid='"+DEVICE+"'")))throw new IllegalStateException("Snapshot not committed");
            consumer.close();consumerThread.join(10000);if(consumerThread.isAlive())throw new IllegalStateException("Consumer failed to stop");
        }finally {
            ingress.close();if(device.isConnected())device.disconnect();if(cloud.isConnected())cloud.disconnect();device.close();cloud.close();f.cleanupMutableWork();
        }
        System.out.println("PASS actual simulator MQTT/Kafka/PG: fresh heartbeat, durable fixed read query, real MQTT response, committed current snapshot; real EMS verification remains separate");
    }
    private static MqttConnectOptions options(String certificate,String key)throws Exception {
        var options=new MqttConnectOptions();options.setSocketFactory(MqttTls.create(Path.of(required("EMS_TEST_MQTT_CA")),Path.of(required(certificate)),Path.of(required(key))));options.setHttpsHostnameVerificationEnabled(true);options.setCleanSession(true);options.setConnectionTimeout(10);return options;
    }
    interface Check {boolean ready()throws Exception;}
    static void await(Check check)throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);while(!check.ready()){if(System.nanoTime()>=end)throw new IllegalStateException("Isolated state wait timed out");Thread.sleep(100);}}
    private static String required(String name){String value=System.getenv(name);if(value==null||value.isBlank())throw new IllegalArgumentException("Missing managed test environment "+name);return value;}
}
