package com.enerlution.ems.ingestion;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.nio.file.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.TopicPartition;
import com.fasterxml.jackson.databind.node.ObjectNode;
import static org.junit.jupiter.api.Assertions.*;

/** Server Java21 check; credentials arrive only through managed environment, never printed. */
public final class TypedFactsLiveCheck {
    public static void main(String[] args)throws Exception {
        if(!"ems_ingestion_tests".equals(System.getenv("EMS_TEST_SCHEMA")))throw new IllegalStateException("Isolated test schema required");
        String observation=required("EMS_TEST_CH_OBSERVATION_TABLE"),cell=required("EMS_TEST_CH_CELL_TABLE");
        if(!observation.equals("ems_cloud_v2_proto_telemetry.task6_observation")||!cell.equals("ems_cloud_v2_proto_telemetry.task6_cell"))
            throw new IllegalArgumentException("Only isolated Task6 ClickHouse tables allowed");
        var writer=new ClickHouseWriter(URI.create(required("EMS_TEST_CH_URL")),required("EMS_TEST_CH_USER"),required("EMS_TEST_CH_PASSWORD"),
                observation,cell,2,1048576,Duration.ofSeconds(5));
        var f=new TelemetryProjectionPostgresTest();f.setup();
        try {
            assertEquals(ReliableMessageStore.Outcome.SAVED,new ReliableMessageStore(f.source).accept(f.history("[[1,0,[65535,0,12,42]],[2,0,null]]")));
            var failing=new TelemetryConsumer.FactSink() {
                public void observations(List<ObjectNode> rows)throws Exception{throw new java.io.IOException("injected isolated CH failure");}
                public void cells(List<ObjectNode> rows)throws Exception{throw new java.io.IOException("injected isolated CH failure");}
            };
            assertTrue(new ReliableProjection(f.source,failing).projectNext());
            assertEquals(1,f.count("reliable_message","status='projection_failed'"));
            assertEquals(1,f.count("outbox","true"));
            assertTrue(new ReliableProjection(f.source,writer).projectNext());
            assertEquals(1,f.count("reliable_message","status='projected'"));
            assertEquals("2",query("SELECT count() FROM "+observation+" FINAL WHERE binding_period_id="+f.period));
            assertEquals("[65535,0,12,42]",query("SELECT toJSONString(u16_words) FROM "+observation+" FINAL WHERE binding_period_id="+f.period+" AND value_kind='u16_words'"));
            assertEquals("1",query("SELECT count() FROM "+observation+" FINAL WHERE binding_period_id="+f.period+" AND value_kind='null' AND isNull(number_exact) AND isNull(text_value)"));
            assertEquals("0",query("SELECT count() FROM "+observation+" FINAL WHERE binding_period_id="+f.period+" AND source_type IN ('ems','cabinet_30s','cabinet_60s')"),"Reliable archive cannot become live latest data");
            try(var c=f.source.getConnection();var s=c.createStatement()){s.executeUpdate("UPDATE reliable_message SET status='saved' WHERE ems_uuid='"+f.ems+"'");}
            assertTrue(new ReliableProjection(f.source,writer).projectNext());
            assertEquals("2",query("SELECT count() FROM "+observation+" FINAL WHERE binding_period_id="+f.period));
        }finally{f.removeOnlyThisTestsMutableObjects();}
        var cells=new TelemetryProjectionPostgresTest();cells.setup();
        try {
            cells.cellsNeedCurrentMatchingReadyLayoutAndPreserveNullPositions();
            writer.cells(cells.written);
            assertEquals("1",query("SELECT count() FROM "+cell+" FINAL WHERE binding_period_id="+cells.period));
            assertEquals("[[null,\"3.2\"]]",query("SELECT toJSONString(cell_values) FROM "+cell+" FINAL WHERE binding_period_id="+cells.period));
        }finally{cells.removeOnlyThisTestsMutableObjects();}
        fastKafka(writer,observation);
        System.out.println("PASS actual PG/Kafka/CH: reliable failure retains saved object/ACK, recovery projects exact bitmap/null, replay FINAL deduplicates, accepted current layout preserves nullable cells, FAST offset waits for CH success and recovers");
    }
    private static void fastKafka(ClickHouseWriter writer,String observation)throws Exception {
        String topic=required("EMS_TEST_KAFKA_FAST_TOPIC"),group=required("EMS_TEST_KAFKA_GROUP");
        if(!topic.equals("ems-cloud-v3.test.task6-20260928.fast.v1")||!group.equals("ems-cloud-v3.ingestion.task6-20260928.live"))
            throw new IllegalArgumentException("Dedicated Task6 Kafka resources required");
        var p=new Properties();try(var in=Files.newInputStream(Path.of(required("EMS_TEST_KAFKA_CONFIG")))){p.load(in);}
        var producerProperties=new Properties();producerProperties.putAll(p);
        producerProperties.setProperty("key.serializer","org.apache.kafka.common.serialization.StringSerializer");
        producerProperties.setProperty("value.serializer","org.apache.kafka.common.serialization.StringSerializer");
        producerProperties.setProperty("acks","all");producerProperties.setProperty("enable.idempotence","true");
        producerProperties.setProperty("delivery.timeout.ms","10000");producerProperties.setProperty("request.timeout.ms","5000");
        p.setProperty("group.id",group);
        var fixture=new TelemetryProjectionPostgresTest();fixture.setup();
        var failed=new AtomicBoolean(true);var attempted=new CountDownLatch(1);
        var boundary=new TelemetryConsumer.FactSink() {
            public void observations(List<ObjectNode> rows)throws Exception {
                if(failed.get()){attempted.countDown();throw new java.io.IOException("injected FAST CH failure");}writer.observations(rows);
            }
            public void cells(List<ObjectNode> rows)throws Exception{writer.cells(rows);}
        };
        Thread runner=null;
        try(var admin=AdminClient.create(p);var producer=new KafkaProducer<String,String>(producerProperties);
            var consumer=new TelemetryConsumer(p,topic,fixture.source,boundary,new TransportDiagnostics())) {
            var envelope=fixture.ordinary(999);
            String json=new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(new IngestionWorker.EnvelopeJson(envelope));
            var metadata=producer.send(new ProducerRecord<>(topic,0,envelope.emsId().toString(),json)).get(15,TimeUnit.SECONDS);
            var partition=new TopicPartition(topic,0);
            runner=new Thread(consumer,"task6-fast-consumer");runner.start();
            assertTrue(attempted.await(20,TimeUnit.SECONDS),"FAST record reaches CH boundary");
            Thread.sleep(600);
            var offsets=admin.listConsumerGroupOffsets(group).partitionsToOffsetAndMetadata().get(10,TimeUnit.SECONDS);
            var committed=offsets.get(partition);
            assertTrue(committed==null||committed.offset()<=metadata.offset(),"No commit before CH success");
            failed.set(false);
            long deadline=System.nanoTime()+Duration.ofSeconds(25).toNanos();boolean advanced=false;
            while(System.nanoTime()<deadline) {
                var now=admin.listConsumerGroupOffsets(group).partitionsToOffsetAndMetadata().get(10,TimeUnit.SECONDS).get(partition);
                if(now!=null&&now.offset()>metadata.offset()){advanced=true;break;}Thread.sleep(100);
            }
            assertTrue(advanced,"Recovered CH write advances FAST Kafka offset");
            assertEquals("1",query("SELECT count() FROM "+observation+" FINAL WHERE binding_period_id="+fixture.period+" AND source_type='cabinet_30s'"));
            consumer.close();runner.join(10000);assertFalse(runner.isAlive(),"FAST resource shutdown completes");
        }finally {
            if(runner!=null&&runner.isAlive()){runner.interrupt();runner.join(10000);}
            fixture.removeOnlyThisTestsMutableObjects();
        }
    }
    private static String required(String key){String value=System.getenv(key);if(value==null||value.isBlank())throw new IllegalArgumentException("Missing test environment "+key);return value;}
    private static String query(String sql)throws Exception {
        URI uri=URI.create(required("EMS_TEST_CH_URL").replaceAll("/$","")+"/?query="+URLEncoder.encode(sql+" FORMAT TabSeparated",StandardCharsets.UTF_8));
        var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).header("X-ClickHouse-User",required("EMS_TEST_CH_USER"))
                .header("X-ClickHouse-Key",required("EMS_TEST_CH_PASSWORD")).GET().build();
        var result=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build().send(request,HttpResponse.BodyHandlers.ofString());
        assertEquals(200,result.statusCode(),"Isolated ClickHouse query failed");return result.body().strip();
    }
}
