package com.enerlution.ems.ingestion;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Proxy;
import java.sql.SQLException;
import static org.junit.jupiter.api.Assertions.*;
class StateFailureDiagnosticsTest {
    @Test void transactionDatabaseFailureHasSanitizedBoundedEvidence() {
        var logger=(ch.qos.logback.classic.Logger)org.slf4j.LoggerFactory.getLogger(StateTransaction.class);
        var appender=new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();appender.start();
        boolean additive=logger.isAdditive();logger.setAdditive(false);logger.addAppender(appender);
        try {
        long before=StateTransaction.failureSnapshot().get("DATABASE_FAILURE");
        DataSource unavailable=(DataSource)Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{DataSource.class},(instance,method,args)->{
            throw new SQLException("sensitive password/raw SQL must never be logged","08006");
        });
        assertFalse(StateTransaction.run(unavailable,"test-only",c->fail("No transaction was opened")));
        assertEquals(before+1,StateTransaction.failureSnapshot().get("DATABASE_FAILURE"));
        assertFalse(new QueryDispatcher(unavailable,(t,b)->{}).enqueueDemand());
        assertEquals(before+2,StateTransaction.failureSnapshot().get("DATABASE_FAILURE"));
        assertTrue(appender.list.size()<=1,"Repeated faults log at most once per warning interval");
        for(var event:appender.list) {
            assertFalse(event.getFormattedMessage().contains("sensitive"));
            assertNull(event.getThrowableProxy(),"Exceptions may contain raw SQL/credentials");
        }
        }finally{logger.detachAppender(appender);logger.setAdditive(additive);appender.stop();}
    }
    @Test void unexpectedProgrammingFailureHasSeparateCategoryWithoutSensitiveCause() {
        var logger=(ch.qos.logback.classic.Logger)org.slf4j.LoggerFactory.getLogger(StateTransaction.class);
        boolean additive=logger.isAdditive();logger.setAdditive(false);
        try {
            long before=StateTransaction.failureSnapshot().get("STATE_PROGRAMMING_FAILURE");
            DataSource broken=(DataSource)Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{DataSource.class},(instance,method,args)->{
                throw new IllegalStateException("sensitive programming failure");
            });
            assertFalse(StateTransaction.run(broken,"test-only",c->fail("No transaction was opened")));
            assertEquals(before+1,StateTransaction.failureSnapshot().get("STATE_PROGRAMMING_FAILURE"));
        }finally{logger.setAdditive(additive);}
    }
}
