package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class EmsTelemetryHttpTest {
 @Test void exactBoundedJsonRowsAndMandatoryServerLimits()throws Exception {
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  var checked=new AtomicBoolean();
  server.createContext("/",exchange->{
   String sql=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
   checked.set(sql.contains("max_execution_time=8")&&sql.contains("output_format_json_quote_64bit_integers=0"));
   byte[] body="{\"data\":[{\"value_kind\":\"number\",\"number_exact\":\"9007199254740993.00000000001\"}]}".getBytes(StandardCharsets.UTF_8);
   exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();
  });server.start();
  try {
   var queries=new EmsTelemetryQueries(new ObjectMapper(),"http://127.0.0.1:"+server.getAddress().getPort(),"test","test",true);
   assertEquals("9007199254740993.00000000001",queries.query("SELECT 1").get(0).path("number_exact").asText());assertTrue(checked.get());
  }finally{server.stop(0);}
 }
 @Test void refusesOversizedBodyAndRedirectWithoutForwardingCredentials()throws Exception {
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var forwarded=new AtomicBoolean();
  server.createContext("/huge",e->{e.sendResponseHeaders(200,0);try{e.getResponseBody().write(new byte[EmsTelemetryQueries.MAX_BYTES+1]);}catch(Exception ignored){}finally{e.close();}});
  server.createContext("/redirect",e->{e.getResponseHeaders().add("Location","http://127.0.0.1:"+server.getAddress().getPort()+"/target");e.sendResponseHeaders(302,-1);e.close();});
  server.createContext("/target",e->{forwarded.set(true);e.sendResponseHeaders(200,0);e.close();});server.start();
  try {
   String base="http://127.0.0.1:"+server.getAddress().getPort();
   assertEquals(413,assertThrows(BusinessException.class,()->new EmsTelemetryQueries(new ObjectMapper(),base+"/huge","test","test",true).query("SELECT 1")).status());
   assertEquals(503,assertThrows(BusinessException.class,()->new EmsTelemetryQueries(new ObjectMapper(),base+"/redirect","test","test",true).query("SELECT 1")).status());assertFalse(forwarded.get());
  }finally{server.stop(0);}
 }
 @Test void responseRowsAreBoundedAndDecimalResetDoesNotInventWrap()throws Exception {
  var json=new ObjectMapper();var samples=json.createArrayNode();
  samples.addObject().put("source_at_ms",1).put("value_kind","number").put("number_exact","100").put("quality","valid");
  samples.addObject().put("source_at_ms",2).put("value_kind","number").put("number_exact","1").put("quality","valid");
  var result=EmsTelemetryQueries.aggregate(samples,"delta",1).getFirst();assertNull(result.get("value"));assertEquals(true,result.get("resetUnknown"));
  var rows=json.createArrayNode();for(int i=0;i<=EmsTelemetryQueries.MAX_ROWS;i++)rows.addNull();
  assertEquals(413,assertThrows(BusinessException.class,()->EmsTelemetryQueries.aggregate(rows,"last",1)).status());
 }
}
