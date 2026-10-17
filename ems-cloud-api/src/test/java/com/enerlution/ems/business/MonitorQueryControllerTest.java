package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
class MonitorQueryControllerTest {
 @Test void browserCsvReadRequestsAlwaysForwardExportPermissionRequirement(){
  var service=mock(MonitorQueryService.class);var from=OffsetDateTime.now().minusHours(1);var to=OffsetDateTime.now();var ids=List.of(1L);
  when(service.history(ids,"pvPower",from,to,60,true)).thenReturn(Map.of("items",List.of()));
  var response=new MonitorQueryController(service).history(ids,"pvPower",from,to,60,true);
  assertEquals(200,response.code());verify(service).history(ids,"pvPower",from,to,60,true);verifyNoMoreInteractions(service);
 }
 @Test void csvEscapesFormulaPrefixesAndQuotes(){
  for(String value:List.of("=1+1","+1","@x","-1","\tx","\rx","\nx"))assertTrue(ReportController.cell(value).startsWith("\"'"));
  assertEquals("\"a\"\"b\"",ReportController.cell("a\"b"));assertEquals("\"\"",ReportController.cell(null));
 }
}
