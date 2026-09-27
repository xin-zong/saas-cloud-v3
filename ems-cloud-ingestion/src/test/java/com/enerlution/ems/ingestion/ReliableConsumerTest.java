package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.enerlution.ems.protocol.WireDecoder;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.math.BigInteger;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class ReliableConsumerTest {
 @Test void kafkaWrapperMustNotHideTrailingDocumentsOrForgeWireHash()throws Exception {
  var e=fixture();var json=new ObjectMapper().writeValueAsString(new IngestionWorker.EnvelopeJson(e));
  assertEquals(e,ReliableConsumer.decode(json,e.emsId().toString()));
  assertThrows(IllegalArgumentException.class,()->ReliableConsumer.decode(json+" {}",e.emsId().toString()));
  assertThrows(IllegalArgumentException.class,()->ReliableConsumer.decode(json.replace(e.canonicalHash(),"0".repeat(64)),e.emsId().toString()));
  assertThrows(IllegalArgumentException.class,()->ReliableConsumer.decode(json,UUID.randomUUID().toString()));
 }
 static IngressEnvelope fixture(){var ems=UUID.fromString("755facdc-9bdf-43d0-9412-c94f860a01ec");String raw="{\"v\":1,\"type\":\"important_history\",\"taskId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"c\":1,\"part\":1,\"parts\":1,\"ts\":1789353000000,\"p\":[20062],\"data\":[[0,0,[65535,0,12,42]]]}";String topic="ems/v1/"+ems+"/up/important";var w=new WireDecoder().decode(topic,raw.getBytes(StandardCharsets.UTF_8));return new IngressEnvelope(ems,w.channel(),w.type(),w.canonicalHash(),raw,topic,Instant.now(),UUID.randomUUID(),BigInteger.ONE,BigInteger.TEN);}
}
