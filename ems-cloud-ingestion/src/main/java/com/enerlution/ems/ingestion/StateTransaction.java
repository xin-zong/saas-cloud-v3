package com.enerlution.ems.ingestion;

import javax.sql.DataSource;
import java.sql.*;
import java.math.BigDecimal;
import java.time.Instant;

/** All state mutations share the same EMS lock and numeric lease admission. */
final class StateTransaction {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(StateTransaction.class);
    private static final TransportDiagnostics DIAGNOSTICS=new TransportDiagnostics();
    static java.util.Map<String,Long> failureSnapshot(){return DIAGNOSTICS.snapshot();}
    static void recordFailure(Exception failure) {
        DIAGNOSTICS.record(failure instanceof SQLException?TransportDiagnostics.Signal.DATABASE_FAILURE:
            TransportDiagnostics.Signal.STATE_PROGRAMMING_FAILURE);
        DIAGNOSTICS.warningIfDue().ifPresent(counters->LOG.warn("State processing failure counters: {}",counters));
    }
    interface Work { void run(Connection connection) throws Exception; }
    static boolean run(DataSource source, String ems, Work work) {
        for (int attempt=0; attempt<3; attempt++) {
            try(var c=source.getConnection()) {
                c.setAutoCommit(false);
                try {
                    ReliableMessageStore.lock(c,ems);
                    work.run(c); c.commit(); return true;
                } catch(Exception failure) {
                    try{c.rollback();}catch(SQLException rollbackFailure){failure.addSuppressed(rollbackFailure);}
                    throw failure;
                }
            } catch(Exception failure) {
                recordFailure(failure);
                if(failure instanceof SQLException sql && attempt<2 &&
                    ("40001".equals(sql.getSQLState()) || "40P01".equals(sql.getSQLState()))) continue;
                return false;
            }
        }
        return false;
    }
    static Long admission(Connection c,IngressEnvelope e,boolean currentConnection) throws SQLException {
        String sql="SELECT b.id FROM connection_state s JOIN ems_binding_period b USING(ems_uuid) "
            +"WHERE s.ems_uuid=?::uuid AND s.fencing_token=? AND s.lease_until>clock_timestamp() "
            +"AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) "
            +"AND ?>=b.valid_from AND (b.valid_to IS NULL OR ?<b.valid_to) "
            +(currentConnection?"AND s.ingress_generation=?::uuid AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' ":"")
            +"FOR UPDATE OF s";
        try(var q=c.prepareStatement(sql)) {
            q.setQueryTimeout(5);q.setString(1,e.emsId().toString());q.setBigDecimal(2,new BigDecimal(e.fencingToken()));
            q.setTimestamp(3,Timestamp.from(e.receivedAt()));q.setTimestamp(4,Timestamp.from(e.receivedAt()));
            if(currentConnection)q.setString(5,e.ingressEpoch().toString());
            try(var r=q.executeQuery()){return r.next()?r.getLong(1):null;}
        }
    }
    static Instant now(Connection c)throws SQLException {
        try(var s=c.createStatement();var r=s.executeQuery("SELECT clock_timestamp()")){r.next();return r.getTimestamp(1).toInstant();}
    }
}
