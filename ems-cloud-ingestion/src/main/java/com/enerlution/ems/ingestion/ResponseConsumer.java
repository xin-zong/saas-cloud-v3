package com.enerlution.ems.ingestion;
import java.sql.*;
import com.enerlution.ems.protocol.WireDecoder;
public final class ResponseConsumer {
    private final javax.sql.DataSource source;
    public ResponseConsumer(javax.sql.DataSource source) {this.source=source;}
    public boolean accept(IngressEnvelope envelope) {
        var message=ReliableMessageStore.decode(envelope);if(!message.channel().equals("response"))return true;
        String id=message.body().path("id").asText();
        try{java.util.UUID.fromString(id);}catch(IllegalArgumentException unknown){return true;}
        return StateTransaction.run(source,envelope.emsId().toString(),c->{
            Long currentPeriod=StateTransaction.admission(c,envelope,true);if(currentPeriod==null)return;
            try(var q=c.prepareStatement("SELECT q.binding_period_id,q.operation,q.params::text,q.connection_id,q.expires_at,q.status,o.id,s.connection_id FROM query_request q JOIN outbox o ON o.query_request_id=q.id JOIN connection_state s ON s.ems_uuid=q.ems_uuid WHERE q.id=?::uuid AND q.ems_uuid=?::uuid FOR UPDATE OF q,o")) {
                q.setString(1,id);q.setString(2,envelope.emsId().toString());try(var r=q.executeQuery()){if(!r.next() || !r.getString(6).equals("sent"))return;
                    long period=r.getLong(1),outbox=r.getLong(7);String op=r.getString(2),params=r.getString(3);
                    if(period!=currentPeriod || !r.getString(4).equals(r.getString(8)))return;
                    if(!r.getTimestamp(5).toInstant().isAfter(StateTransaction.now(c))) {
                        QueryDispatcher.finish(c,id,outbox,"unknown");QueryDispatcher.restore(c,period,op,params);return;
                    }
                    if(message.body().path("ok").asBoolean()) {
                        var data=message.body().path("data");String expected=op.equals("structure.get")?"structure":"alarm_current";
                        if(!data.path("type").asText().equals(expected)||!data.path("connectionId").asText().equals(r.getString(4)))return;
                        if(op.equals("alarm.current.get") && data.path("c").intValue()!=new com.fasterxml.jackson.databind.ObjectMapper().readTree(params).path("c").intValue())return;
                        String channel=expected.equals("structure")?"telemetry":"alarm";String topic="ems/v1/"+envelope.emsId()+"/up/"+channel;
                        var nested=new WireDecoder().decode(topic,data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                        boolean accepted=expected.equals("structure")?StructureStore.store(c,period,envelope,nested):AlarmProjection.storeCurrent(c,period,envelope,nested);
                        if(!accepted){QueryDispatcher.finish(c,id,outbox,"failed");QueryDispatcher.restore(c,period,op,params);return;}
                        try(var update=c.prepareStatement("UPDATE query_request SET status='succeeded',result=?::jsonb WHERE id=?::uuid")){update.setString(1,data.toString());update.setString(2,id);update.executeUpdate();}
                    } else {
                        QueryDispatcher.finish(c,id,outbox,"failed");QueryDispatcher.restore(c,period,op,params);
                        try(var update=c.prepareStatement("UPDATE query_request SET result=?::jsonb WHERE id=?::uuid")){update.setString(1,message.body().toString());update.setString(2,id);update.executeUpdate();}
                    }
                }
            }
        });
    }
}
