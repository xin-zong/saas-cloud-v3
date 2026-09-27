package com.enerlution.ems.protocol;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
class WireDecoderTest {
  static final String ID="8b2a0c73-6d91-4eb5-9a20-f4c18e763d02", CONNECTION="746bc054-9758-41cf-8ae2-cd788b286713";
  static final String HEART="{\"v\":1,\"emsId\":\""+ID+"\",\"connectionId\":\""+CONNECTION+"\",\"uptimeSeconds\":120}";
  WireMessage decode(String channel,String json) {
    return new WireDecoder().decode("ems/v1/"+ID+"/up/"+channel,json.getBytes(StandardCharsets.UTF_8));
  }
  void reject(String channel,String json) {
    var e=assertThrows(ProtocolException.class,()->decode(channel,json));
    assertFalse(e.getMessage().contains(json));
  }
  @Test void decoderPublicInterfaceExists() {
    assertDoesNotThrow(() -> Class.forName("com.enerlution.ems.protocol.WireDecoder")
        .getMethod("decode", String.class, byte[].class));
  }
  @Test void sourceFixturesAreIndividuallyAccepted() throws Exception {
    var dir=Path.of("src/test/resources/wire");
    try(var files=Files.list(dir)) {for(var path:files.toList()) {
      String json=Files.readString(path); String type=new ObjectMapper().readTree(json).path("type").asText();
      String ch=type.equals("important_history")?"important":type.startsWith("alarm_")?"alarm":"telemetry";
      assertNotNull(decode(ch,json),path.toString());
    }}
    assertNotNull(decode("heartbeat",HEART));
    assertNotNull(decode("status","{\"v\":1,\"emsId\":\""+ID+"\",\"state\":\"connected\"}"));
    assertNotNull(decode("alarm",current()));
  }
  static String current(){return "{\"v\":1,\"type\":\"alarm_current\",\"connectionId\":\""+CONNECTION+"\",\"c\":3,\"seq\":1,\"alarms\":null}";}
  @Test void strictJsonAndIdentityFailuresAreSafe() {
    reject("heartbeat",HEART.replace("\"v\":1","\"v\":1,\"v\":1"));
    reject("heartbeat",HEART+" {}"); reject("heartbeat",HEART.replace("\"v\":1","\"v\":2"));
    reject("heartbeat",HEART.replace(ID,CONNECTION)); reject("heartbeat",HEART.replace(CONNECTION,CONNECTION.toUpperCase()));
    reject("heartbeat",HEART.replace("120","1.0")); reject("heartbeat",HEART.replace("120","18446744073709551616"));
    reject("heartbeat",HEART.replace("\"uptimeSeconds\":120","\"uptimeSeconds\":-1"));
    reject("heartbeat",HEART.replace("\"connectionId\":\""+CONNECTION+"\",",""));
    reject("heartbeat",HEART.replace("\"v\":1","\"v\":1,\"type\":\"ems\""));
    reject("request",HEART); reject("status","[]"); reject("status","{\"v\":1,\"state\":\"unknown\"}");
  }
  @Test void alarmFieldsAndHistoryIndexesAreChecked() throws Exception {
    String event=Files.readString(Path.of("src/test/resources/wire/05_故障事件完整报文参考.json"));
    reject("telemetry",event); reject("alarm",event.replace("\"active\"","\"invalid\""));
    reject("alarm",event.replace("\"020101\"","\"abcdef\""));
    reject("alarm",event.replace("\"id\": null","\"id\": 0"));
    reject("alarm",current().replace("\"c\":3","\"c\":31"));
    reject("alarm",current().replace("\"seq\":1","\"seq\":0"));
    String h="{\"v\":1,\"type\":\"important_history\",\"taskId\":\""+CONNECTION+"\",\"c\":1,\"part\":1,\"parts\":1,\"ts\":1,\"p\":[1],\"data\":[[0,0,null]]}";
    assertNotNull(decode("important",h));
    reject("important",h.replace("[0,0,null]","[0,1,null]"));
    reject("important",h.replace("\"part\":1","\"part\":2"));
    reject("important",h.replace("\"p\":[1]","\"p\":[1,1]"));
  }
  @Test void responseSuccessAndFailureHaveExclusiveShapes() throws Exception {
    String prefix="{\"v\":1,\"emsId\":\""+ID+"\",\"id\":\"r001\",";
    assertNotNull(decode("response",prefix+"\"ok\":true,\"data\":"+current()+"}"));
    assertNotNull(decode("response",prefix+"\"ok\":false,\"error\":{\"code\":\"DATA_UNAVAILABLE\",\"message\":\"Unavailable\"}}"));
    reject("response",prefix+"\"ok\":true}");
    reject("response",prefix+"\"ok\":false,\"error\":{\"code\":1,\"message\":null}}");
    reject("response",prefix+"\"ok\":true,\"data\":{},\"error\":{}}");
  }
  @Test void canonicalHashPreservesExactNumbersAndOrdersKeys() throws Exception {
    String a=HEART.substring(0,HEART.length()-1)+",\"extension\":{\"x\":123456789012345678901234567890,\"y\":0.123456789012345678901234567890,\"z\":[null,1,2]}}";
    String b=a.replace("\"x\":123456789012345678901234567890,","\"x\":123456789012345678901234567890.0,").replace("0.123456789012345678901234567890","1.23456789012345678901234567890e-1");
    var first=decode("heartbeat",a); var second=decode("heartbeat",b);
    assertEquals(first.canonicalHash(),second.canonicalHash());
    assertNotEquals(first.canonicalHash(),decode("heartbeat",a.replace("[null,1,2]","[null,2,1]")).canonicalHash());
    JsonNode body=first.body();
    assertEquals("0.123456789012345678901234567890",body.path("extension").path("y").decimalValue().toPlainString());
    // Reordering is tested without reparsing the exact decimal through a double mapper.
    String r="{\"extension\":"+a.substring(a.indexOf("{\"x\""),a.length()-1)+",\"uptimeSeconds\":120,\"connectionId\":\""+CONNECTION+"\",\"emsId\":\""+ID+"\",\"v\":1}";
    assertEquals(first.canonicalHash(),decode("heartbeat",r).canonicalHash());
  }
  @Test void limitsAreAppliedByChannelAndType() throws Exception {
    String pad="x".repeat(7000);
    reject("heartbeat",HEART.substring(0,HEART.length()-1)+",\"extra\":\""+pad+"\"}");
    String error="{\"v\":1,\"emsId\":\""+ID+"\",\"id\":\"r\",\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\""+pad+"\"}}";
    assertNotNull(decode("response",error)); reject("response",error.replace(pad,"x".repeat(65536)));
  }
  @Test void everyRequiredRootFieldIsCheckedWithoutLeakingParserExceptions() throws Exception {
    var mapping=Map.of(
      "05_EMS完整报文参考.json",List.of("v","type","d"),
      "05_机柜30秒完整报文参考.json",List.of("v","type","c","d"),
      "05_机柜60秒完整报文参考.json",List.of("v","type","c","d"),
      "05_单体电压完整报文参考.json",List.of("v","type","c","sv","d"),
      "05_单体温度完整报文参考.json",List.of("v","type","c","sv","d"),
      "05_设备结构完整报文参考.json",List.of("v","type","connectionId","seq","sv","d"),
      "05_故障事件完整报文参考.json",List.of("v","type","sv","alarmId","seq","device","code","level","state","ts"),
      "05_故障关联数据完整报文参考.json",List.of("v","type","sv","alarmId","start","step","points","data"),
      "05_重要数据补传完整报文参考.json",List.of("v","type","taskId","c","part","parts","ts","p","data"));
    for(var entry:mapping.entrySet()) {
      ObjectNode original=(ObjectNode)new ObjectMapper().readTree(Files.readString(Path.of("src/test/resources/wire",entry.getKey())));
      String type=original.path("type").asText(); String channel=type.startsWith("alarm_")?"alarm":type.equals("important_history")?"important":"telemetry";
      for(String field:entry.getValue()) {
        var absent=original.deepCopy(); absent.remove(field); reject(channel,absent.toString());
        var wrong=original.deepCopy(); wrong.put(field,true); reject(channel,wrong.toString());
      }
    }
  }
  @Test void nestedShapesAreChecked() throws Exception {
    reject("alarm",current().replace("null","{}"));
    String cell="{\"v\":1,\"type\":\"cell_voltage\",\"c\":1,\"sv\":1,\"d\":{\"ts\":null,\"q\":\"invalid\",\"values\":null}}";
    assertNotNull(decode("telemetry",cell));
    reject("telemetry",cell.replace("\"values\":null","\"values\":[]"));
    reject("telemetry",cell.replace("\"values\":null","\"values\":[[\"3.2\"]]"));
    reject("telemetry",cell.replace("\"q\":\"invalid\"","\"q\":null"));
    String structure=Files.readString(Path.of("src/test/resources/wire/05_设备结构完整报文参考.json"));
    var node=(ObjectNode)new ObjectMapper().readTree(structure);
    ((ObjectNode)node.path("d").path("ems")).put("sn","a".repeat(65)); reject("telemetry",node.toString());
    node=(ObjectNode)new ObjectMapper().readTree(structure);
    ((ObjectNode)node.path("d").path("clusterLayout").path("vendors")).put("bmu","Vendor"); reject("telemetry",node.toString());
    String alarmData=Files.readString(Path.of("src/test/resources/wire/05_故障关联数据完整报文参考.json"));
    node=(ObjectNode)new ObjectMapper().readTree(alarmData); node.put("step",999); reject("alarm",node.toString());
    node=(ObjectNode)new ObjectMapper().readTree(alarmData); node.set("data",new ObjectMapper().readTree("[[1]]")); reject("alarm",node.toString());
  }
  @Test void exactByteBoundariesAndAllLargeCategories() throws Exception {
    String structure=Files.readString(Path.of("src/test/resources/wire/05_设备结构完整报文参考.json"));
    String data=Files.readString(Path.of("src/test/resources/wire/05_故障关联数据完整报文参考.json"));
    assertNotNull(decode("telemetry",padded(structure,65536))); reject("telemetry",padded(structure,65537));
    assertNotNull(decode("alarm",padded(data,131072))); reject("alarm",padded(data,131073));
    assertNotNull(decode("heartbeat",padded(HEART,6144))); reject("heartbeat",padded(HEART,6145));
    String success="{\"v\":1,\"emsId\":\""+ID+"\",\"id\":\"r\",\"ok\":true,\"data\":"+structure+"}";
    assertNotNull(decode("response",padded(success,65536))); reject("response",padded(success,65537));
    String alarms="{\"v\":1,\"emsId\":\""+ID+"\",\"id\":\"r\",\"ok\":true,\"data\":"+current()+"}";
    assertNotNull(decode("response",padded(alarms,6144))); reject("response",padded(alarms,6145));
  }
  static String padded(String json,int bytes) {
    String compact;
    try { compact=new ObjectMapper().readTree(json).toString(); } catch(Exception e){throw new AssertionError(e);}
    String empty=compact.substring(0,compact.length()-1)+",\"extra\":\"\"}";
    return empty.substring(0,empty.length()-2)+"x".repeat(bytes-empty.getBytes(StandardCharsets.UTF_8).length)+"\"}";
  }
  @Test void invalidTopicsUtf8AndParserResourceLimitsAreSafe() {
    var decoder=new WireDecoder(); byte[] valid=HEART.getBytes(StandardCharsets.UTF_8);
    for(String topic:List.of("ems/v1/"+ID+"/down/ack","ems/v1/"+ID.toUpperCase()+"/up/heartbeat","ems/v1/"+ID.replace("4eb5","3eb5")+"/up/heartbeat","ems/v1/"+ID+"/up/heartbeat/","ems/v1/+/up/heartbeat"))
      assertThrows(ProtocolException.class,()->decoder.decode(topic,valid));
    assertThrows(ProtocolException.class,()->decoder.decode(null,valid));
    assertThrows(ProtocolException.class,()->decoder.decode("ems/v1/"+ID+"/up/heartbeat",null));
    assertThrows(ProtocolException.class,()->decoder.decode("ems/v1/"+ID+"/up/heartbeat",new byte[]{(byte)0xc3,(byte)0x28}));
    reject("heartbeat",HEART.substring(0,HEART.length()-1)+",\"extra\":"+"[".repeat(65)+"0"+"]".repeat(65)+"}");
    reject("heartbeat",HEART.substring(0,HEART.length()-1)+",\"extra\":"+"9".repeat(1025)+"}");
    assertEquals(decode("heartbeat",HEART.replace("120","0")).canonicalHash(),decode("heartbeat",HEART.replace("120","-0")).canonicalHash());
  }
  @Test void escapedLoneSurrogatesAreRejectedWithoutLosingValidUnicode() {
    String prefix=HEART.substring(0,HEART.length()-1);
    reject("heartbeat",prefix+",\"extra\":\"\\uD800\"}");
    reject("heartbeat",prefix+",\"extra\":\"\\uDC00\"}");
    reject("heartbeat",prefix+",\"\\uD800\":1}");
    assertEquals(decode("heartbeat",prefix+",\"extra\":\"\\uD83D\\uDE00\"}").canonicalHash(),
        decode("heartbeat",prefix+",\"extra\":\"😀\"}").canonicalHash());
    assertNotEquals(decode("heartbeat",prefix+",\"extra\":\"😀\"}").canonicalHash(),
        decode("heartbeat",prefix+",\"extra\":\"?\"}").canonicalHash());
  }
}
