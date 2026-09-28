package com.enerlution.ems.protocol;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.math.*;
import java.util.*;
class TelemetryDecoderTest {
 @Test void negativeLinkTimeIsDefinitivelyInvalidWithoutChangingOtherTimestampRules()throws Exception {
  var negative=fixture("机柜30秒");block(negative,"link").put("ts",-1);
  assertThrows(ProtocolException.class,()->decode(negative));
  var unknown=fixture("机柜30秒");block(unknown,"link").putNull("ts");
  assertNull(decode(unknown).link().sourceTimestampMs());
  var zero=fixture("机柜30秒");block(zero,"link").put("ts",0);
  block(zero,"bms").put("ts",-1);
  assertEquals(0L,decode(zero).link().sourceTimestampMs());
  assertTrue(decode(zero).observations().stream().filter(p->p.subsystem().equals("bms")).allMatch(p->p.sourceTimestampMs()==-1L));
 }
 @Test void cabinetLinkPreservesBooleanNullAndOriginalTimestamp()throws Exception {
  var accessor=assertDoesNotThrow(()->TelemetryBatch.class.getMethod("link"));
  for(Boolean online:Arrays.asList(true,false,null)) {
   var n=fixture("机柜30秒");var link=block(n,"link");link.put("ts",1789353000123L);
   if(online==null)link.putNull("online");else link.put("online",online);
   var decoded=accessor.invoke(decode(n));assertNotNull(decoded);
   assertEquals(online,decoded.getClass().getMethod("online").invoke(decoded));
   assertEquals(1789353000123L,decoded.getClass().getMethod("sourceTimestampMs").invoke(decoded));
  }
  assertNull(accessor.invoke(decode(fixture("机柜60秒"))));
 }
 @Test void configurationRetainsExactExtensionIdBeyondIntegerRange()throws Exception {
  var n=fixture("EMS");
  ((ArrayNode)n.path("d").path("cfg").path("p")).addArray().add(new BigInteger("999999999999999999999")).add("wide extension");
  var batch=assertDoesNotThrow(()->decode(n));
  assertEquals("wide extension",batch.configuration().allValues().get(new BigInteger("999999999999999999999")).textValue());
 }
 static final String ID="8b2a0c73-6d91-4eb5-9a20-f4c18e763d02";
 final PointCatalog catalog=PointCatalog.loadDefault();
 final TelemetryDecoder decoder=new TelemetryDecoder(catalog);
 ObjectNode fixture(String name) throws Exception {return (ObjectNode)new ObjectMapper().readTree(Files.readString(Path.of("src/test/resources/wire/05_"+name+"完整报文参考.json")));}
 WireMessage wire(ObjectNode n){return new WireDecoder().decode("ems/v1/"+ID+"/up/telemetry",n.toString().getBytes(StandardCharsets.UTF_8));}
 TelemetryBatch decode(ObjectNode n){return decoder.decode(wire(n),null);}
 ObjectNode block(ObjectNode n,String name){return (ObjectNode)n.path("d").path(name);}
 ArrayNode point(ObjectNode n,String name,int id){for(var p:block(n,name).path("p"))if(p.get(0).intValue()==id)return (ArrayNode)p;throw new AssertionError("Missing test point "+id);}
 StructureLayout matched() throws Exception {
  var n=(ObjectNode)new ObjectMapper().readTree(Files.readString(Path.of("src/test/resources/telemetry/structure-matched-synthetic.json")));
  return StructureLayout.fromMessage(wire(n));
 }
 void rejects(ObjectNode n,StructureLayout layout){var e=assertThrows(ProtocolException.class,()->decoder.decode(wire(n),layout));assertFalse(e.getMessage().contains(n.toString()));}
 @Test void typedDecoderIsAvailable() throws Exception {
  assertDoesNotThrow(()->Class.forName("com.enerlution.ems.protocol.PointCatalog"));
  assertDoesNotThrow(()->Class.forName("com.enerlution.ems.protocol.TelemetryDecoder"));
 }
 @Test void catalogKeepsSqlEvidenceWithoutInventingSemantics(){
  assertEquals(1589,catalog.definitions().size());
  assertEquals(1410,catalog.definitions().stream().filter(d->d.namespace().equals("cabinet")).count());
  assertEquals(PointCatalog.WireType.UNKNOWN,catalog.find("cabinet",30115).orElseThrow().wireType());
  assertEquals("unknown",catalog.find("cabinet",30115).orElseThrow().sourceMetadata().get("writable"));
  assertNull(catalog.find("cabinet",10001).orElseThrow().verifiedUnit());
  assertEquals("V",catalog.find("cabinet",20021).orElseThrow().verifiedUnit());
  assertNull(catalog.find("ems",90002).orElseThrow().sourceName());
  assertEquals(PointCatalog.WireType.SCALAR,catalog.find("config",101).orElseThrow().wireType());
  assertThrows(UnsupportedOperationException.class,()->catalog.definitions().clear());
 }
 @Test void ordinaryCountsAndTypesPreserveSourcePrecision() throws Exception {
  var n=fixture("机柜30秒");
  point(n,"bms",20021).set(1,DecimalNode.valueOf(new BigDecimal("12345678901234567890.12345678901234567890")));
  point(n,"bms",20062).set(1,new ObjectMapper().readTree("[0,65535,1,32768]"));
  var a=decode(n);assertEquals(241,a.observations().size());assertNull(a.cells());assertNull(a.configuration());
  assertEquals(new BigDecimal("12345678901234567890.12345678901234567890"),a.observations().stream().filter(p->p.sourcePointId()==20021).findFirst().orElseThrow().value().decimalValue());
  assertEquals("[0,65535,1,32768]",a.observations().stream().filter(p->p.sourcePointId()==20062).findFirst().orElseThrow().value().toString());
  var b=decode(fixture("机柜60秒"));assertEquals(54,b.observations().size());
  assertTrue(b.observations().stream().filter(p->p.sourcePointId()==20003).findFirst().orElseThrow().value().isNull());
  assertTrue(b.observations().stream().filter(p->p.sourcePointId()==20231).findFirst().orElseThrow().value().isTextual());
  n=fixture("机柜30秒");point(n,"bms",20021).set(1,BigIntegerNode.valueOf(new BigInteger("18446744073709551617")));
  assertEquals(new BigInteger("18446744073709551617"),decode(n).observations().stream().filter(p->p.sourcePointId()==20021).findFirst().orElseThrow().value().bigIntegerValue());
 }
 @Test void ordinaryRejectsWrongPlacementIncompleteUnknownAndInvalidTypes() throws Exception {
  var n=fixture("机柜30秒");point(n,"bms",20062).set(1,new ObjectMapper().readTree("[0,65536,1,2]"));rejects(n,null);
  n=fixture("机柜30秒");point(n,"bms",20062).set(1,new ObjectMapper().readTree("[0,null,1,2]"));rejects(n,null);
  n=fixture("机柜30秒");point(n,"bms",20062).set(1,new ObjectMapper().readTree("[0,1,2]"));rejects(n,null);
  n=fixture("机柜60秒");point(n,"pcs",20231).set(1,IntNode.valueOf(2));rejects(n,null);
  n=fixture("机柜30秒");point(n,"bms",20021).set(0,IntNode.valueOf(99999));rejects(n,null);
  n=fixture("机柜30秒");point(n,"bms",20021).set(0,IntNode.valueOf(20003));rejects(n,null);
  n=fixture("机柜30秒");((ArrayNode)block(n,"bms").path("p")).remove(0);rejects(n,null);
  n=fixture("机柜30秒");block(n,"bms").put("q","unknown");rejects(n,null);
  n=fixture("机柜30秒");block(n,"bms").remove("q");rejects(n,null);
  n=fixture("机柜30秒");block(n,"bms").put("ts",new BigInteger("9223372036854775808"));rejects(n,null);
 }
 @Test void emsAndConfigurationRemainSeparateAndUnknownExtensionsFollowContract() throws Exception {
  var n=fixture("EMS");
  var base=(ArrayNode)n.path("d").path("base");
  ((ArrayNode)base.get(0).path("p")).addArray().add(999999).add("future-value");
  ((ArrayNode)base.get(0).path("p")).addArray().add(new BigInteger("9223372036854775808")).add("future-large-ID");
  var cfg=(ArrayNode)n.path("d").path("cfg").path("p");cfg.addArray().add(9999).add("future-config");
  var a=decode(n);assertNull(a.cabinet());assertEquals(6,a.observations().size());assertEquals(174,a.configuration().values().size());
  assertEquals(BigInteger.ZERO,a.configuration().revision());assertNull(a.cells());
  assertEquals("future-config",a.configuration().values().get(9999).textValue());
  assertTrue(a.observations().stream().allMatch(p->p.namespace().equals("ems")));
  assertEquals(173,decode(fixture("EMS")).configuration().values().size());
  var copy=a.configuration().values();assertThrows(UnsupportedOperationException.class,()->copy.clear());
  assertTrue(a.configuration().values().get(107).isNull());
  n=fixture("EMS");((ArrayNode)n.path("d").path("cfg").path("p").get(0)).set(1,new ObjectMapper().readTree("[1,2]"));rejects(n,null);
 }
 @Test void defensiveCopiesKeepMutableValuesStable(){
  var array=new ObjectMapper().createArrayNode().add(0).add(65535).add(1).add(2);
  var point=new PointValue("cabinet",20062,"bms",array,"valid",null);array.set(0,IntNode.valueOf(10));
  ((ArrayNode)point.value()).set(0,IntNode.valueOf(20));assertEquals(0,point.value().get(0).intValue());
  var cfg=new ConfigurationSnapshot(BigInteger.ONE,Map.of(1,array));((ArrayNode)cfg.values().get(1)).removeAll();assertEquals(4,cfg.values().get(1).size());
  var cells=new CellFrame(1,BigInteger.ONE,"cell_voltage",null,"valid",array);((ArrayNode)cells.values()).removeAll();assertEquals(4,cells.values().size());
 }
 @Test void cellsRequireMatchingIdentityReadinessVersionAndDimensions() throws Exception {
  var voltage=fixture("单体电压");var temperature=fixture("单体温度");
  rejects(voltage,StructureLayout.fromMessage(wire(fixture("设备结构"))));
  var layout=matched();var a=decoder.decode(wire(voltage),layout);
  assertEquals(5,a.cells().values().size());assertEquals(32,a.cells().values().get(0).size());assertTrue(a.observations().isEmpty());assertNull(a.configuration());
  assertEquals(new BigDecimal("3.2"),a.cells().values().get(0).get(0).decimalValue());
  assertEquals(16,decoder.decode(wire(temperature),layout).cells().values().get(0).size());
  rejects(voltage,null);
  var wrong=new StructureLayout(UUID.fromString("746bc054-9758-41cf-8ae2-cd788b286713"),layout.structureVersion(),layout.connectionId(),layout.sequence(),layout.bmuType(),5,32,16,layout.cabinets());rejects(voltage,wrong);
  voltage.put("sv",2);rejects(voltage,layout);voltage.put("sv",1);voltage.put("c",3);rejects(voltage,layout);
  var s=fixture("设备结构");((ObjectNode)s.path("d").path("clusters").get(0)).put("cellReady",false);rejects(fixture("单体电压"),StructureLayout.fromMessage(wire(s)));
  s=fixture("设备结构");s.putNull("sv");rejects(fixture("单体电压"),StructureLayout.fromMessage(wire(s)));
  voltage=fixture("单体电压");((ArrayNode)voltage.path("d").path("values").get(0)).remove(0);rejects(voltage,layout);
  voltage=fixture("单体电压");((ArrayNode)voltage.path("d").path("values")).remove(0);rejects(voltage,layout);
  voltage=fixture("单体电压");voltage.putNull("sv");rejects(voltage,layout);
  s=fixture("设备结构");((ObjectNode)s.path("d").path("clusters").get(0)).put("state","exited");rejects(fixture("单体电压"),StructureLayout.fromMessage(wire(s)));
  s=fixture("设备结构");((ObjectNode)s.path("d").path("clusterLayout").path("bms")).putNull("bmuCount");rejects(fixture("单体电压"),StructureLayout.fromMessage(wire(s)));
 }
 @Test void cellsPreserveOuterNullInnerNullAndSourceTime() throws Exception {
  var n=fixture("单体电压");var layout=matched();
  assertTrue(decoder.decode(wire(n),layout).cells().values().findValues("null").isEmpty());
  long nullCount=0;for(var row:decoder.decode(wire(n),layout).cells().values())for(var cell:row)if(cell.isNull())nullCount++;assertEquals(1,nullCount);
  var d=(ObjectNode)n.path("d");d.putNull("values");d.put("q","invalid");d.putNull("ts");
  var frame=decoder.decode(wire(n),layout).cells();assertTrue(frame.values().isNull());assertNull(frame.sourceTimestampMs());
  d.put("q","valid");rejects(n,layout);d.put("q","invalid");d.put("ts",new BigInteger("-9223372036854775809"));rejects(n,layout);
  n=fixture("单体电压");for(var row:n.path("d").path("values"))for(int i=0;i<row.size();i++)((ArrayNode)row).set(i,NullNode.instance);rejects(n,layout);
 }
 @Test void structureFactoryRejectsTypeSpoofingWithSafeProtocolError() throws Exception {
  var ordinary=wire(fixture("机柜30秒"));
  var spoof=new WireMessage(ordinary.emsId(),ordinary.channel(),"structure",ordinary.body(),ordinary.canonicalHash());
  assertThrows(ProtocolException.class,()->StructureLayout.fromMessage(spoof));
 }
 @Test void structureCapacityDoesNotAllowMoreThan500Positions() throws Exception {
  var n=fixture("设备结构");var b=(ObjectNode)n.path("d").path("clusterLayout").path("bms");b.put("bmuCount",10);b.put("voltCount",51);
  assertThrows(ProtocolException.class,()->StructureLayout.fromMessage(wire(n)));
 }
}
