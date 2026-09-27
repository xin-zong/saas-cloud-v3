package com.enerlution.ems.ingestion;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.math.BigInteger;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class IngressTest {
    @Test void gatewayLeaseExposesTrafficIndependentRenewalAndShutdownRelease() {
        assertDoesNotThrow(()->GatewayLease.class.getMethod("renewOwned"));
        assertDoesNotThrow(()->GatewayLease.class.getMethod("close"));
    }
    @Test void permanentRejectionsAndTransientFailuresHaveDifferentTransportDispositions()throws Exception {
        var method=assertDoesNotThrow(()->MqttIngress.class.getMethod("acceptDelivery",String.class,byte[].class));
        var lease=new TestLease();var ingress=new MqttIngress(lease,1,Clock.systemUTC());
        assertEquals("REJECTED",method.invoke(ingress,topic(),"{".getBytes()).toString());
        assertEquals("REJECTED",method.invoke(ingress,topic(),payload()).toString());
        lease.registered=true;lease.fence=BigInteger.ONE;
        assertEquals("ACCEPTED",method.invoke(ingress,topic(),payload()).toString());
        assertEquals("RETRY",method.invoke(ingress,topic(),payload()).toString());
        ingress.close();assertEquals("RETRY",method.invoke(ingress,topic(),payload()).toString());
        var failing=new LeaseAuthority(){public Optional<BigInteger> acquire(UUID id){throw new IllegalStateException();}public boolean isOwner(UUID id,BigInteger token){return true;}};
        try(var failed=new MqttIngress(failing,1,Clock.systemUTC())){assertEquals("RETRY",method.invoke(failed,topic(),payload()).toString());}
    }
    @Test void producerPendingCallbacksHaveExplicitBound() {
        var lease=new TestLease();lease.registered=true;lease.fence=BigInteger.ONE;
        try(var kafka=new KafkaIngress(lease,e->new CompletableFuture<>())) {
            for(int i=0;i<3;i++)assertFalse(kafka.publish(envelope("heartbeat","heartbeat")).toCompletableFuture().isDone());
            var overflow=kafka.publish(envelope("heartbeat","heartbeat")).toCompletableFuture();
            assertTrue(overflow.isDone());assertFalse(overflow.join());
        }
    }
    @Test void closingKafkaCancelsPendingCompletionAndRejectsMoreWork() {
        var lease=new TestLease();lease.registered=true;lease.fence=BigInteger.ONE;
        var pending=new CompletableFuture<Void>();var kafka=new KafkaIngress(lease,e->pending);
        var result=kafka.publish(envelope("heartbeat","heartbeat")).toCompletableFuture();
        kafka.close();assertTrue(result.isDone());assertFalse(result.join());
        assertFalse(kafka.publish(envelope("heartbeat","heartbeat")).toCompletableFuture().join());
    }
    @Test void structureAndCurrentAlarmUseStateRegardlessOfChannel() {
        assertEquals(IngressEnvelope.Lane.STATE,envelope("telemetry","structure").lane());
        assertEquals(IngressEnvelope.Lane.STATE,envelope("alarm","alarm_current").lane());
        assertEquals(IngressEnvelope.Lane.RELIABLE,envelope("alarm","alarm_event").lane());
        assertEquals(IngressEnvelope.Lane.FAST,envelope("telemetry","cell_voltage").lane());
    }
    IngressEnvelope envelope(String channel,String type){return new IngressEnvelope(id,channel,type,"hash","{}","topic",Instant.EPOCH,UUID.randomUUID(),BigInteger.ONE,BigInteger.ONE);}
    final UUID id=UUID.fromString("755facdc-9bdf-43d0-9412-c94f860a01ec");
    @Test void unregisteredOrUnownedArrivalNeverQueues() {
        var lease=new TestLease();
        try(var ingress=new MqttIngress(lease,1,Clock.systemUTC())) {
            assertFalse(ingress.accept(topic(), payload()));
            lease.registered=true;
            assertFalse(ingress.accept(topic(), payload()));
            assertEquals(0,ingress.queued());
        }
    }
    @Test void boundedQueueRejectsOverflowAndCloseRejectsArrival() {
        var lease=new TestLease(); lease.registered=true; lease.fence=BigInteger.ONE;
        var ingress=new MqttIngress(lease,1,Clock.fixed(Instant.EPOCH,ZoneOffset.UTC));
        assertTrue(ingress.accept(topic(),payload()));
        assertFalse(ingress.accept(topic(),payload()));
        var envelope=ingress.poll(IngressEnvelope.Lane.STATE);
        assertEquals(Instant.EPOCH,envelope.receivedAt());
        assertEquals(BigInteger.ONE,envelope.fencingToken());
        ingress.close(); assertFalse(ingress.accept(topic(),payload()));
    }
    @Test void staleFenceAndFailedProducerNeverAcknowledgeOrAccumulate() throws Exception {
        var lease=new TestLease(); lease.registered=true; lease.fence=BigInteger.ONE;
        try(var ingress=new MqttIngress(lease,2,Clock.systemUTC())) {
            ingress.accept(topic(),payload()); var e=ingress.poll(IngressEnvelope.Lane.STATE);
            var sent=new ArrayList<IngressEnvelope>();
            try(var kafka=new KafkaIngress(lease, x->{sent.add(x); return CompletableFuture.failedFuture(new IllegalStateException("offline"));})) {
                lease.fence=BigInteger.TWO;
                assertFalse(kafka.publish(e).toCompletableFuture().get()); assertTrue(sent.isEmpty());
                lease.fence=BigInteger.ONE;
                assertFalse(kafka.publish(e).toCompletableFuture().get()); assertEquals(1,sent.size());
                assertEquals(0,ingress.queued());
            }
        }
    }
    String topic(){return "ems/v1/"+id+"/up/heartbeat";}
    byte[] payload(){return ("{\"v\":1,\"emsId\":\""+id+"\",\"connectionId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"uptimeSeconds\":1}").getBytes(java.nio.charset.StandardCharsets.UTF_8);}
    static class TestLease implements LeaseAuthority {
        boolean registered; BigInteger fence;
        public Optional<BigInteger> acquire(UUID id){return registered?Optional.ofNullable(fence):Optional.empty();}
        public boolean isOwner(UUID id,BigInteger token){return registered&&token.equals(fence);}
    }
}
