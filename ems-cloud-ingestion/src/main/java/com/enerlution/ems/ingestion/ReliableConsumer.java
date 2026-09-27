package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.WakeupException;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.math.BigInteger;

/** One record at a time: bounded memory, synchronous PG boundary, offset only after a definitive outcome. */
public final class ReliableConsumer implements Runnable,AutoCloseable {
 private final KafkaConsumer<String,String> consumer;
 private final ReliableMessageStore store; private final AckOutbox.Publisher publisher;
 private final AtomicBoolean closed=new AtomicBoolean();
 private static final ObjectMapper JSON=new ObjectMapper(JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(8).maxStringLength(131072).build()).build());
 public ReliableConsumer(Properties properties,String topic,ReliableMessageStore store,AckOutbox.Publisher publisher) {
  this(properties,List.of(topic),store,publisher);
 }
 public ReliableConsumer(Properties properties,List<String> topics,ReliableMessageStore store,AckOutbox.Publisher publisher) {
  this.store=store;this.publisher=publisher;
  var p=new Properties();p.putAll(properties);p.remove("key.serializer");p.remove("value.serializer");
  p.setProperty("key.deserializer","org.apache.kafka.common.serialization.StringDeserializer");p.setProperty("value.deserializer","org.apache.kafka.common.serialization.StringDeserializer");p.setProperty("enable.auto.commit","false");p.setProperty("max.poll.records","1");p.setProperty("max.partition.fetch.bytes","1048576");p.setProperty("fetch.max.bytes","1048576");p.setProperty("auto.offset.reset","earliest");
  consumer=new KafkaConsumer<>(p);
  try{consumer.subscribe(topics);}catch(RuntimeException failure){consumer.close(Duration.ofSeconds(5));throw failure;}
 }
 static IngressEnvelope decode(String value,String key) {
  if(value==null||value.length()>1048576)throw new IllegalArgumentException("Oversize ingress record");
  try {
   JsonNode n;try(var parser=JSON.createParser(value)){n=JSON.readTree(parser);if(parser.nextToken()!=null)throw new IllegalArgumentException("Trailing ingress document");}if(n==null||!n.isObject()||n.size()!=10)throw new IllegalArgumentException("Invalid ingress record");
   for(String field:List.of("emsId","channel","type","canonicalHash","rawBody","sourceTopic","receivedAt","ingressEpoch","sequence","fencingToken"))if(!n.path(field).isTextual())throw new IllegalArgumentException("Invalid ingress field");
   var e=new IngressEnvelope(UUID.fromString(n.get("emsId").textValue()),n.get("channel").textValue(),n.get("type").textValue(),n.get("canonicalHash").textValue(),n.get("rawBody").textValue(),n.get("sourceTopic").textValue(),Instant.parse(n.get("receivedAt").textValue()),UUID.fromString(n.get("ingressEpoch").textValue()),new BigInteger(n.get("sequence").textValue()),new BigInteger(n.get("fencingToken").textValue()));
   if(!e.emsId().toString().equals(key)||e.sequence().signum()<=0)throw new IllegalArgumentException("Invalid ingress identity");ReliableMessageStore.decode(e);return e;
  }catch(Exception e){throw new IllegalArgumentException("Invalid ingress record");}
 }
 public void run() {
  try {
   while(!closed.get())try{for(var record:consumer.poll(Duration.ofMillis(500))) {
    var partition=new TopicPartition(record.topic(),record.partition());
    IngressEnvelope e;
    try{e=decode(record.value(),record.key());}catch(IllegalArgumentException invalid){commit(record,partition);continue;}
    if(e.lane()!=IngressEnvelope.Lane.RELIABLE&&!e.type().equals("alarm_current")){commit(record,partition);continue;}
    var result=e.type().equals("alarm_current")?store.acceptCurrent(e):store.accept(e);
    if(result==ReliableMessageStore.Outcome.BUSY){consumer.seek(partition,record.offset());Thread.sleep(250);continue;}
    if(result==ReliableMessageStore.Outcome.REJECTED)try{publisher.publish(AckOutbox.topic(ReliableMessageStore.decode(e)),AckOutbox.payload(ReliableMessageStore.decode(e),"rejected"));}catch(Exception failed){consumer.seek(partition,record.offset());Thread.sleep(250);continue;}
    commit(record,partition);
   }}catch(org.apache.kafka.common.KafkaException transientFailure){if(closed.get())break;Thread.sleep(500);}
  }catch(WakeupException wake){if(!closed.get())throw wake;}
  catch(InterruptedException interrupted){Thread.currentThread().interrupt();}
  finally{boolean interrupted=Thread.interrupted();try{consumer.close(Duration.ofSeconds(5));}finally{if(interrupted)Thread.currentThread().interrupt();}}
 }
 private void commit(ConsumerRecord<String,String> record,TopicPartition p){consumer.commitSync(Map.of(p,new OffsetAndMetadata(record.offset()+1)));}
 public void close(){closed.set(true);consumer.wakeup();}
}
