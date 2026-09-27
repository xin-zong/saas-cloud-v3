package com.enerlution.ems.ingestion;
import java.sql.*;
import java.util.*;
import java.time.*;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
public final class QueryDispatcher {
    private final javax.sql.DataSource source;
    private final AckOutbox.Publisher publisher;
    public QueryDispatcher(javax.sql.DataSource source, AckOutbox.Publisher publisher) {this.source=source;this.publisher=publisher;}
    /** NULL cabinet demand has unsupported EMS/public scope and remains pending evidence. */
    public boolean enqueueDemand() {
        String sql="SELECT b.ems_uuid,'alarm.current.get' AS operation,d.cabinet_no FROM alarm_refresh_demand d JOIN ems_binding_period b ON b.id=d.binding_period_id JOIN connection_state s ON s.ems_uuid=b.ems_uuid WHERE d.pending AND d.cabinet_no IS NOT NULL AND NOT EXISTS(SELECT 1 FROM (SELECT q.status,q.result FROM query_request q WHERE q.binding_period_id=b.id AND q.connection_id=s.connection_id AND q.operation='alarm.current.get' AND q.params=jsonb_build_object('c',d.cabinet_no) ORDER BY q.created_at DESC,q.id DESC LIMIT 1) latest WHERE latest.status='failed' AND latest.result ? 'error' AND latest.result->'error'->>'code' NOT IN ('BUSY','DATA_UNAVAILABLE')) AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) AND s.lease_until>clock_timestamp() AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AND NOT EXISTS(SELECT 1 FROM query_request q WHERE q.ems_uuid=b.ems_uuid AND q.operation='alarm.current.get' AND q.params=jsonb_build_object('c',d.cabinet_no) AND q.status IN ('pending','sent') AND q.expires_at>clock_timestamp()) UNION ALL SELECT b.ems_uuid,'structure.get',NULL FROM structure_refresh_demand d JOIN ems_binding_period b ON b.id=d.binding_period_id JOIN connection_state s ON s.ems_uuid=b.ems_uuid WHERE d.pending AND NOT EXISTS(SELECT 1 FROM (SELECT q.status,q.result FROM query_request q WHERE q.binding_period_id=b.id AND q.connection_id=s.connection_id AND q.operation='structure.get' AND q.params='{}'::jsonb ORDER BY q.created_at DESC,q.id DESC LIMIT 1) latest WHERE latest.status='failed' AND latest.result ? 'error' AND latest.result->'error'->>'code' NOT IN ('BUSY','DATA_UNAVAILABLE')) AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) AND s.lease_until>clock_timestamp() AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AND NOT EXISTS(SELECT 1 FROM query_request q WHERE q.ems_uuid=b.ems_uuid AND q.operation='structure.get' AND q.status IN ('pending','sent') AND q.expires_at>clock_timestamp()) LIMIT 1";
        try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery(sql)) {
            if(!r.next())return false;int cabinet=r.getInt(3);boolean absent=r.wasNull();
            return enqueueAutomatic(UUID.fromString(r.getString(1)),r.getString(2),absent?null:cabinet);
        }catch(SQLException failure){return false;}
    }
    public boolean enqueueAutomatic(UUID ems, String operation, Integer cabinet) {
        if(!allowed(operation) || operation.equals("alarm.current.get") && (cabinet==null||cabinet<1||cabinet>30) || operation.equals("structure.get")&&cabinet!=null)return false;
        boolean[] queued={false};
        boolean committed=StateTransaction.run(source,ems.toString(),c->{
            long period;String connection;Instant now=StateTransaction.now(c);
            try(var q=c.prepareStatement("SELECT b.id,s.connection_id FROM connection_state s JOIN ems_binding_period b USING(ems_uuid) WHERE s.ems_uuid=?::uuid AND s.connection_id IS NOT NULL AND s.lease_until>clock_timestamp() AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) FOR UPDATE OF s")) {
                q.setString(1,ems.toString());try(var r=q.executeQuery()){if(!r.next())return;period=r.getLong(1);connection=r.getString(2);}
            }
            if(cabinet!=null)try(var q=c.prepareStatement("SELECT 1 FROM device_binding WHERE binding_period_id=? AND cabinet_no=? AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp())")) {
                q.setLong(1,period);q.setInt(2,cabinet);try(var r=q.executeQuery()){if(!r.next())return;}
            }
            var params=JsonNodeFactory.instance.objectNode();if(cabinet!=null)params.put("c",cabinet);
            try(var latest=c.prepareStatement("SELECT status,result::text FROM query_request WHERE binding_period_id=? AND connection_id=?::uuid AND operation=? AND params=?::jsonb ORDER BY created_at DESC,id DESC LIMIT 1")) {
                latest.setLong(1,period);latest.setString(2,connection);latest.setString(3,operation);latest.setString(4,params.toString());
                try(var r=latest.executeQuery()){if(r.next() && r.getString(1).equals("failed") && r.getString(2)!=null) {
                    var result=new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.getString(2));
                    if(result.has("error") && !Set.of("BUSY","DATA_UNAVAILABLE").contains(result.path("error").path("code").asText()))return;
                }}
            }
            try(var q=c.prepareStatement("SELECT count(*) FILTER(WHERE created_at>clock_timestamp()-interval '60 seconds'),count(*) FILTER(WHERE status IN ('pending','sent') AND expires_at>clock_timestamp()),count(*) FILTER(WHERE operation=? AND params=?::jsonb AND status IN ('pending','sent') AND expires_at>clock_timestamp()) FROM query_request WHERE ems_uuid=?::uuid AND connection_id=?::uuid")) {
                q.setString(1,operation);q.setString(2,params.toString());q.setString(3,ems.toString());q.setString(4,connection);
                try(var r=q.executeQuery()){r.next();if(r.getInt(1)>=32||r.getInt(2)>=32||r.getInt(3)>0)return;}
            }
            UUID id=UUID.randomUUID();Instant deadline=now.plusSeconds(30);
            var wire=JsonNodeFactory.instance.objectNode();wire.put("v",1);wire.put("emsId",ems.toString());wire.put("connectionId",connection);wire.put("id",id.toString());wire.put("op",operation);wire.put("expiresAtMs",deadline.toEpochMilli());wire.set("params",params);
            try(var q=c.prepareStatement("INSERT INTO query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status) VALUES(?::uuid,?::uuid,NULL,?,?::uuid,?,?::jsonb,?,?,'pending')")) {
                q.setString(1,id.toString());q.setString(2,ems.toString());q.setLong(3,period);q.setString(4,connection);q.setString(5,operation);q.setString(6,params.toString());q.setTimestamp(7,Timestamp.from(now));q.setTimestamp(8,Timestamp.from(deadline));q.executeUpdate();
            }
            try(var q=c.prepareStatement("INSERT INTO outbox(ems_uuid,type,query_request_id,topic,payload) VALUES(?::uuid,'query',?::uuid,?,?)")) {
                q.setString(1,ems.toString());q.setString(2,id.toString());q.setString(3,"ems/v1/"+ems+"/down/request");q.setBytes(4,wire.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));q.executeUpdate();
            }
            if(operation.equals("alarm.current.get"))try(var q=c.prepareStatement("UPDATE alarm_refresh_demand SET pending=false WHERE binding_period_id=? AND cabinet_no=?")) {q.setLong(1,period);q.setInt(2,cabinet);q.executeUpdate();}
            else try(var q=c.prepareStatement("UPDATE structure_refresh_demand SET pending=false WHERE binding_period_id=?")){q.setLong(1,period);q.executeUpdate();}
            queued[0]=true;
        });
        return committed && queued[0];
    }
    private final String owner=UUID.randomUUID().toString();
    private record Claim(String ems,String id,long outbox,String topic,byte[] bytes,java.math.BigDecimal fence) {}
    /** API writes authenticated requests only; worker owns exact wire materialization. */
    public boolean materializePending() {
        String ems;
        try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT q.ems_uuid FROM query_request q WHERE q.status='pending' AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.query_request_id=q.id) ORDER BY q.created_at,q.id LIMIT 1")) {
            if(!r.next())return false;ems=r.getString(1);
        }catch(SQLException failure){return false;}
        return StateTransaction.run(source,ems,c->{
            String sql="SELECT q.id,q.binding_period_id,q.connection_id,q.operation,q.params::text,q.expires_at,"
                +"q.actor_id IS NOT NULL AND q.connection_id=s.connection_id AND s.lease_until>clock_timestamp() "
                +"AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AND b.valid_from<=clock_timestamp() "
                +"AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) AND q.expires_at<=q.created_at+interval '30 seconds' "
                +"AND EXISTS(SELECT 1 FROM effective_station_permission p WHERE p.user_id=q.actor_id AND p.station_id=b.station_id AND p.permission_code='ems.query') "
                +"FROM query_request q JOIN connection_state s ON s.ems_uuid=q.ems_uuid JOIN ems_binding_period b ON b.id=q.binding_period_id "
                +"WHERE q.ems_uuid=?::uuid AND q.status='pending' AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.query_request_id=q.id) "
                +"ORDER BY q.created_at,q.id FOR UPDATE OF q LIMIT 1";
            try(var q=c.prepareStatement(sql)) {
                q.setString(1,ems);try(var r=q.executeQuery()){if(!r.next())return;
                    String id=r.getString(1),op=r.getString(4);var params=new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.getString(5));
                    boolean valid=r.getBoolean(7)&&allowed(op);
                    valid &= op.equals("structure.get")?params.size()==0:params.size()==1&&params.path("c").isIntegralNumber()&&params.path("c").intValue()>=1&&params.path("c").intValue()<=30;
                    if(valid && op.equals("alarm.current.get"))try(var bound=c.prepareStatement("SELECT 1 FROM device_binding WHERE binding_period_id=? AND cabinet_no=? AND valid_from<=clock_timestamp() AND (valid_to IS NULL OR valid_to>clock_timestamp())")) {
                        bound.setLong(1,r.getLong(2));bound.setInt(2,params.path("c").intValue());try(var rows=bound.executeQuery()){valid=rows.next();}
                    }
                    if(valid)try(var rate=c.prepareStatement("SELECT count(*) FROM query_request WHERE ems_uuid=?::uuid AND connection_id=?::uuid AND created_at>clock_timestamp()-interval '60 seconds' AND (created_at,id)<=(SELECT created_at,id FROM query_request WHERE id=?::uuid)")) {
                        rate.setString(1,ems);rate.setString(2,r.getString(3));rate.setString(3,id);try(var rows=rate.executeQuery()){rows.next();valid=rows.getInt(1)<=32;}
                    }
                    boolean expired=!r.getTimestamp(6).toInstant().isAfter(StateTransaction.now(c));
                    if(!valid||expired) {
                        try(var reject=c.prepareStatement("UPDATE query_request SET status=? WHERE id=?::uuid")){reject.setString(1,expired?"expired":"failed");reject.setString(2,id);reject.executeUpdate();}return;
                    }
                    var wire=JsonNodeFactory.instance.objectNode();wire.put("v",1);wire.put("emsId",ems);wire.put("connectionId",r.getString(3));wire.put("id",id);wire.put("op",op);wire.put("expiresAtMs",r.getTimestamp(6).toInstant().toEpochMilli());wire.set("params",params);
                    try(var insert=c.prepareStatement("INSERT INTO outbox(ems_uuid,type,query_request_id,topic,payload) VALUES(?::uuid,'query',?::uuid,?,?)")) {
                        insert.setString(1,ems);insert.setString(2,id);insert.setString(3,"ems/v1/"+ems+"/down/request");insert.setBytes(4,wire.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));insert.executeUpdate();
                    }
                }
            }
        });
    }
    public boolean publishNext() {
        materializePending();
        String ems;
        String candidate="SELECT q.ems_uuid FROM query_request q JOIN outbox o ON o.query_request_id=q.id "
            +"WHERE q.status IN ('pending','sent') AND (q.expires_at<=clock_timestamp() OR (o.status='pending' AND o.next_attempt_at<=clock_timestamp()) "
            +"OR (o.status='sending' AND o.lease_until<=clock_timestamp())) AND (q.expires_at<=clock_timestamp() OR o.first_attempt_at IS NOT NULL OR (SELECT count(*) FROM outbox rate JOIN query_request rq ON rq.id=rate.query_request_id WHERE rq.ems_uuid=q.ems_uuid AND rq.connection_id=q.connection_id AND rate.first_attempt_at>clock_timestamp()-interval '60 seconds')<32) ORDER BY q.created_at,q.id LIMIT 1";
        try(var c=source.getConnection();var s=c.createStatement();var r=s.executeQuery(candidate)) {if(!r.next())return false;ems=r.getString(1);}
        catch(SQLException failure){return false;}
        Claim[] claim={null};
        boolean committed=StateTransaction.run(source,ems,c->{
            String sql="SELECT q.id,q.binding_period_id,q.operation,q.params::text,o.id,o.topic,o.payload,q.expires_at,"
                +"q.connection_id=s.connection_id AND s.lease_until>clock_timestamp() AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' "
                +"AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) "
                +"AND (q.actor_id IS NULL OR EXISTS(SELECT 1 FROM effective_station_permission p WHERE p.user_id=q.actor_id AND p.station_id=b.station_id AND p.permission_code='ems.query')) AS valid,"
                +"o.attempts FROM query_request q JOIN outbox o ON o.query_request_id=q.id JOIN connection_state s ON s.ems_uuid=q.ems_uuid "
                +"JOIN ems_binding_period b ON b.id=q.binding_period_id WHERE q.ems_uuid=?::uuid AND q.status IN ('pending','sent') "
                +"AND (q.expires_at<=clock_timestamp() OR (o.status='pending' AND o.next_attempt_at<=clock_timestamp()) OR (o.status='sending' AND o.lease_until<=clock_timestamp())) "
                +"ORDER BY q.created_at,q.id FOR UPDATE OF q,o LIMIT 1";
            try(var q=c.prepareStatement(sql)) {
                q.setString(1,ems);try(var r=q.executeQuery()){if(!r.next())return;
                    String id=r.getString(1),operation=r.getString(3);long period=r.getLong(2),outbox=r.getLong(5);
                    boolean expired=!r.getTimestamp(8).toInstant().isAfter(StateTransaction.now(c));
                    if(expired || !r.getBoolean(9) || !allowed(operation)) {
                        finish(c,id,outbox,r.getInt(10)>0?"unknown":expired?"expired":"failed");
                        restore(c,period,operation,r.getString(4));return;
                    }
                    if(r.getInt(10)==0)try(var rate=c.prepareStatement("SELECT count(*) FROM outbox o JOIN query_request q ON q.id=o.query_request_id WHERE q.ems_uuid=?::uuid AND q.connection_id=(SELECT connection_id FROM query_request WHERE id=?::uuid) AND o.first_attempt_at>clock_timestamp()-interval '60 seconds'")) {
                        rate.setString(1,ems);rate.setString(2,id);try(var rows=rate.executeQuery()){rows.next();if(rows.getInt(1)>=32)return;}
                    }
                    try(var update=c.prepareStatement("UPDATE outbox SET status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),lease_owner=?,lease_until=clock_timestamp()+interval '5 seconds',fencing_token=fencing_token+1 WHERE id=? RETURNING fencing_token")) {
                        update.setString(1,owner);update.setLong(2,outbox);try(var row=update.executeQuery()){row.next();claim[0]=new Claim(ems,id,outbox,r.getString(6),r.getBytes(7),row.getBigDecimal(1));}
                    }
                    try(var update=c.prepareStatement("UPDATE query_request SET status='sent' WHERE id=?::uuid")){update.setString(1,id);update.executeUpdate();}
                }
            }
        });
        if(!committed || claim[0]==null)return committed;
        var saved=claim[0];
        // The attempt is durable before I/O. Re-check current authorization in this locked send transaction.
        return StateTransaction.run(source,ems,c->{
            try(var q=c.prepareStatement("SELECT q.binding_period_id,q.operation,q.params::text,q.expires_at>clock_timestamp() AND q.connection_id=s.connection_id AND s.lease_until>clock_timestamp() AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) AND (q.actor_id IS NULL OR EXISTS(SELECT 1 FROM effective_station_permission p WHERE p.user_id=q.actor_id AND p.station_id=b.station_id AND p.permission_code='ems.query')) FROM query_request q JOIN connection_state s ON s.ems_uuid=q.ems_uuid JOIN ems_binding_period b ON b.id=q.binding_period_id JOIN outbox o ON o.query_request_id=q.id WHERE q.id=?::uuid AND q.status='sent' AND o.lease_owner=? AND o.fencing_token=? FOR UPDATE OF q,o")) {
                q.setString(1,saved.id());q.setString(2,owner);q.setBigDecimal(3,saved.fence());
                try(var r=q.executeQuery()){if(!r.next())return;
                    if(!r.getBoolean(4)){finish(c,saved.id(),saved.outbox(),"unknown");restore(c,r.getLong(1),r.getString(2),r.getString(3));return;}
                    boolean delivered=false;
                    try{publisher.publish(saved.topic(),saved.bytes());delivered=true;}catch(Exception failed){if(failed instanceof InterruptedException)Thread.currentThread().interrupt();}
                    try(var update=c.prepareStatement("UPDATE outbox SET status=?,lease_owner=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+interval '1 second' WHERE id=? AND lease_owner=? AND fencing_token=?")) {
                        update.setString(1,delivered?"sent":"pending");update.setLong(2,saved.outbox());update.setString(3,owner);update.setBigDecimal(4,saved.fence());update.executeUpdate();
                    }
                }
            }
        });
    }
    static void finish(Connection c,String id,long outbox,String status)throws SQLException {
        try(var q=c.prepareStatement("UPDATE query_request SET status=? WHERE id=?::uuid")){q.setString(1,status);q.setString(2,id);q.executeUpdate();}
        try(var q=c.prepareStatement("UPDATE outbox SET status='cancelled' WHERE id=?")){q.setLong(1,outbox);q.executeUpdate();}
    }
    static void restore(Connection c,long period,String operation,String params)throws Exception {
        if(operation.equals("alarm.current.get"))AlarmProjection.requireRefresh(c,period,new com.fasterxml.jackson.databind.ObjectMapper().readTree(params).path("c").intValue());
        else if(operation.equals("structure.get"))try(var q=c.prepareStatement("INSERT INTO structure_refresh_demand(binding_period_id,pending) VALUES(?,true) ON CONFLICT(binding_period_id) DO UPDATE SET pending=true")){q.setLong(1,period);q.executeUpdate();}
    }
    static boolean allowed(String operation) { return "structure.get".equals(operation) || "alarm.current.get".equals(operation); }
}
