package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.producer.*;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** One bounded pump per lane; at most one pending producer completion per lane. */
public final class IngestionWorker implements AutoCloseable {
 private final MqttIngress ingress; private final KafkaIngress kafka;
 private final KafkaProducer<String,String> producer; private final MqttClient mqtt;
 private final ExecutorService pumps=Executors.newFixedThreadPool(3);
 private final AtomicBoolean closed=new AtomicBoolean();
 public IngestionWorker(IngestionProperties properties,LeaseAuthority lease) throws Exception {
  var socketFactory=MqttTls.create(properties.mqttCa(),properties.mqttCertificate(),properties.mqttKey());
  ingress=new MqttIngress(lease,properties.capacity(),Clock.systemUTC());
  mqtt=new MqttClient(properties.mqttUri(),properties.clientId(),new MemoryPersistence());
  try {producer=new KafkaProducer<>(properties.producerProperties());}
  catch(Exception failure){mqtt.close(true);throw failure;}
  var mapper=new ObjectMapper();
  kafka=new KafkaIngress(lease,envelope->{
   var result=new CompletableFuture<Void>();
   try {
    // Java time encoded explicitly, retaining arrival timestamp even through retries/replay.
    var node=mapper.valueToTree(new EnvelopeJson(envelope));
    producer.send(new ProducerRecord<>(properties.topics().get(envelope.lane()),envelope.emsId().toString(),mapper.writeValueAsString(node)),
     (metadata,error)->{if(error==null)result.complete(null);else result.completeExceptionally(error);});
   }catch(Exception e){result.completeExceptionally(e);}return result;
  });
  mqtt.setManualAcks(true);
  mqtt.setCallback(new MqttCallback(){
   public void connectionLost(Throwable cause){}
   public void deliveryComplete(IMqttDeliveryToken token){}
   public void messageArrived(String topic,MqttMessage message) throws Exception {
    if(ingress.accept(topic,message.getPayload()))mqtt.messageArrivedComplete(message.getId(),message.getQos());
    else { // MQTT PUBACK is transport only. Reconnect replays unacknowledged QoS1 delivery.
     throw new IllegalStateException("Ingress rejected delivery");
    }
   }
  });
  var options=new MqttConnectOptions();options.setMqttVersion(MqttConnectOptions.MQTT_VERSION_3_1_1);
  options.setSocketFactory(socketFactory);
  options.setHttpsHostnameVerificationEnabled(true);options.setCleanSession(false);options.setAutomaticReconnect(true);
  options.setConnectionTimeout(10);options.setKeepAliveInterval(30);options.setMaxInflight(16);
  try {
   mqtt.connect(options);mqtt.subscribe("ems/v1/+/up/+",1);
   for(var lane:IngressEnvelope.Lane.values())pumps.submit(()->pump(lane));
  }catch(Exception failure){close();throw failure;}
 }
 private void pump(IngressEnvelope.Lane lane){
  while(!closed.get()&&!Thread.currentThread().isInterrupted()) {
   var envelope=ingress.poll(lane);
   try {if(envelope==null)Thread.sleep(10);else kafka.publish(envelope).toCompletableFuture().get(12,TimeUnit.SECONDS);}
   catch(InterruptedException interrupted){Thread.currentThread().interrupt();return;}
   catch(Exception failed){/* Reliable business retry is driven by device until downstream persisted ACK. */}
  }
 }
 public void close(){
  if(!closed.compareAndSet(false,true))return;
  ingress.close();kafka.close();pumps.shutdownNow();
  try{mqtt.disconnectForcibly(1000,1000,false);}catch(Exception ignored){}
  try{mqtt.close(true);}catch(Exception ignored){}
  producer.close(Duration.ofSeconds(5));
  try{pumps.awaitTermination(5,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
 }
 public record EnvelopeJson(String emsId,String channel,String type,String canonicalHash,String rawBody,String sourceTopic,
  String receivedAt,String ingressEpoch,String sequence,String fencingToken) {
  EnvelopeJson(IngressEnvelope e){this(e.emsId().toString(),e.channel(),e.type(),e.canonicalHash(),e.rawBody(),e.sourceTopic(),e.receivedAt().toString(),e.ingressEpoch().toString(),e.sequence().toString(),e.fencingToken().toString());}
 }
}
