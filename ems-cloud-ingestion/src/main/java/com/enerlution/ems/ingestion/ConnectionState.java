package com.enerlution.ems.ingestion;
import java.time.Instant;
import java.sql.*;
import java.math.BigDecimal;
public final class ConnectionState {
    private final javax.sql.DataSource source;
    public ConnectionState(javax.sql.DataSource source) { this.source=source; }
    public boolean accept(IngressEnvelope envelope) {
        var message=ReliableMessageStore.decode(envelope);
        // Status has no connection identity and is only an auxiliary hint.
        if(!message.type().equals("heartbeat"))return true;
        return StateTransaction.run(source,envelope.emsId().toString(),c -> {
            Long period=StateTransaction.admission(c,envelope,false);
            if(period==null || !fresh(envelope.receivedAt(),StateTransaction.now(c)))return;
            String next=message.body().path("connectionId").asText();
            String previous=null,epoch=null;java.math.BigInteger order=null;
            try(var q=c.prepareStatement("SELECT connection_id,ingress_generation,ingress_order FROM connection_state WHERE ems_uuid=?::uuid FOR UPDATE")) {
                q.setString(1,envelope.emsId().toString());try(var r=q.executeQuery()){r.next();previous=r.getString(1);epoch=r.getString(2);if(r.getBigDecimal(3)!=null)order=r.getBigDecimal(3).toBigIntegerExact();}
            }
            if(epoch!=null && !epoch.equals(envelope.ingressEpoch().toString()))return;
            if(order!=null && envelope.sequence().compareTo(order)<=0)return;
            try(var q=c.prepareStatement("SELECT 1 FROM retired_connection WHERE ems_uuid=?::uuid AND ingress_generation=?::uuid AND connection_id=?::uuid")) {
                q.setString(1,envelope.emsId().toString());q.setString(2,envelope.ingressEpoch().toString());q.setString(3,next);try(var r=q.executeQuery()){if(r.next())return;}
            }
            if(previous!=null && !previous.equals(next)) {
                try(var q=c.prepareStatement("INSERT INTO retired_connection VALUES(?::uuid,?::uuid,?::uuid,clock_timestamp()) ON CONFLICT DO NOTHING")) {
                    q.setString(1,envelope.emsId().toString());q.setString(2,epoch);q.setString(3,previous);q.executeUpdate();
                }
            }
            if(previous==null || !previous.equals(next)) {
                try(var q=c.prepareStatement("INSERT INTO structure_refresh_demand(binding_period_id,pending) VALUES(?,true) ON CONFLICT(binding_period_id) DO UPDATE SET pending=true")) {q.setLong(1,period);q.executeUpdate();}
                try(var q=c.prepareStatement("INSERT INTO alarm_refresh_demand(binding_period_id,cabinet_no,pending) SELECT DISTINCT binding_period_id,cabinet_no,true FROM device_binding WHERE binding_period_id=? AND cabinet_no IS NOT NULL AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp()) ON CONFLICT(binding_period_id,cabinet_no) DO UPDATE SET pending=true")) {q.setLong(1,period);q.executeUpdate();}
            }
            try(var q=c.prepareStatement("UPDATE connection_state SET connection_id=?::uuid,ingress_generation=?::uuid,ingress_order=?,last_fresh_heartbeat=? WHERE ems_uuid=?::uuid")) {
                q.setString(1,next);q.setString(2,envelope.ingressEpoch().toString());q.setBigDecimal(3,new BigDecimal(envelope.sequence()));q.setTimestamp(4,Timestamp.from(envelope.receivedAt()));q.setString(5,envelope.emsId().toString());q.executeUpdate();
            }
        });
    }
    static boolean fresh(Instant heartbeat, Instant now) {
        return heartbeat != null && !heartbeat.isAfter(now) && heartbeat.plusSeconds(90).isAfter(now);
    }
}
