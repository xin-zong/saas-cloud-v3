package com.enerlution.ems.ingestion;

import javax.sql.DataSource;
import com.enerlution.ems.protocol.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;

public final class ReliableProjection implements Runnable,AutoCloseable {
    private final DataSource source;
    private final TelemetryConsumer.FactSink sink;
    private final PointCatalog catalog=PointCatalog.loadDefault();
    private long cursor;
    private volatile boolean closed;
    private boolean failed;
    public ReliableProjection(DataSource source, TelemetryConsumer.FactSink sink) {this.source=source;this.sink=sink;}
    public void run() {
        long backoff=250;
        while(!closed&&!Thread.currentThread().isInterrupted())try {
            boolean work=projectNext();
            if(failed){Thread.sleep(backoff);backoff=Math.min(5000,backoff*2);}
            else {backoff=250;if(!work)Thread.sleep(250);}
        }catch(InterruptedException stop){Thread.currentThread().interrupt();return;}
        catch(Exception unavailable){try{Thread.sleep(backoff);backoff=Math.min(5000,backoff*2);}catch(InterruptedException stop){Thread.currentThread().interrupt();return;}}
    }
    public void close(){closed=true;}

    /** A committed PG object's original period is authority; live gateway leases are irrelevant here. */
    public boolean projectNext() throws Exception {
        failed=false;
        try(var c=source.getConnection()) {
            c.setAutoCommit(false);
            try {
                Long selected=next(c,cursor);if(selected==null&&cursor>0){cursor=0;selected=next(c,0);}if(selected==null){c.rollback();return false;}
                String ems;
                try(var q=c.prepareStatement("SELECT ems_uuid FROM reliable_message WHERE id=?")){q.setLong(1,selected);try(var r=q.executeQuery()){if(!r.next()){c.rollback();return false;}ems=r.getString(1);}}
                // Same lock ordering as admission/period edits: EMS advisory lock precedes reliable row lock.
                ReliableMessageStore.lock(c,ems);
                long period;Instant received;String type,raw;long id;
                try(var q=c.prepareStatement("SELECT r.id,r.binding_period_id,r.type,r.received_at,r.raw_payload FROM reliable_message r JOIN ems_binding_period b ON b.id=r.binding_period_id AND b.ems_uuid=r.ems_uuid WHERE r.id=? AND r.status IN ('saved','projection_failed') FOR UPDATE OF r")) {
                    q.setLong(1,selected);try(var r=q.executeQuery()){if(!r.next()){c.rollback();return true;}id=r.getLong(1);period=r.getLong(2);type=r.getString(3);received=r.getTimestamp(4).toInstant();raw=new String(r.getBytes(5),StandardCharsets.UTF_8);}
                }
                cursor=id;
                try {
                    var m=new WireDecoder().decode("ems/v1/"+ems+"/up/"+(type.equals("important_history")?"important":"alarm"),raw.getBytes(StandardCharsets.UTF_8));
                    List<ObjectNode> rows=switch(type) {
                        case "important_history" -> history(c,id,period,received,m);
                        case "alarm_data" -> alarmData(c,id,period,received,m);
                        case "alarm_event" -> List.of(); // Alarm business history was committed atomically by Task5.
                        default -> throw new IllegalArgumentException("Unsupported reliable projection");
                    };
                    sink.observations(rows);status(c,id,"projected");c.commit();
                } catch(Exception unavailable) {failed=true;status(c,id,"projection_failed");c.commit();}
                return true;
            } catch(Exception failure){c.rollback();throw failure;}
        }
    }
    private Long next(Connection c,long after)throws SQLException {
        try(var q=c.prepareStatement("SELECT id FROM reliable_message WHERE status IN ('saved','projection_failed') AND id>? ORDER BY id LIMIT 1")) {
            q.setQueryTimeout(5);q.setLong(1,after);try(var r=q.executeQuery()){return r.next()?r.getLong(1):null;}
        }
    }
    private static void status(Connection c,long id,String status)throws SQLException {
        try(var q=c.prepareStatement("UPDATE reliable_message SET status=? WHERE id=?")){q.setString(1,status);q.setLong(2,id);q.executeUpdate();}
    }
    private List<ObjectNode> history(Connection c,long id,long period,Instant received,WireMessage m)throws Exception {
        var rows=new ArrayList<ObjectNode>();var b=m.body();int cabinet=b.path("c").intValue();
        for(var sample:b.path("data")) {
            int sourceId=b.path("p").get(sample.get(1).bigIntegerValue().intValueExact()).bigIntegerValue().intValueExact();
            long at=b.path("ts").bigIntegerValue().add(sample.get(0).bigIntegerValue()).longValueExact();
            long owner,originalPeriod;Instant firstReceipt;
            // The source-sample identity survives equal samples uploaded by another task. Retain first provenance.
            try(var q=c.prepareStatement("SELECT h.reliable_message_id,r.binding_period_id,r.received_at FROM history_sample_identity h JOIN reliable_message r ON r.id=h.reliable_message_id WHERE h.ems_uuid=?::uuid AND h.cabinet_no=? AND h.source_id=? AND h.archived_at=?")) {
                q.setString(1,m.emsId().toString());q.setInt(2,cabinet);q.setInt(3,sourceId);q.setTimestamp(4,Timestamp.from(Instant.ofEpochMilli(at)));
                try(var r=q.executeQuery()){if(!r.next())throw new IllegalArgumentException("Accepted source identity missing");owner=r.getLong(1);originalPeriod=r.getLong(2);firstReceipt=r.getTimestamp(3).toInstant();}
            }
            var row=sample(c,owner,originalPeriod,firstReceipt,m,cabinet,null,sourceId,at,"archive",sample.get(2));
            row.put("fact_id",TypedFact.id("history_sample",m.emsId().toString(),Long.toString(originalPeriod),Integer.toString(cabinet),Integer.toString(sourceId),"archive",Long.toString(at)));
            rows.add(row);
        }
        return rows;
    }
    private List<ObjectNode> alarmData(Connection c,long id,long period,Instant received,WireMessage m)throws Exception {
        var rows=new ArrayList<ObjectNode>();var b=m.body();int rowIndex=0;
        for(var values:b.path("data")) {
            long at=b.path("start").bigIntegerValue().add(b.path("step").bigIntegerValue().multiply(java.math.BigInteger.valueOf(rowIndex++))).longValueExact();
            for(int i=0;i<values.size();i++) {
                var p=b.path("points").get(i);
                rows.add(sample(c,id,period,received,m,p.get(0).intValue(),p.get(1).textValue(),p.get(2).bigIntegerValue().intValueExact(),at,"source",values.get(i)));
            }
        }
        return rows;
    }
    private ObjectNode sample(Connection c,long owner,long period,Instant receipt,WireMessage m,int cabinet,String suppliedSubsystem,int sourceId,long at,String timeKind,com.fasterxml.jackson.databind.JsonNode value)throws Exception {
        var definition=catalog.find("cabinet",sourceId).orElseThrow(()->new IllegalArgumentException("Unknown source definition"));
        if(suppliedSubsystem!=null&&!suppliedSubsystem.equals(definition.subsystem()))throw new IllegalArgumentException("Source placement mismatch");
        if(!value.isNull())switch(definition.wireType()) {
            case NUMBER -> {if(!value.isNumber())throw new IllegalArgumentException("Expected number");}
            case TEXT -> {if(!value.isTextual())throw new IllegalArgumentException("Expected text");}
            case U16_WORDS -> {if(!value.isArray())throw new IllegalArgumentException("Expected U16 words");TypedFact.value(value);}
            default -> throw new IllegalArgumentException("Unknown source semantics");
        }
        Long point=TelemetryConsumer.point(c,period,cabinet,"cabinet",sourceId,definition.subsystem(),Instant.ofEpochMilli(at),catalog);
        if(point==null)throw new IllegalArgumentException("Historical physical mapping missing");
        String identity=TypedFact.id("reliable",m.emsId().toString(),Long.toString(owner));
        return TelemetryConsumer.observation(period,point,identity,m.type(),at,timeKind,receipt.toEpochMilli(),value.isNull()?"invalid":"valid",value);
    }
}
