package com.enerlution.ems.ingestion;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import java.sql.*;
import com.enerlution.ems.protocol.WireMessage;
public final class StructureStore {
    private final javax.sql.DataSource source;
    public StructureStore(javax.sql.DataSource source) { this.source=source; }
    public boolean accept(IngressEnvelope envelope) {
        var m=ReliableMessageStore.decode(envelope);
        if(!m.type().equals("structure"))return true;
        return StateTransaction.run(source,envelope.emsId().toString(),c -> {
            Long period=StateTransaction.admission(c,envelope,true);
            if(period!=null)store(c,period,envelope,m);
        });
    }
    static boolean store(Connection c,long period,IngressEnvelope e,WireMessage m)throws SQLException {
        var n=m.body();String connection=n.path("connectionId").asText();
        try(var q=c.prepareStatement("SELECT 1 FROM connection_state WHERE ems_uuid=?::uuid AND connection_id=?::uuid")) {
            q.setString(1,e.emsId().toString());q.setString(2,connection);try(var r=q.executeQuery()){if(!r.next())return false;}
        }
        try(var q=c.prepareStatement("SELECT sc.seq,sc.metadata::text,sr.sv FROM structure_current sc LEFT JOIN structure_revision sr ON sr.id=sc.revision_id WHERE sc.ems_uuid=?::uuid AND sc.binding_period_id=? AND sc.connection_id=?::uuid")) {
            q.setString(1,e.emsId().toString());q.setLong(2,period);q.setString(3,connection);
            try(var r=q.executeQuery()){if(r.next()) {
                int order=n.path("seq").decimalValue().compareTo(r.getBigDecimal(1));
                if(order<0)return false;
                if(order==0) {
                    try {
                        boolean sameMetadata=CanonicalJson.equivalent(CanonicalJson.read(r.getString(2)),n.get("d"));
                        boolean sameVersion=r.getBigDecimal(3)==null?n.path("sv").isNull():
                            !n.path("sv").isNull() && r.getBigDecimal(3).compareTo(n.path("sv").decimalValue())==0;
                        return sameMetadata && sameVersion;
                    }catch(java.io.IOException invalid){throw new SQLException("Invalid saved metadata",invalid);}
                }
            }}
        }
        Long revision=null;
        if(!n.path("sv").isNull()) {
            String projected=layout(n.get("d")).toString();String hash=TypedFact.id("structure-layout",projected);
            try(var q=c.prepareStatement("INSERT INTO structure_revision(ems_uuid,sv,layout,content_hash) VALUES(?::uuid,?,?::jsonb,?) ON CONFLICT(ems_uuid,sv) DO NOTHING")) {
                q.setString(1,e.emsId().toString());q.setBigDecimal(2,n.path("sv").decimalValue());q.setString(3,projected);q.setString(4,hash);q.executeUpdate();
            }
            try(var q=c.prepareStatement("SELECT id,content_hash FROM structure_revision WHERE ems_uuid=?::uuid AND sv=?")) {
                q.setString(1,e.emsId().toString());q.setBigDecimal(2,n.path("sv").decimalValue());try(var r=q.executeQuery()){r.next();if(!hash.equals(r.getString(2)))return false;revision=r.getLong(1);}
            }
            try(var q=c.prepareStatement("INSERT INTO structure_acceptance VALUES(?,?,?) ON CONFLICT DO NOTHING")) {
                q.setLong(1,period);q.setLong(2,revision);q.setTimestamp(3,Timestamp.from(e.receivedAt()));q.executeUpdate();
            }
        }
        try(var q=c.prepareStatement("INSERT INTO structure_current(ems_uuid,binding_period_id,connection_id,seq,revision_id,metadata,received_at) VALUES(?::uuid,?,?::uuid,?,?,?::jsonb,?) ON CONFLICT(ems_uuid) DO UPDATE SET binding_period_id=excluded.binding_period_id,connection_id=excluded.connection_id,seq=excluded.seq,revision_id=excluded.revision_id,metadata=excluded.metadata,received_at=excluded.received_at")) {
            q.setString(1,e.emsId().toString());q.setLong(2,period);q.setString(3,connection);q.setBigDecimal(4,n.path("seq").decimalValue());if(revision==null)q.setNull(5,Types.BIGINT);else q.setLong(5,revision);q.setString(6,n.get("d").toString());q.setTimestamp(7,Timestamp.from(e.receivedAt()));q.executeUpdate();
        }
        return true;
    }
    static JsonNode layout(JsonNode d) {
        var result = JsonNodeFactory.instance.objectNode();
        var layout = result.putObject("clusterLayout");
        for (String field : List.of("emu", "pcs", "dcdc", "tms", "bms"))
            layout.set(field, d.path("clusterLayout").get(field).deepCopy());
        layout.set("clusterMeters", meters(d.path("clusterLayout").get("clusterMeters")));
        result.set("publicMeters", meters(d.get("publicMeters")));
        var cabinets = new ArrayList<JsonNode>();
        d.path("clusters").forEach(cabinets::add);
        cabinets.sort(Comparator.comparingInt(c -> c.path("c").intValue()));
        var clusters = result.putArray("clusters");
        for (var cabinet : cabinets) clusters.addObject().set("c", cabinet.get("c").deepCopy());
        return CanonicalJson.normalize(result);
    }
    private static JsonNode meters(JsonNode input) {
        if (input.isNull()) return NullNode.instance;
        var meters = new ArrayList<JsonNode>();
        input.forEach(meters::add);
        meters.sort(Comparator.comparing(n -> n.path("id").bigIntegerValue()));
        var result = JsonNodeFactory.instance.arrayNode();
        for (var meter : meters) {
            var item = result.addObject();
            item.set("id", meter.get("id").deepCopy());
            item.set("use", meter.get("use").deepCopy());
        }
        return result;
    }
}
