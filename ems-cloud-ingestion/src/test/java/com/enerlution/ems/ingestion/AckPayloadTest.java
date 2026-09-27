package com.enerlution.ems.ingestion;
import com.enerlution.ems.protocol.WireDecoder;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;
class AckPayloadTest {
 @Test void exactHistoryAckAndRejectedAckHaveNoInventedStatusFields() {
  String raw="{\"v\":1,\"type\":\"important_history\",\"taskId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"c\":1,\"part\":123456789012345678901234567890,\"parts\":123456789012345678901234567890,\"ts\":1,\"p\":[1],\"data\":[[0,0,1]]}";
  var wire=new WireDecoder().decode("ems/v1/755facdc-9bdf-43d0-9412-c94f860a01ec/up/important",raw.getBytes(StandardCharsets.UTF_8));
  assertEquals("{\"v\":1,\"type\":\"important_history\",\"taskId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"part\":123456789012345678901234567890}",new String(AckOutbox.payload(wire,null),StandardCharsets.UTF_8));
  assertEquals("{\"v\":1,\"type\":\"important_history\",\"taskId\":\"47d99f91-74e4-4738-aaab-17fc1550978c\",\"part\":123456789012345678901234567890,\"error\":\"rejected\"}",new String(AckOutbox.payload(wire,"rejected"),StandardCharsets.UTF_8));
 }
}
