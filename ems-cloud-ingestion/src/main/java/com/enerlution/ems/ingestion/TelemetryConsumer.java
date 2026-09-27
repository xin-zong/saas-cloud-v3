package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.node.ObjectNode;
import javax.sql.DataSource;
import com.enerlution.ems.protocol.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.sql.*;
import java.time.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.WakeupException;
import java.util.concurrent.atomic.AtomicBoolean;

public final class TelemetryConsumer implements Runnable, AutoCloseable {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(TelemetryConsumer.class);
    public interface FactSink {
        void observations(List<ObjectNode> rows) throws Exception;
        void cells(List<ObjectNode> rows) throws Exception;
    }
    private final DataSource source;
    private final FactSink sink;
    private final TransportDiagnostics diagnostics;
    private final PointCatalog catalog = PointCatalog.loadDefault();
    private KafkaConsumer<String,String> consumer;
    private final AtomicBoolean closed=new AtomicBoolean();
    public TelemetryConsumer(DataSource source, FactSink sink, TransportDiagnostics diagnostics) {
        this.source = source; this.sink = sink; this.diagnostics = diagnostics;
    }
    public TelemetryConsumer(Properties properties,String topic,DataSource source,FactSink sink,TransportDiagnostics diagnostics) {
        this(source,sink,diagnostics);
        var p=new Properties();p.putAll(properties);p.remove("key.serializer");p.remove("value.serializer");
        p.setProperty("key.deserializer","org.apache.kafka.common.serialization.StringDeserializer");
        p.setProperty("value.deserializer","org.apache.kafka.common.serialization.StringDeserializer");
        p.setProperty("enable.auto.commit","false");p.setProperty("max.poll.records","1");
        p.setProperty("max.partition.fetch.bytes","1048576");p.setProperty("fetch.max.bytes","1048576");p.setProperty("auto.offset.reset","earliest");
        consumer=new KafkaConsumer<>(p);
        try{consumer.subscribe(List.of(topic));}catch(RuntimeException failure){consumer.close(Duration.ofSeconds(5));throw failure;}
    }
    public void run() {
        if(consumer==null)throw new IllegalStateException("No Kafka consumer configured");
        long backoff=250;
        try {
            while(!closed.get())try {
                for(var record:consumer.poll(Duration.ofMillis(500))) {
                    var partition=new TopicPartition(record.topic(),record.partition());IngressEnvelope envelope=null;
                    try{envelope=ReliableConsumer.decode(record.value(),record.key());}
                    catch(IllegalArgumentException invalid){diagnostics.record(TransportDiagnostics.Signal.DECODER_REJECTION);}
                    if(envelope!=null&&!accept(envelope)) {
                        consumer.seek(partition,record.offset());Thread.sleep(backoff);backoff=Math.min(5000,backoff*2);continue;
                    }
                    consumer.commitSync(Map.of(partition,new OffsetAndMetadata(record.offset()+1)));backoff=250;
                }
            }catch(org.apache.kafka.common.KafkaException transientFailure){if(closed.get())break;Thread.sleep(backoff);backoff=Math.min(5000,backoff*2);}
        }catch(WakeupException wake){if(!closed.get())throw wake;}
        catch(InterruptedException interrupted){Thread.currentThread().interrupt();}
        finally{boolean interrupted=Thread.interrupted();try{consumer.close(Duration.ofSeconds(5));}finally{if(interrupted)Thread.currentThread().interrupt();}}
    }
    public void close() {closed.set(true);if(consumer!=null)consumer.wakeup();}

