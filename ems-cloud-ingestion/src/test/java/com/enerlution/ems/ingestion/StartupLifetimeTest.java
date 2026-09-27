package com.enerlution.ems.ingestion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class StartupLifetimeTest {
 @TempDir Path dir;
 @Test void invalidTlsDoesNotLeaveProducerThread() throws Exception {
  var config=dir.resolve("kafka.properties");Files.writeString(config,"bootstrap.servers=127.0.0.1:9092\nclient.id=task4-startup-lifetime\n");
  var missing=dir.resolve("missing.crt");var topics=Map.of(IngressEnvelope.Lane.FAST,"fast",IngressEnvelope.Lane.STATE,"state",IngressEnvelope.Lane.RELIABLE,"reliable");
  var p=new IngestionProperties("ssl://127.0.0.1:18885","test",missing,missing,missing,config,topics,1,30,"jdbc:test","test","test");
  var lease=new IngressTest.TestLease();
  assertThrows(Exception.class,()->new IngestionWorker(p,lease));
  assertFalse(Thread.getAllStackTraces().keySet().stream().anyMatch(t->t.isAlive()&&t.getName().contains("task4-startup-lifetime")),"TLS setup failure must not leak producer thread");
 }
}
