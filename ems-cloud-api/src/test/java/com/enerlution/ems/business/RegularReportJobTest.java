package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class RegularReportJobTest {
 @Test void sourceDeviceTypeRemainsAvailableWhenLocalDeviceHasNoModel(){assertEquals("PCS",RegularReportJobService.deviceType("PCS",null,true,"missing"));assertEquals("电池簇",RegularReportJobService.deviceType("Battery Cluster",null,false,"missing"));assertEquals("Smart meter",RegularReportJobService.deviceType(null,"MTR",true,"missing"));assertEquals("missing",RegularReportJobService.deviceType(null,null,true,"missing"));}
 @Test void productionDateBoundsUseShanghaiYesterdayThrough29DaysAgo(){var clock=Clock.fixed(Instant.parse("2026-10-19T16:00:00Z"),ZoneOffset.UTC);assertDoesNotThrow(()->RegularReportJobService.range("production-day","2026-10-19","2026-10-19",clock));assertDoesNotThrow(()->RegularReportJobService.range("production-day","2026-09-21","2026-09-21",clock));for(String day:List.of("2026-10-20","2026-09-20"))assertThrows(BusinessException.class,()->RegularReportJobService.range("production-day",day,day,clock));assertThrows(BusinessException.class,()->RegularReportJobService.range("production-day","2026-10-18","2026-10-19",clock));}
 @Test void metricsRemainUnsupportedAndMissingMetadataIsNeverZeroFilled(){assertEquals(List.of("Production","PR"),RegularReportJobService.unsupported(List.of("Site Name","Production","PR")));var row=RegularReportJobService.stationValues(new HashMap<>(Map.of("id",3L,"name","Station","asset_type","PV","capacity_kwh","100","rated_power_kw","50","solar_capacity_kw",0)),"missing");assertEquals("0",row.get("Solar Capacity"));assertEquals("missing",row.get("Storage Installed Power"));assertEquals("missing",row.get("Address"));assertEquals("Station",row.get("Site Name"));}
 @Test void xlsxIsARealWorkbookWithTextCellsAndProvenanceAndNoFormulaInterpretation()throws Exception{byte[] bytes=ReportXlsx.write(List.of("Site Name"),List.of(List.of("=HYPERLINK(\"bad\") <&>")),List.of("Current metadata only"));var entries=new HashMap<String,String>();try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes),StandardCharsets.UTF_8)){for(ZipEntry entry;(entry=zip.getNextEntry())!=null;)entries.put(entry.getName(),new String(zip.readAllBytes(),StandardCharsets.UTF_8));}assertTrue(entries.containsKey("[Content_Types].xml"));assertTrue(entries.containsKey("xl/_rels/workbook.xml.rels"));assertTrue(entries.get("xl/worksheets/sheet1.xml").contains("t=\"inlineStr\""));assertTrue(entries.get("xl/worksheets/sheet1.xml").contains("&lt;&amp;&gt;"));assertFalse(entries.get("xl/worksheets/sheet1.xml").contains("<f>"));assertTrue(entries.get("xl/worksheets/sheet2.xml").contains("Current metadata only"));assertEquals("AA",ReportXlsx.column(26));assertFalse(RegularReportJobService.safeFilename("x\r\n/\\").contains("\r"));}
 @Test void listQueryAndDownloadCheckPermissionBeforeDatabaseAccess(){var access=mock(AccessControl.class);var db=mock(JdbcTemplate.class);doThrow(new BusinessException(403,"denied")).when(access).requirePermission("report.export");var service=new RegularReportJobService(new DomainSupport(db,access),Clock.systemUTC());assertThrows(BusinessException.class,()->service.list("regular",50,0,null,null,null,null,null));assertThrows(BusinessException.class,()->service.query(UUID.randomUUID()));assertThrows(BusinessException.class,()->service.download(UUID.randomUUID()));verifyNoInteractions(db);}
}