    /** true means accepted, diagnosed or definitively inadmissible; false keeps Kafka offset for retry. */
    public boolean accept(IngressEnvelope envelope) {
        final WireMessage message;
        try {
            message = ReliableMessageStore.decode(envelope);
            if (envelope.lane() != IngressEnvelope.Lane.FAST) return true;
        } catch (RuntimeException invalid) {
            diagnostics.record(TransportDiagnostics.Signal.DECODER_REJECTION); return true;
        }
        try (var c = source.getConnection()) {
            c.setAutoCommit(false);
            try {
                ReliableMessageStore.lock(c, envelope.emsId().toString());
                Long period = admission(c, envelope);
                if (period == null) {
                    diagnostics.record(TransportDiagnostics.Signal.STALE_FENCE); c.rollback(); return true;
                }
                if (message.type().startsWith("cell_")) return acceptCells(c, period, envelope, message);
                final TelemetryBatch batch;
                try { batch = new TelemetryDecoder(catalog).decode(message, null); }
                catch (ProtocolException invalid) {
                    evidence(c, period, envelope, "invalid_profile", false); c.commit(); return true;
                }
                if(batch.configuration()!=null)ConfigurationStore.store(c,period,envelope,batch.configuration());
                var rows = new ArrayList<ObjectNode>(); boolean missing = false;
                String identity = ingressIdentity(envelope);
                var mappings=liveMappings(c,period,batch.cabinet(),envelope.receivedAt());
                for (var value : batch.observations()) {
                    var mapping = mappings.get(value.namespace()+":"+value.sourcePointId()+":"+role(value.namespace(),value.subsystem())+":"+wireType(catalog.find(value.namespace(),value.sourcePointId()).orElseThrow()));
                    if (mapping == null) { missing = true; continue; }
                    var row = observation(period, mapping, identity, message.type(), value.sourceTimestampMs(),
                            value.sourceTimestampMs() == null ? "unknown" : "source", envelope.receivedAt().toEpochMilli(), value.quality(), value.value());
                    rows.add(row);
                }
                if (missing) evidence(c, period, envelope, "missing_mapping", false);
                // The advisory/current-fence row lock covers admission and CH write, so period moves cannot race provenance.
                sink.observations(rows); c.commit(); return true;
            } catch (Exception failure) {
                if(failure instanceof SQLException sql)LOG.warn("Telemetry transaction failed with SQL state {}",sql.getSQLState());
                c.rollback(); diagnostics.record(TransportDiagnostics.Signal.DATABASE_FAILURE); return false;
            }
        } catch (SQLException failure) {
            diagnostics.record(TransportDiagnostics.Signal.DATABASE_FAILURE); return false;
        }
    }

    private Long admission(Connection c, IngressEnvelope e) throws SQLException {
        String sql = "SELECT b.id FROM connection_state s JOIN ems_binding_period b USING(ems_uuid) "
                + "WHERE s.ems_uuid=?::uuid AND s.fencing_token=? AND s.lease_until>clock_timestamp() "
                + "AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()) "
                + "AND ?>=b.valid_from AND (b.valid_to IS NULL OR ?<b.valid_to) FOR UPDATE OF s";
        try (var q = c.prepareStatement(sql)) {
            q.setQueryTimeout(5); q.setString(1,e.emsId().toString()); q.setBigDecimal(2,new BigDecimal(e.fencingToken()));
            q.setTimestamp(3,Timestamp.from(e.receivedAt())); q.setTimestamp(4,Timestamp.from(e.receivedAt()));
            try(var r=q.executeQuery()){return r.next()?r.getLong(1):null;}
        }
    }

    static String ingressIdentity(IngressEnvelope e) {
        return TypedFact.id("ingress", e.emsId().toString(), e.ingressEpoch().toString(), e.sequence().toString(),
                e.receivedAt().toString(), e.canonicalHash());
    }

    static Long point(Connection c,long period,Integer cabinet,String namespace,int sourceId,String subsystem,
                      Instant at,PointCatalog catalog) throws SQLException {
        var definition=catalog.find(namespace,sourceId).orElse(null);
        if(definition==null || definition.wireType()==PointCatalog.WireType.UNKNOWN || !Objects.equals(subsystem,definition.subsystem()))return null;
        String role = role(namespace,subsystem);
        String type=wireType(definition);
        String sql="SELECT pb.measurement_point_id FROM point_binding pb JOIN device_binding db ON db.id=pb.device_binding_id "
                +"JOIN point_definition pd ON pd.id=pb.definition_id WHERE db.binding_period_id=? AND db.scope=? "
                +"AND db.cabinet_no IS NOT DISTINCT FROM ?::smallint AND db.role=? AND pd.catalog_version=? "
                +"AND pd.namespace=? AND pd.source_id=? AND pd.value_type=? AND ?>=db.valid_from "
                +"AND (db.valid_to IS NULL OR ?<db.valid_to) AND ?>=pb.valid_from AND (pb.valid_to IS NULL OR ?<pb.valid_to)";
        try(var q=c.prepareStatement(sql)) {
            q.setQueryTimeout(5);q.setLong(1,period);q.setString(2,namespace.equals("ems")?"ems":"cabinet");
            if(cabinet==null)q.setNull(3,Types.SMALLINT);else q.setInt(3,cabinet);
            q.setString(4,role);q.setString(5,catalog.version());q.setString(6,namespace);q.setInt(7,sourceId);q.setString(8,type);
            for(int i=9;i<=12;i++)q.setTimestamp(i,Timestamp.from(at));
            try(var r=q.executeQuery()){if(!r.next())return null;long result=r.getLong(1);return r.next()?null:result;}
        }
    }

