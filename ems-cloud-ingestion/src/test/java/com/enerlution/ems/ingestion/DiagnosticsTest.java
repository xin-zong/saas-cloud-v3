package com.enerlution.ems.ingestion;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.math.BigInteger;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static com.enerlution.ems.ingestion.TransportDiagnostics.Signal.*;
class DiagnosticsTest {
 final IngressTest fixture=new IngressTest();
 IngressTest.TestLease owner(){var lease=new IngressTest.TestLease();lease.registered=true;lease.fence=BigInteger.ONE;return lease;}
 @Test void decoderAndBindingRejectionsAreDistinctFromAcceptedAndOverflow() {
  var diagnostics=new TransportDiagnostics();var lease=owner();
  try(var mqtt=new MqttIngress(lease,1,Clock.systemUTC(),diagnostics)) {
   assertFalse(mqtt.accept(fixture.topic(),new byte[]{1}));assertEquals(1,diagnostics.count(DECODER_REJECTION));
   lease.registered=false;assertFalse(mqtt.accept(fixture.topic(),fixture.payload()));assertEquals(1,diagnostics.count(ADMISSION_REJECTION));
   lease.registered=true;assertTrue(mqtt.accept(fixture.topic(),fixture.payload()));assertEquals(1,diagnostics.count(ACCEPTED));
   assertFalse(mqtt.accept(fixture.topic(),fixture.payload()));assertEquals(1,diagnostics.count(QUEUE_OVERFLOW));
   assertEquals(0,diagnostics.count(DATABASE_FAILURE));assertEquals(1,diagnostics.count(DECODER_REJECTION));
  }
 }
 @Test void mqttDatabaseExceptionIsObservableWithoutExceptionText() {
  var diagnostics=new TransportDiagnostics();var lease=new LeaseAuthority(){
   public Optional<BigInteger> acquire(UUID id){throw new IllegalStateException("secret payload should never be retained");}
   public boolean isOwner(UUID id,BigInteger fence){throw new AssertionError();}
  };
  try(var mqtt=new MqttIngress(lease,1,Clock.systemUTC(),diagnostics)) {
   assertFalse(mqtt.accept(fixture.topic(),fixture.payload()));assertEquals(1,diagnostics.count(DATABASE_FAILURE));
   assertEquals(0,diagnostics.count(DECODER_REJECTION));assertFalse(diagnostics.snapshot().toString().contains("secret"));
  }
 }
 @Test void staleFenceFailedProducerAndSuccessHaveExactSignals() {
  var diagnostics=new TransportDiagnostics();var lease=owner();
  try(var kafka=new KafkaIngress(lease,e->CompletableFuture.failedFuture(new IllegalStateException("secret")),diagnostics)) {
   lease.fence=BigInteger.TWO;assertFalse(kafka.publish(fixture.envelope("heartbeat","heartbeat")).toCompletableFuture().join());
   assertEquals(1,diagnostics.count(STALE_FENCE));assertEquals(0,diagnostics.count(PRODUCER_FAILURE));
   lease.fence=BigInteger.ONE;assertFalse(kafka.publish(fixture.envelope("heartbeat","heartbeat")).toCompletableFuture().join());
   assertEquals(1,diagnostics.count(PRODUCER_FAILURE));assertEquals(0,diagnostics.count(PUBLISHED));
  }
  try(var kafka=new KafkaIngress(lease,e->CompletableFuture.completedFuture(null),diagnostics)) {
   assertTrue(kafka.publish(fixture.envelope("heartbeat","heartbeat")).toCompletableFuture().join());
   assertEquals(1,diagnostics.count(PUBLISHED));assertEquals(1,diagnostics.count(PRODUCER_FAILURE));
  }
 }
 @Test void producerAuthorityExceptionHasDatabaseSignal() {
  var diagnostics=new TransportDiagnostics();var lease=new LeaseAuthority(){
   public Optional<BigInteger> acquire(UUID id){return Optional.of(BigInteger.ONE);}
   public boolean isOwner(UUID id,BigInteger fence){throw new IllegalStateException("DB unreachable");}
  };
  try(var kafka=new KafkaIngress(lease,e->{throw new AssertionError("must not send");},diagnostics)) {
   assertFalse(kafka.publish(fixture.envelope("heartbeat","heartbeat")).toCompletableFuture().join());
   assertEquals(1,diagnostics.count(DATABASE_FAILURE));assertEquals(0,diagnostics.count(PRODUCER_FAILURE));
  }
 }
 @Test void pumpTimeoutIsObservableWithoutMisclassifyingCompletedWork()throws Exception {
  var diagnostics=new TransportDiagnostics();
  try(var kafka=new KafkaIngress(owner(),e->new CompletableFuture<>(),diagnostics)) {
   IngestionWorker.publishOne(kafka,fixture.envelope("heartbeat","heartbeat"),diagnostics,Duration.ZERO);
   assertEquals(1,diagnostics.count(PUMP_FAILURE));
  }
  try(var kafka=new KafkaIngress(owner(),e->CompletableFuture.completedFuture(null),diagnostics)) {
   IngestionWorker.publishOne(kafka,fixture.envelope("heartbeat","heartbeat"),diagnostics,Duration.ZERO);
   assertEquals(1,diagnostics.count(PUMP_FAILURE));assertEquals(1,diagnostics.count(PUBLISHED));
  }
 }
 @Test void warningsAreRateLimitedAndContainOnlyFixedReasonCounts() {
  var time=new AtomicLong();var diagnostics=new TransportDiagnostics(100,time::get);
  diagnostics.record(ACCEPTED);assertTrue(diagnostics.warningIfDue().isEmpty());
  diagnostics.record(DATABASE_FAILURE);assertEquals(Optional.of(Map.of("DATABASE_FAILURE",1L)),diagnostics.warningIfDue());
  for(int i=0;i<1000;i++)diagnostics.record(DATABASE_FAILURE);
  assertTrue(diagnostics.warningIfDue().isEmpty());time.set(100);
  assertEquals(Optional.of(Map.of("DATABASE_FAILURE",1001L)),diagnostics.warningIfDue());
  time.set(200);assertTrue(diagnostics.warningIfDue().isEmpty());
 }
}
