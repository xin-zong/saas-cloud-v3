package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;

/** Guarded PostgreSQL DDL/data and all request writes roll back in one outer transaction. */
@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA", matches="ems_ingestion_tests")
class AnalysisJobPostgresTest {
  Connection connection; JdbcTemplate db; DomainSupport support; AnalysisJobService jobs;
  DataSourceTransactionManager transactions; TransactionStatus outer;
  final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
  EmsTelemetryQueries telemetry;
  final String from = "2026-09-01T00:00:00Z", to = "2026-09-02T00:00:00Z";
  @BeforeEach void setup() throws Exception {
    var ds = new DriverManagerDataSource(System.getenv("EMS_TEST_DB_URL"), System.getenv("EMS_TEST_DB_USER"), System.getenv("EMS_TEST_DB_PASSWORD"));
    transactions = new DataSourceTransactionManager(ds);
    outer = transactions.getTransaction(new org.springframework.transaction.support.DefaultTransactionDefinition());
    connection=DataSourceUtils.getConnection(ds);
    db = new JdbcTemplate(ds);
    assertEquals("ems_cloud_v2_proto",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_ingestion_test",db.queryForObject("select current_user",String.class));
    db.execute("SET LOCAL search_path TO ems_ingestion_tests,public"); db.execute("SELECT pg_advisory_xact_lock(78291028)");
    assertEquals(0,db.queryForObject("select count(*) from information_schema.tables where table_schema='ems_ingestion_tests'",Integer.class));
    for (int version=1;version<=17;version++) {
      if(version==11) db.update("INSERT INTO app_role(code,name) VALUES('bootstrap_super_admin__o2','Superadmin')");
      String prefix="V"+version+"__";
      try(var paths=Files.list(Path.of("src/main/resources/db/migration"))) {
        var file=paths.filter(p->p.getFileName().toString().startsWith(prefix)).findFirst().orElseThrow();
        db.execute(Files.readString(file).replace("CREATE EXTENSION IF NOT EXISTS btree_gist;",""));
      }
    }
    db.execute("""
      INSERT INTO organization(id,name) VALUES(1,'Root');
      INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id) VALUES(7,'actor','Actor','unused',1,1);
      INSERT INTO app_role(id,code,name,organization_id) VALUES(11,'analysis_operator','Operator',1);
      INSERT INTO role_permission SELECT 11,code FROM permission WHERE code IN ('report.export','telemetry.read','strategy.read','revenue.read','asset.read','alarm.read');
      INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES(101,'a','A',1,1,1),(102,'b','B',1,1,1);
      INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(21,7,11,now()-interval '1 day');
      INSERT INTO member_grant_station VALUES(21,101);
      INSERT INTO device(id,station_id,code,name) VALUES(101,101,'a','A'),(102,102,'b','B');
      INSERT INTO measurement_point(id,device_id,kind_code,code) VALUES(19,101,'soc','SOC'),(20,102,'soc','Other');
      INSERT INTO ems_gateway VALUES('11111111-1111-4111-8111-111111111111',101);
      INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from) VALUES(101,'11111111-1111-4111-8111-111111111111',101,'2026-08-01T00:00:00Z');
      INSERT INTO device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from) VALUES(101,101,'cabinet',1,'bms',1,101,'2026-08-01T00:00:00Z');
      INSERT INTO point_definition(id,catalog_version,namespace,source_id,value_type,aggregation) VALUES(101,'test','cabinet',20018,'number','last');
      INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) VALUES(101,101,19,'2026-08-01T00:00:00Z');
      """);
    var session=mock(SessionTokens.class); when(session.userId()).thenReturn(7L);
    support=new DomainSupport(db,new AccessControl(db,session)); telemetry=mock(EmsTelemetryQueries.class);
    doReturn(json.createArrayNode()).when(telemetry).history(anyLong(),anyList(),anyLong(),anyLong());
    when(telemetry.query(anyString())).thenReturn(json.createArrayNode());
    jobs=new AnalysisJobService(support,json,telemetry);
  }
  @AfterEach void cleanup() throws Exception { if(outer!=null) transactions.rollback(outer); if(connection!=null) connection.close(); }
  AnalysisJobService.JobRequest request(String kind, Integer minutes, List<String> points) { return new AnalysisJobService.JobRequest(kind,from,to,minutes,points); }
  @Test void deniesWrongStationMissingCapabilityAndForeignPointBeforePersisting() {
    assertEquals(403,assertThrows(BusinessException.class,()->jobs.create(102,request("revenue",null,List.of()))).status());
    assertEquals(400,assertThrows(BusinessException.class,()->jobs.create(101,request("telemetry",0,List.of("20")))).status());
    db.update("DELETE FROM role_permission WHERE role_id=11 AND permission_code='telemetry.read'");
    assertEquals(403,assertThrows(BusinessException.class,()->jobs.create(101,request("telemetry",0,List.of("19")))).status());
    assertEquals(0,db.queryForObject("SELECT count(*) FROM analysis_job",Integer.class));
  }
  @Test void storesSelectionAndImmutableExactArtifactsAndReadsAfterServiceReconstruction() throws Exception {
    var rows=json.createArrayNode(); rows.addObject().put("point_id",19).put("binding_period_id",101).put("value_kind","number").put("number_exact","9007199254740993.000000000001").put("quality","valid").put("source_at_ms",1788220800000L).put("received_at_ms",1788220800001L).put("source_time_kind","source").put("source_type","cabinet_30s");
    when(telemetry.history(anyLong(),anyList(),anyLong(),anyLong())).thenReturn(rows);
    var job=jobs.create(101,request("telemetry",0,List.of("19","19")));
    assertEquals("completed",job.status()); assertEquals(List.of("19"),job.pointIds());
    assertEquals(1,db.queryForObject("SELECT count(*) FROM analysis_job_point",Integer.class));
    var reopened=new AnalysisJobService(support,json,telemetry);
    assertEquals("9007199254740993.000000000001",reopened.preview(UUID.fromString(job.id())).sections().getFirst().rows().getFirst().get("value"));
    String csv=new String(reopened.download(UUID.fromString(job.id())),StandardCharsets.UTF_8);
    assertTrue(csv.contains("9007199254740993.000000000001")); assertTrue(csv.contains("cabinet_30s"));
    assertArrayEquals(csv.getBytes(StandardCharsets.UTF_8),db.queryForObject("SELECT csv_content FROM analysis_job_artifact",byte[].class));
    assertThrows(BusinessException.class,()->jobs.retry(UUID.fromString(job.id())));
    assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE analysis_job SET station_id=102 WHERE id=?::uuid",job.id()));
  }
  @Test void failureIsPersistedWithoutLeakingPathAndCanRetrySameNormalizedRequest() {
    when(telemetry.history(anyLong(),anyList(),anyLong(),anyLong())).thenThrow(new IllegalStateException("password=/private/secret"));
    var job=jobs.create(101,request("telemetry",0,List.of("19")));
    assertEquals("failed",job.status()); assertNotNull(job.error()); assertFalse(job.error().contains("secret"));
    assertEquals("failed",jobs.list(101,"telemetry",20,0).getFirst().status());
    doReturn(json.createArrayNode()).when(telemetry).history(anyLong(),anyList(),anyLong(),anyLong());
    var retried=jobs.retry(UUID.fromString(job.id())); assertEquals("completed",retried.status());
    assertEquals(job.id(),retried.id()); assertEquals(job.pointIds(),retried.pointIds());
    assertTrue(jobs.preview(UUID.fromString(job.id())).sections().getFirst().rows().isEmpty());
  }
  @Test void readsDownloadAndRetryRecheckOriginalStationAfterPermissionRevocation() {
    var job=jobs.create(101,request("telemetry",0,List.of("19"))); UUID id=UUID.fromString(job.id());
    db.update("UPDATE point_binding SET valid_to=clock_timestamp() WHERE device_binding_id=101");
    db.update("UPDATE device_binding SET valid_to=clock_timestamp() WHERE id=101");
    db.update("UPDATE ems_binding_period SET valid_to=clock_timestamp() WHERE id=101");
    db.update("UPDATE device SET station_id=102 WHERE id=101");
    assertNotNull(jobs.preview(id));
    db.update("INSERT INTO member_grant_station VALUES(21,102)"); db.update("DELETE FROM member_grant_station WHERE station_id=101");
    assertEquals(403,assertThrows(BusinessException.class,()->jobs.preview(id)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->jobs.download(id)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->jobs.retry(id)).status());
  }
  @Test void emptyRevenueAndHealthKeepUnavailableIndicatorsNull() {
    var revenue=jobs.create(101,request("revenue",null,List.of()));
    var preview=jobs.preview(UUID.fromString(revenue.id()));
    assertEquals("completed",revenue.status()); assertNull(preview.summary().getFirst().value());
    assertTrue(preview.sections().getFirst().rows().isEmpty());
    var health=jobs.create(101,request("health",null,List.of()));
    assertTrue(jobs.preview(UUID.fromString(health.id())).summary().stream().anyMatch(s->s.label().equals("健康评分")&&s.value()==null));
  }
  @Test void confirmedRevenueIsSeparatedByCurrencyAndNeverTotalsUnconfirmedOrLineDuplicates() {
    db.execute("""
      INSERT INTO contract(id,code,currency) VALUES(1,'cny','CNY'),(2,'usd','USD');
      INSERT INTO settlement_record(id,station_id,contract_id,reference,recognition_date,status,statement_amount)
       VALUES(1,101,1,'a','2026-09-01','settled',12.34),(2,101,2,'b','2026-09-01','settled',5.67),
       (3,101,1,'c','2026-09-01','reviewing',900),(4,101,1,'excluded','2026-09-02','settled',1000);
      INSERT INTO settlement_line(record_id,category,amount) VALUES(1,'arbitrage',12.34),(1,'other',12.34);
      """);
    var job=jobs.create(101,new AnalysisJobService.JobRequest("revenue","2026-09-01T00:00:00+08:00","2026-09-02T00:00:00+08:00",null,List.of()));
    var preview=jobs.preview(UUID.fromString(job.id()));
    assertEquals(3,preview.sections().getFirst().rows().size());
    assertTrue(preview.summary().contains(new AnalysisJobService.Summary("已确认结算金额","12.34","CNY")));
    assertTrue(preview.summary().contains(new AnalysisJobService.Summary("已确认结算金额","5.67","USD")));
  }
  @Test void telemetryGenerationStopsOnRevocationAndDoesNotPublishArtifact() {
    when(telemetry.history(anyLong(),anyList(),anyLong(),anyLong())).thenAnswer(call->{
      db.update("DELETE FROM member_grant_station WHERE station_id=101"); return json.createArrayNode();
    });
    assertEquals(403,assertThrows(BusinessException.class,()->jobs.create(101,request("telemetry",0,List.of("19")))).status());
    assertEquals("failed",db.queryForObject("SELECT status FROM analysis_job",String.class));
    assertEquals(0,db.queryForObject("SELECT count(*) FROM analysis_job_artifact",Integer.class));
  }
  @Test void artifactBodiesCannotBeChangedInPostgres() throws Exception {
    var job=jobs.create(101,request("telemetry",0,List.of("19")));
    assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
        ()->db.update("UPDATE analysis_job_artifact SET csv_content=? WHERE job_id=?::uuid","changed".getBytes(StandardCharsets.UTF_8),job.id()));
  }
  @Test void operationsShowsReceivedFactsAndQualityWithoutEstimatingEnergy() {
    var statistics=json.createArrayNode();
    statistics.addObject().put("source","cabinet_30s").put("quality","invalid").put("records","3").put("points","1");
    when(telemetry.query(anyString())).thenAnswer(call->{
      String sql=call.getArgument(0);
      assertTrue(sql.contains("binding_period_id IN (101)"));
      assertTrue(sql.contains("source_at_ms>=1788220800000"));
      assertTrue(sql.contains("source_at_ms<1788307200000"));
      return statistics;
    });
    var job=jobs.create(101,request("operations",null,List.of()));
    assertEquals("completed",job.status());
    var preview=jobs.preview(UUID.fromString(job.id()));
    assertTrue(preview.sections().stream().anyMatch(section->section.rows().stream().anyMatch(row->"invalid".equals(row.get("quality"))&&"3".equals(row.get("records")))));
    assertTrue(preview.summary().stream().anyMatch(summary->summary.label().equals("日电量")&&summary.value()==null));
  }
  @Test void startupInAnotherServiceDoesNotFailActiveGeneratorAndSessionLockIsReleased() throws Exception {
    doAnswer(call->{
      var observer=new AnalysisJobService(support,json,telemetry);
      observer.recoverInterruptedJobs();
      assertEquals("running",db.queryForObject("SELECT status FROM analysis_job",String.class));
      return json.createArrayNode();
    }).when(telemetry).history(anyLong(),anyList(),anyLong(),anyLong());
    var job=jobs.create(101,request("telemetry",0,List.of("19")));
    assertEquals("completed",job.status());
    try(var fresh=db.getDataSource().getConnection();var query=fresh.prepareStatement("SELECT pg_try_advisory_lock(?)")) {
      query.setLong(1,AnalysisJobService.lockKey(UUID.fromString(job.id())));
      try(var result=query.executeQuery()) { assertTrue(result.next()); assertTrue(result.getBoolean(1)); }
      try(var unlock=fresh.prepareStatement("SELECT pg_advisory_unlock(?)")) {
        unlock.setLong(1,AnalysisJobService.lockKey(UUID.fromString(job.id()))); unlock.execute();
      }
    }
  }
  @Test void startupRecoversOnlyUnlockedPendingJobThenAllowsRetry() throws Exception {
    UUID id=UUID.randomUUID();
    db.update("INSERT INTO analysis_job(id,station_id,created_by,kind,from_at,to_at) VALUES(?,101,7,'revenue',?::timestamptz,?::timestamptz)",id,from,to);
    try(var active=db.getDataSource().getConnection();var lock=active.prepareStatement("SELECT pg_advisory_lock(?)")) {
      lock.setLong(1,AnalysisJobService.lockKey(id)); lock.execute();
      jobs.recoverInterruptedJobs();
      assertEquals("pending",db.queryForObject("SELECT status FROM analysis_job WHERE id=?",String.class,id));
      try(var unlock=active.prepareStatement("SELECT pg_advisory_unlock(?)")) { unlock.setLong(1,AnalysisJobService.lockKey(id)); unlock.execute(); }
    }
    jobs.recoverInterruptedJobs();
    assertEquals("failed",db.queryForObject("SELECT status FROM analysis_job WHERE id=?",String.class,id));
    assertEquals("completed",jobs.retry(id).status());
  }
  @Test void movedUnmappedLegacyPointExportsEmptyWithoutReadingUnprovenFacts() {
    db.update("INSERT INTO device(id,station_id,code,name) VALUES(103,101,'legacy','Legacy')");
    db.update("INSERT INTO measurement_point(id,device_id,kind_code,code) VALUES(103,103,'soc','legacy')");
    db.update("UPDATE device SET station_id=102 WHERE id=103");
    db.update("INSERT INTO member_grant_station VALUES(21,102)"); db.update("DELETE FROM member_grant_station WHERE station_id=101");
    doAnswer(call->{ fail("Unproven legacy history must not be queried"); return null; }).when(telemetry).query(anyString());
    var job=jobs.create(102,request("telemetry",0,List.of("103")));
    assertEquals("completed",job.status());
    assertTrue(jobs.preview(UUID.fromString(job.id())).sections().getFirst().rows().isEmpty());
  }
  @Test void healthOmitsMovedLegacyObservationsAndAlarmsButRetainsEmsOriginalStation() {
    db.execute("""
      INSERT INTO device(id,station_id,code,name) VALUES(103,101,'legacy','Legacy');
      INSERT INTO device_observation(device_id,observed_at,communication_status) VALUES(103,'2026-09-01T01:00:00Z','online');
      INSERT INTO alarm(id,device_id,code,title,severity,occurred_at) VALUES(103,103,'legacy','Past station secret','warning','2026-09-01T01:00:00Z'),
        (104,101,'ems','Authorized original EMS alarm','warning','2026-09-01T01:00:00Z');
      INSERT INTO ems_alarm_identity(ems_uuid,alarm_id,business_alarm_id,business_device_binding_id)
        VALUES('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',104,101);
      UPDATE device SET station_id=102 WHERE id=103;
      """);
    var original=jobs.create(101,request("health",null,List.of()));
    assertTrue(jobs.preview(UUID.fromString(original.id())).sections().stream().flatMap(section->section.rows().stream())
        .anyMatch(row->"Authorized original EMS alarm".equals(row.get("title"))));
    db.update("INSERT INTO member_grant_station VALUES(21,102)"); db.update("DELETE FROM member_grant_station WHERE station_id=101");
    var moved=jobs.create(102,request("health",null,List.of()));
    var preview=jobs.preview(UUID.fromString(moved.id()));
    assertFalse(preview.sections().stream().flatMap(section->section.rows().stream())
        .anyMatch(row->row.containsKey("communication_status")||"Past station secret".equals(row.get("title"))||"Authorized original EMS alarm".equals(row.get("title"))));
  }
  @Test void aggregateEvidenceBudgetStopsBeforeLoadingAllIndividuallyBoundedPoints() {
    var points=new ArrayList<String>();
    for(int id=201;id<=210;id++) {
      db.update("INSERT INTO measurement_point(id,device_id,kind_code,code) VALUES(?,101,'soc',?)",id,"large-"+id);
      db.update("INSERT INTO point_definition(id,catalog_version,namespace,source_id,value_type,aggregation) VALUES(?,'large','cabinet',?,'text','last')",id,id);
      db.update("INSERT INTO point_binding(device_binding_id,definition_id,measurement_point_id,valid_from) VALUES(101,?,?,'2026-08-01T00:00:00Z')",id,id);
      points.add(Integer.toString(id));
    }
    var reads=new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(call->{
      assertTrue(reads.incrementAndGet()<=5,"must reject before retaining all ten 3 MiB evidence results");
      long point=call.getArgument(0);
      var raw=json.createArrayNode(); raw.addObject().put("point_id",point).put("binding_period_id",101).put("value_kind","text")
        .put("text_value","x".repeat(3*1024*1024)).put("quality","valid").put("source_at_ms",1788220800000L)
        .put("received_at_ms",1788220800001L).put("source_time_kind","source").put("source_type","cabinet_30s");
      return raw;
    }).when(telemetry).history(anyLong(),anyList(),anyLong(),anyLong());
    var job=jobs.create(101,request("telemetry",15,points));
    assertEquals("failed",job.status()); assertTrue(job.error().contains("过大"));
    assertEquals(0,db.queryForObject("SELECT count(*) FROM analysis_job_artifact",Integer.class));
  }
}
