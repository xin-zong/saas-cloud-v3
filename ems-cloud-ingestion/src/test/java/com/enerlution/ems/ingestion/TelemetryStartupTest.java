package com.enerlution.ems.ingestion;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TelemetryStartupTest {
    Properties properties() {
        var p=new Properties();p.setProperty("bootstrap.servers","127.0.0.1:9092");
        p.setProperty("group.id","ems-cloud-v3.ingestion.telemetry.startup-test");
        p.setProperty("metric.reporters",ReliableStartupTest.CloseReporter.class.getName());return p;
    }
    @Test void failedSubscriptionClosesFastConsumerResources() {
        ReliableStartupTest.CloseReporter.closed.set(0);
        assertThrows(IllegalArgumentException.class,()->new TelemetryConsumer(properties(),"",null,null,new TransportDiagnostics()));
        assertEquals(1,ReliableStartupTest.CloseReporter.closed.get());
    }
    @Test void forcedShutdownClearsInterruptBeforeClosingKafka()throws Exception {
        ReliableStartupTest.CloseReporter.closed.set(0);ReliableStartupTest.CloseReporter.interrupted.set(false);
        var consumer=new TelemetryConsumer(properties(),"test",null,null,new TransportDiagnostics());consumer.close();
        var t=new Thread(()->{Thread.currentThread().interrupt();consumer.run();});t.start();t.join(10000);
        assertFalse(t.isAlive());assertEquals(1,ReliableStartupTest.CloseReporter.closed.get());
        assertFalse(ReliableStartupTest.CloseReporter.interrupted.get());
    }
}
