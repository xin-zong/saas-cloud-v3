package com.enerlution.ems.business;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.util.*;
import java.io.*;
import java.util.zip.*;
import java.nio.charset.StandardCharsets;
class DeviceHistoryExportTest {
 @Test void archivedDeviceIsRejectedAtIdentityBoundary(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList(contains("FROM device d"),eq(120L),eq(21L))).thenAnswer(invocation->{
   String sql=invocation.getArgument(0);
   return java.util.regex.Pattern.compile("\\bd\\.archived_at IS NULL").matcher(sql).find()?List.of():List.of(Map.of("serial_number","archived-device"));
  });
  var request=new DeviceHistoryExportService.Request("2026-10-18",1,"UTC","all",List.of());
  assertEquals(404,assertThrows(BusinessException.class,()->new DeviceHistoryExportService(new DomainSupport(db,access)).export(21,120,request)).status());
 }
 @Test void selectedForeignPointCannotQuerySamples(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  when(db.queryForList(contains("FROM device d"),eq(120L),eq(21L))).thenReturn(List.of(Map.of("serial_number","test")));
  when(db.queryForList(contains("FROM reference_device_point"),eq(120L),eq(21L))).thenReturn(List.of(Map.of("id",1L,"reference_id",9L,"name","Voltage","unit","V")));
  var request=new DeviceHistoryExportService.Request("2026-10-18",5,"UTC","selected",List.of(2L));
  assertEquals(400,assertThrows(BusinessException.class,()->new DeviceHistoryExportService(new DomainSupport(db,access)).export(21,120,request)).status());
  verify(db,never()).queryForList(contains("FROM reference_device_sample"),any(Object[].class));
 }
 @Test void calendarRangeIncludesEndAndHandlesDst(){
  var r=DeviceHistoryExportService.range("2026-03-29",5,"Europe/Berlin");
  assertEquals(Instant.parse("2026-03-24T23:00:00Z"),r.from());
  assertEquals(Instant.parse("2026-03-29T22:00:00Z"),r.until());
  assertEquals("2026-03-25~2026-03-29",r.sheet());
  assertThrows(BusinessException.class,()->DeviceHistoryExportService.range("2026-02-30",5,"UTC"));
  assertThrows(BusinessException.class,()->DeviceHistoryExportService.range("2026-03-29",6,"UTC"));
 }
 @Test void exportPermissionIsRequiredBeforeReading(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(21,"report.export");
  var request=new DeviceHistoryExportService.Request("2026-10-18",5,"UTC","all",List.of());
  assertThrows(BusinessException.class,()->new DeviceHistoryExportService(new DomainSupport(db,access)).export(21,120,request));
  verifyNoInteractions(db);
 }
 @Test void xlsxPreservesLiteralValuesAndCalendarSheetName() throws Exception {
  byte[] bytes=DeviceHistoryWorkbook.write("2026-10-14~2026-10-18",List.of(List.of("时间","电压(V)"),List.of("2026/10/14 00:00:00","=1+2"),List.of("--","0")));
  var entries=new HashMap<String,String>();
  try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes),StandardCharsets.UTF_8)){for(ZipEntry e;(e=zip.getNextEntry())!=null;)entries.put(e.getName(),new String(zip.readAllBytes(),StandardCharsets.UTF_8));}
  assertTrue(entries.get("xl/workbook.xml").contains("2026-10-14~2026-10-18"));
  assertTrue(entries.get("xl/worksheets/sheet1.xml").contains("=1+2"));
  assertFalse(entries.get("xl/worksheets/sheet1.xml").contains("<f>"));
  assertEquals(5,entries.size());
 }
}
