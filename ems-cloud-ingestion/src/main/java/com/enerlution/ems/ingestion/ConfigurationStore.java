package com.enerlution.ems.ingestion;
import com.enerlution.ems.protocol.*;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.sql.*;
public final class ConfigurationStore {
    private final javax.sql.DataSource source;
    public ConfigurationStore(javax.sql.DataSource source) {this.source=source;}
    public boolean accept(IngressEnvelope envelope) {
        var message=ReliableMessageStore.decode(envelope);
        if(!message.type().equals("ems"))return true;
        final ConfigurationSnapshot snapshot;
        try{snapshot=new TelemetryDecoder(PointCatalog.loadDefault()).decode(message,null).configuration();}
        catch(ProtocolException invalid){return true;}
        return StateTransaction.run(source,envelope.emsId().toString(),c->{
            Long period=StateTransaction.admission(c,envelope,false);
            if(period!=null)store(c,period,envelope,snapshot);
        });
    }
    static boolean store(Connection c,long period,IngressEnvelope envelope,ConfigurationSnapshot snapshot)throws SQLException {
        var sorted=new java.util.TreeMap<>(snapshot.allValues());var values=JsonNodeFactory.instance.arrayNode();
        for(var entry:sorted.entrySet()) {
            var value=entry.getValue();
            // Canonical numeric contents compare by exact value, independently of JSON scale.
            values.addArray().add(entry.getKey()).add(value.isNumber()?JsonNodeFactory.instance.numberNode(value.decimalValue().stripTrailingZeros()):value);
        }
        String hash=TypedFact.id("configuration",values.toString());Long revision=null;
        try(var q=c.prepareStatement("SELECT id,content_hash FROM config_revision WHERE ems_uuid=?::uuid AND cfg_rev=?")) {
            q.setString(1,envelope.emsId().toString());q.setBigDecimal(2,new java.math.BigDecimal(snapshot.revision()));
            try(var r=q.executeQuery()){if(r.next()){if(!hash.equals(r.getString(2)))return false;revision=r.getLong(1);}}
        }
        if(revision==null) {
            try(var q=c.prepareStatement("INSERT INTO config_revision(ems_uuid,cfg_rev,content_hash) VALUES(?::uuid,?,?) RETURNING id")) {
                q.setString(1,envelope.emsId().toString());q.setBigDecimal(2,new java.math.BigDecimal(snapshot.revision()));q.setString(3,hash);try(var r=q.executeQuery()){r.next();revision=r.getLong(1);}
            }
            var catalog=PointCatalog.loadDefault();
            try(var q=c.prepareStatement("INSERT INTO point_definition(catalog_version,namespace,source_id,value_type) VALUES(?,'config',?,'scalar') ON CONFLICT(catalog_version,namespace,source_id) DO NOTHING")) {
                for(var id:sorted.keySet()){q.setString(1,catalog.version());q.setBigDecimal(2,new java.math.BigDecimal(id));q.addBatch();}q.executeBatch();
            }
            var definitions=new java.util.HashMap<java.math.BigInteger,Long>();
            try(var q=c.prepareStatement("SELECT source_id,id,value_type FROM point_definition WHERE catalog_version=? AND namespace='config'")) {
                q.setString(1,catalog.version());try(var r=q.executeQuery()){while(r.next()) {
                    var id=r.getBigDecimal(1).toBigIntegerExact();
                    if(sorted.containsKey(id) && !r.getString(3).equals("scalar"))throw new SQLException("Configuration definition must retain scalar semantics");
                    definitions.put(id,r.getLong(2));
                }}
            }
            try(var q=c.prepareStatement("INSERT INTO config_value(revision_id,definition_id,value_type,number_value,text_value) VALUES(?,?,'scalar',?,?)")) {
                for(var entry:sorted.entrySet()) {
                    var value=entry.getValue();q.setLong(1,revision);q.setLong(2,definitions.get(entry.getKey()));
                    if(value.isNumber())q.setBigDecimal(3,value.decimalValue());else q.setNull(3,Types.NUMERIC);
                    if(value.isTextual())q.setString(4,value.textValue());else q.setNull(4,Types.VARCHAR);q.addBatch();
                }q.executeBatch();
            }
        }
        try(var q=c.prepareStatement("INSERT INTO config_acceptance VALUES(?,?,?) ON CONFLICT DO NOTHING")) {
            q.setLong(1,period);q.setLong(2,revision);q.setTimestamp(3,Timestamp.from(envelope.receivedAt()));q.executeUpdate();
        }
        try(var q=c.prepareStatement("INSERT INTO config_current(ems_uuid,binding_period_id,revision_id,ingress_fence,ingress_order) VALUES(?::uuid,?,?,?,?) ON CONFLICT(ems_uuid) DO UPDATE SET binding_period_id=excluded.binding_period_id,revision_id=excluded.revision_id,ingress_fence=excluded.ingress_fence,ingress_order=excluded.ingress_order WHERE config_current.binding_period_id<>excluded.binding_period_id OR config_current.ingress_fence<excluded.ingress_fence OR (config_current.ingress_fence=excluded.ingress_fence AND config_current.ingress_order<excluded.ingress_order)")) {
            q.setString(1,envelope.emsId().toString());q.setLong(2,period);q.setLong(3,revision);q.setBigDecimal(4,new java.math.BigDecimal(envelope.fencingToken()));q.setBigDecimal(5,new java.math.BigDecimal(envelope.sequence()));q.executeUpdate();
        }
        return true;
    }
}
