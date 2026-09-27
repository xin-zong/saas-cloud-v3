package com.enerlution.ems.ingestion;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.apache.kafka.common.metrics.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;

class ReliableStartupTest {
 @TempDir Path dir;
 @Test void defaultConsumerGroupFitsProvisionedWorkerAclPrefix()throws Exception {
  var file=dir.resolve("kafka.properties");Files.writeString(file,"bootstrap.servers=127.0.0.1:9092\n");
  var p=new IngestionProperties("ssl://127.0.0.1:8883","test",file,file,file,file,Map.of(),1,30,"jdbc:test","test","test");
  assertTrue(p.reliableConsumerProperties().getProperty("group.id").startsWith("ems-cloud-v3.ingestion."),"Runtime default group must fit worker's granted ACL prefix");
 }
 @Test void invalidSubscriptionClosesAlreadyConstructedConsumerResources() {
  CloseReporter.closed.set(0);var p=new Properties();p.setProperty("bootstrap.servers","127.0.0.1:9092");p.setProperty("group.id","ems-cloud-v3.ingestion.startup-test");p.setProperty("metric.reporters",CloseReporter.class.getName());
  assertThrows(IllegalArgumentException.class,()->new ReliableConsumer(p,List.of(""),null,(topic,bytes)->{}));
  assertEquals(1,CloseReporter.closed.get(),"Failed subscribe must close Kafka metrics/client resources");
 }
 @Test void fallbackInterruptDoesNotInterruptActualKafkaResourceClose()throws Exception {
  CloseReporter.closed.set(0);CloseReporter.interrupted.set(false);var p=new Properties();p.setProperty("bootstrap.servers","127.0.0.1:9092");p.setProperty("group.id","ems-cloud-v3.ingestion.shutdown-test");p.setProperty("metric.reporters",CloseReporter.class.getName());
  var consumer=new ReliableConsumer(p,"test-topic",null,(topic,bytes)->{});consumer.close();
  var runner=new Thread(()->{Thread.currentThread().interrupt();consumer.run();});runner.start();runner.join(10000);
  assertFalse(runner.isAlive());assertEquals(1,CloseReporter.closed.get());assertFalse(CloseReporter.interrupted.get(),"Kafka closes its resources with interrupt cleared, even during forced fallback");
 }
 public static final class CloseReporter implements MetricsReporter {
  static final AtomicInteger closed=new AtomicInteger();
  static final AtomicBoolean interrupted=new AtomicBoolean();
  public void configure(Map<String,?> values){}public void init(List<KafkaMetric> metrics){}public void metricChange(KafkaMetric metric){}public void metricRemoval(KafkaMetric metric){}public void close(){interrupted.set(Thread.currentThread().isInterrupted());closed.incrementAndGet();}
 }
}