    private Map<String,Long> liveMappings(Connection c,long period,Integer cabinet,Instant at)throws SQLException {
        var mappings=new HashMap<String,Long>();
        String sql="SELECT pd.namespace,pd.source_id,db.role,pd.value_type,pb.measurement_point_id FROM point_binding pb "
                +"JOIN device_binding db ON db.id=pb.device_binding_id JOIN point_definition pd ON pd.id=pb.definition_id "
                +"WHERE db.binding_period_id=? AND db.scope=? AND db.cabinet_no IS NOT DISTINCT FROM ?::smallint "
                +"AND pd.catalog_version=? AND ?>=db.valid_from AND (db.valid_to IS NULL OR ?<db.valid_to) "
                +"AND ?>=pb.valid_from AND (pb.valid_to IS NULL OR ?<pb.valid_to)";
        try(var q=c.prepareStatement(sql)) {
            q.setQueryTimeout(5);q.setLong(1,period);q.setString(2,cabinet==null?"ems":"cabinet");
            if(cabinet==null)q.setNull(3,Types.SMALLINT);else q.setInt(3,cabinet);q.setString(4,catalog.version());
            for(int i=5;i<=8;i++)q.setTimestamp(i,Timestamp.from(at));
            try(var r=q.executeQuery()){while(r.next()) {
                String key=r.getString(1)+":"+r.getBigDecimal(2).toBigIntegerExact()+":"+r.getString(3)+":"+r.getString(4);
                if(mappings.containsKey(key))mappings.put(key,null);else mappings.put(key,r.getLong(5));
            }}
        }
        return mappings;
    }
    private static String role(String namespace,String subsystem){return namespace.equals("ems")?"ems":switch(subsystem){case "pvdc"->"dcdc";case "grid"->"meter";default->subsystem;};}
    private static String wireType(PointCatalog.Definition definition){return switch(definition.wireType()){case NUMBER->"number";case TEXT->"text";case U16_WORDS->"u16_words";default->"unknown";};}

    static ObjectNode observation(long period,long point,String sourceIdentity,String sourceType,Long at,String timeKind,
                                  long received,String quality,com.fasterxml.jackson.databind.JsonNode value) {
        var row=TypedFact.value(value);
        row.put("fact_id",TypedFact.id("point",Long.toString(period),Long.toString(point),sourceIdentity,timeKind,String.valueOf(at)));
        row.put("binding_period_id",period);row.put("point_id",point);row.put("source_message_id",sourceIdentity);
        row.put("source_type",sourceType);row.put("source_time_kind",timeKind);
        if(at==null)row.putNull("source_at_ms");else row.put("source_at_ms",at);
        row.put("received_at_ms",received);row.put("quality",quality);return row;
    }

    private void evidence(Connection c,long period,IngressEnvelope e,String reason,boolean refresh) throws Exception {
        byte[] raw=new ObjectMapper().writeValueAsBytes(new IngestionWorker.EnvelopeJson(e));
        if(raw.length>262144)throw new IllegalArgumentException("Diagnostic envelope exceeds storage bound");
        try(var q=c.prepareStatement("INSERT INTO telemetry_diagnostic_evidence(fact_id,binding_period_id,reason,received_at,raw_envelope) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING")) {
            q.setString(1,ingressIdentity(e));q.setLong(2,period);q.setString(3,reason);q.setTimestamp(4,Timestamp.from(e.receivedAt()));q.setBytes(5,raw);q.executeUpdate();
        }
        try(var q=c.prepareStatement("DELETE FROM telemetry_diagnostic_evidence WHERE fact_id IN (SELECT x.fact_id FROM telemetry_diagnostic_evidence x JOIN ems_binding_period b ON b.id=x.binding_period_id WHERE b.ems_uuid=?::uuid ORDER BY x.received_at DESC,x.fact_id DESC OFFSET 32)")) {
            q.setString(1,e.emsId().toString());int removed=q.executeUpdate();for(int i=0;i<removed;i++)diagnostics.record(TransportDiagnostics.Signal.QUEUE_OVERFLOW);
        }
        if(refresh)try(var q=c.prepareStatement("INSERT INTO structure_refresh_demand(binding_period_id,pending) VALUES(?,true) ON CONFLICT(binding_period_id) DO UPDATE SET pending=true")) {q.setLong(1,period);q.executeUpdate();}
        diagnostics.record(TransportDiagnostics.Signal.DECODER_REJECTION);
    }

