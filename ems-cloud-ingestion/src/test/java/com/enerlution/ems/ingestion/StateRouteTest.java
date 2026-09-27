package com.enerlution.ems.ingestion;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class StateRouteTest {
    @Test void everyRequiredStateTypeHasADurableHandler() {
        assertEquals("connection",StateConsumer.handler("heartbeat"));
        assertEquals("connection",StateConsumer.handler("status"));
        assertEquals("structure",StateConsumer.handler("structure"));
        assertEquals("alarm",StateConsumer.handler("alarm_current"));
        assertEquals("response",StateConsumer.handler("response"));
        assertThrows(IllegalArgumentException.class,()->StateConsumer.handler("unsupported"));
    }
}
