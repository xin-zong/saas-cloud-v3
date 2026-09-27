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
 private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(IngestionWorker.class);
 private final TransportDiagnostics diagnostics=new TransportDiagnostics();
 static void publishOne(KafkaIngress kafka,IngressEnvelope envelope,TransportDiagnostics diagnostics,Duration timeout)throws InterruptedException {
  try{kafka.publish(envelope).toCompletableFuture().get(timeout.toNanos(),TimeUnit.NANOSECONDS);}
  catch(ExecutionException|TimeoutException|RuntimeException failed){diagnostics.record(TransportDiagnostics.Signal.PUMP_FAILURE);}
 }
 public java.util.Map<String,Long> diagnostics(){return diagnostics.snapshot();}
 private final MqttIngress ingress; private final KafkaIngress kafka;
 private final KafkaProducer<String,String> producer; private final MqttClient mqtt;
 private final ExecutorService pumps=Executors.newFixedThreadPool(7);
 private ReliableConsumer reliable;
 private TelemetryConsumer telemetry;
 private ReliableProjection projection;
 private final AtomicBoolean closed=new AtomicBoolean();
 public IngestionWorker(IngestionProperties properties,LeaseAuthority lease) throws Exception {
  this(properties,lease,null);
 }
 public IngestionWorker(IngestionProperties properties,LeaseAuthority lease,javax.sql.DataSource source) throws Exception {
  this(properties,lease,source,null);
 }
 public IngestionWorker(IngestionProperties properties,LeaseAuthority lease,javax.sql.DataSource source,TelemetryConsumer.FactSink facts) throws Exception {
  var socketFactory=MqttTls.create(properties.mqttCa(),properties.mqttCertificate(),properties.mqttKey());
  ingress=new MqttIngress(lease,properties.capacity(),Clock.systemUTC(),diagnostics);
  mqtt=new MqttClient(properties.mqttUri(),properties.clientId(),new MemoryPersistence());
  mqtt.setTimeToWait(10000);
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
  },diagnostics);
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
   if(source!=null) {
    AckOutbox.Publisher publisher=(topic,bytes)->mqtt.publish(topic,bytes,1,false);
    reliable=new ReliableConsumer(properties.reliableConsumerProperties(),java.util.List.of(properties.topics().get(IngressEnvelope.Lane.RELIABLE),properties.topics().get(IngressEnvelope.Lane.STATE)),new ReliableMessageStore(source,diagnostics),publisher);
    pumps.submit(reliable);
    var outbox=new AckOutbox(source,publisher);
    pumps.submit(()->{while(!closed.get()&&!Thread.currentThread().isInterrupted())try{if(!outbox.publishNext())Thread.sleep(100);}catch(java.sql.SQLException failure){diagnostics.record(TransportDiagnostics.Signal.PUMP_FAILURE);try{Thread.sleep(500);}catch(InterruptedException stop){Thread.currentThread().interrupt();}}catch(InterruptedException stop){Thread.currentThread().interrupt();}});
    if(facts!=null) {
     telemetry=new TelemetryConsumer(properties.telemetryConsumerProperties(),properties.topics().get(IngressEnvelope.Lane.FAST),source,facts,diagnostics);
     projection=new ReliableProjection(source,facts);
     pumps.submit(telemetry);pumps.submit(projection);
    }
   }
  }catch(Exception failure){close();throw failure;}
 }
 private void pump(IngressEnvelope.Lane lane){
  while(!closed.get()&&!Thread.currentThread().isInterrupted()) {
   var envelope=ingress.poll(lane);
   try {if(envelope==null)Thread.sleep(10);else publishOne(kafka,envelope,diagnostics,Duration.ofSeconds(12));}
   catch(InterruptedException interrupted){Thread.currentThread().interrupt();return;}
   if(!closed.get())diagnostics.warningIfDue().ifPresent(counts->LOG.warn("Ingestion transport failure counters: {}",counts));
  }
 }
 public void close(){
  if(!closed.compareAndSet(false,true))return;
  if(reliable!=null)reliable.close();
  if(telemetry!=null)telemetry.close();
  if(projection!=null)projection.close();
  ingress.close();kafka.close();pumps.shutdown();
  // Keep transports available while bounded in-flight work and Kafka resource close finish.
  try{if(!pumps.awaitTermination(12,TimeUnit.SECONDS)){pumps.shutdownNow();pumps.awaitTermination(5,TimeUnit.SECONDS);}}
  catch(InterruptedException e){pumps.shutdownNow();Thread.currentThread().interrupt();}
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