    private boolean acceptCells(Connection c,long period,IngressEnvelope e,WireMessage message)throws Exception {
        StructureLayout layout=null;long revision=0;
        String sql="SELECT sr.id,sr.sv,sr.layout::text,sc.metadata::text,sc.connection_id,sc.seq FROM structure_current sc "
                +"JOIN structure_revision sr ON sr.id=sc.revision_id JOIN connection_state s ON s.ems_uuid=sc.ems_uuid "
                +"WHERE sc.ems_uuid=?::uuid AND sc.binding_period_id=? AND sc.connection_id=s.connection_id "
                +"AND sr.sv=? AND sc.received_at<=? AND s.ingress_generation=?::uuid AND s.last_fresh_heartbeat>clock_timestamp()-interval '90 seconds' AND EXISTS(SELECT 1 FROM structure_acceptance a WHERE a.binding_period_id=sc.binding_period_id AND a.revision_id=sr.id)";
        try(var q=c.prepareStatement(sql)) {
            q.setQueryTimeout(5);q.setString(1,e.emsId().toString());q.setLong(2,period);q.setBigDecimal(3,message.body().path("sv").decimalValue());
            q.setTimestamp(4,Timestamp.from(e.receivedAt()));
            q.setString(5,e.ingressEpoch().toString());
            try(var r=q.executeQuery()) {if(r.next()) {
                revision=r.getLong(1);var json=new ObjectMapper();var immutable=json.readTree(r.getString(3));var metadata=json.readTree(r.getString(4));
                var bms=immutable.path("clusterLayout").path("bms");var cabinets=new HashMap<Integer,StructureLayout.Cabinet>();
                var known=new HashSet<Integer>();for(var cabinet:immutable.path("clusters"))known.add(cabinet.path("c").intValue());
                for(var cabinet:metadata.path("clusters"))if(known.contains(cabinet.path("c").intValue()))
                    cabinets.put(cabinet.path("c").intValue(),new StructureLayout.Cabinet(cabinet.path("state").asText(),cabinet.path("cellReady").asBoolean()));
                // Current metadata must describe the same layout dimensions; readiness never comes from a stale revision.
                var currentBms=metadata.path("clusterLayout").path("bms");
                if(bms.equals(currentBms))layout=new StructureLayout(e.emsId(),r.getBigDecimal(2).toBigIntegerExact(),UUID.fromString(r.getString(5)),
                        r.getBigDecimal(6).toBigIntegerExact(),nullableInt(bms,"bmuType"),nullableInt(bms,"bmuCount"),nullableInt(bms,"voltCount"),nullableInt(bms,"tempCount"),cabinets);
            }}
        }
        final CellFrame frame;
        try {frame=new TelemetryDecoder(catalog).decode(message,layout).cells();}
        catch(ProtocolException invalid){evidence(c,period,e,"unknown_layout",true);c.commit();return true;}
        var row=TypedFact.cells(frame.values());String identity=ingressIdentity(e);
        row.put("fact_id",TypedFact.id("cell",Long.toString(period),Integer.toString(frame.cabinet()),Long.toString(revision),frame.kind(),identity));
        row.put("binding_period_id",period);row.put("cabinet_no",frame.cabinet());row.put("structure_revision_id",revision);row.put("cell_kind",frame.kind());
        row.put("source_message_id",identity);row.put("source_time_kind",frame.sourceTimestampMs()==null?"unknown":"source");
        if(frame.sourceTimestampMs()==null)row.putNull("source_at_ms");else row.put("source_at_ms",frame.sourceTimestampMs());
        row.put("received_at_ms",e.receivedAt().toEpochMilli());row.put("quality",frame.quality());
        sink.cells(List.of(row));c.commit();return true;
    }
    private static Integer nullableInt(com.fasterxml.jackson.databind.JsonNode n,String field){return n.path(field).isNull()||n.path(field).isMissingNode()?null:n.path(field).intValue();}
}
