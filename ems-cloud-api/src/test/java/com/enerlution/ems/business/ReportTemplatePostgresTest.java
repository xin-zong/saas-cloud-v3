package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** Dedicated target only. Every fixture and feature write is confined to a rollback schema. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class ReportTemplatePostgresTest {
  JdbcTemplate db;AccessControl access;DomainSupport support;ReportTemplateService templates;AnalysisJobService jobs;
  DataSourceTransactionManager manager;TransactionStatus outer;EmsTelemetryQueries telemetry;
  final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
  @BeforeEach void setup() throws Exception {
    var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
    manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);
    outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
    assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("SELECT current_database()",String.class));
    assertEquals("ems_toyingzhen_owner",db.queryForObject("SELECT current_user",String.class));
    String schema="report_template_test_"+UUID.randomUUID().toString().replace("-","");
    db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
    db.execute("""
      CREATE TABLE tenant(id bigint PRIMARY KEY);
      CREATE TABLE app_user(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE device(id bigint PRIMARY KEY,station_id bigint REFERENCES station(id),code text,name text);
      CREATE TABLE measurement_point(id bigint PRIMARY KEY,device_id bigint REFERENCES device(id));
      CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint REFERENCES app_user(id),target_tenant_id bigint REFERENCES tenant(id),action text,detail text);
      CREATE TABLE contract(id bigint PRIMARY KEY,currency text);
      CREATE TABLE settlement_record(id bigint PRIMARY KEY,station_id bigint REFERENCES station(id),contract_id bigint REFERENCES contract(id),reference text,recognition_date date,status text,statement_amount numeric,estimated_amount numeric,meter_complete boolean,calculation_complete boolean);
      CREATE TABLE settlement_line(record_id bigint REFERENCES settlement_record(id),category text,amount numeric);
      CREATE TABLE operating_plan(id bigint PRIMARY KEY,station_id bigint REFERENCES station(id),service_date date,version bigint,status text);
      CREATE TABLE plan_period(plan_id bigint REFERENCES operating_plan(id),start_minute integer,end_minute integer,mode text,power_kw numeric);
      CREATE TABLE ems_binding_period(id bigint PRIMARY KEY,station_id bigint REFERENCES station(id),ems_uuid uuid,valid_from timestamptz,valid_to timestamptz);
      CREATE TABLE telemetry_diagnostic_evidence(binding_period_id bigint REFERENCES ems_binding_period(id),reason text,received_at timestamptz);
      CREATE TABLE ems_connection_read(ems_uuid uuid,last_fresh_heartbeat timestamptz,reachable boolean);
      CREATE TABLE alarm(id bigint PRIMARY KEY,code text,title text,severity text,occurred_at timestamptz,recovered_at timestamptz);
      CREATE TABLE ems_alarm_business_origin(alarm_id bigint REFERENCES alarm(id),station_id bigint REFERENCES station(id));
      CREATE TABLE scoped_report_permission(user_id bigint,station_id bigint,permission_code text);
      INSERT INTO tenant VALUES(11),(22);INSERT INTO app_user VALUES(7,11),(8,11),(9,22);
      INSERT INTO station VALUES(101,11),(102,22);INSERT INTO device VALUES(19,101,'meter','Meter');
      INSERT INTO contract VALUES(1,'CNY');
      INSERT INTO settlement_record VALUES(1,101,1,'record-1','2026-09-01','settled',12.34,15.67,true,true);
      INSERT INTO settlement_line VALUES(1,'energy',12.34);
      INSERT INTO scoped_report_permission SELECT 7,101,code FROM unnest(ARRAY['report.export','strategy.read','revenue.read','asset.read','telemetry.read','alarm.read']) AS code;
      """);
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V17__analysis_jobs.sql")));
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V30__report_templates.sql")));
    access=mock(AccessControl.class);actor(7,11);when(access.stationPermissionTable()).thenReturn("scoped_report_permission");
    support=new DomainSupport(db,access);templates=new ReportTemplateService(support);telemetry=mock(EmsTelemetryQueries.class);
    when(telemetry.query(anyString())).thenReturn(json.createArrayNode());jobs=new AnalysisJobService(support,json,telemetry);
  }
  static String required(String key){return Objects.requireNonNull(System.getenv(key),key+" must be explicitly configured");}
  @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
  void actor(long user,long tenant){when(access.context()).thenReturn(new TenantContext(user,tenant,"enterprise",false));when(access.userId()).thenReturn(user);}
  List<String> fields(String kind){return ReportTemplateService.catalogue(kind).fields().stream().map(ReportTemplateService.Field::code).toList();}
  List<String> selected(String kind,String... choices){var list=new ArrayList<>(ReportTemplateService.catalogue(kind).fields().stream().filter(ReportTemplateService.Field::locked).map(ReportTemplateService.Field::code).toList());list.addAll(List.of(choices));return list;}
  ReportTemplateService.Template create(String name){return templates.create(new ReportTemplateService.CreateRequest(name,"revenue","range",fields("revenue")));}
  void failure(int status,Runnable call){var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));try{assertEquals(status,assertThrows(BusinessException.class,call::run).status());}finally{manager.rollback(savepoint);}}
  @Test void crudCloneReadOnlySystemNamesAndGetPurityAreDurable() {
    assertEquals(12,templates.list(null,null).size());assertEquals(3,templates.list(null,"month").size());assertEquals(4,templates.list("health",null).size());
    assertEquals(0,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));assertEquals(0,db.queryForObject("SELECT count(*) FROM report_template",Integer.class));
    var first=create(" Solar ");assertEquals("Solar",first.name());assertEquals(1,first.version());failure(409,()->create("solar"));
    var updated=templates.update(first.id(),new ReportTemplateService.UpdateRequest("Renamed","year",fields("revenue"),1L));assertEquals(2,updated.version());assertEquals("year",updated.timeType());
    assertEquals(updated,new ReportTemplateService(support).list("revenue","year").stream().filter(t->t.origin().equals("custom")).findFirst().orElseThrow());
    failure(409,()->templates.delete(first.id(),1L));failure(409,()->templates.update(first.id(),new ReportTemplateService.UpdateRequest("Stale","range",fields("revenue"),1L)));
    var system=ReportTemplateService.systems().getFirst();
    failure(409,()->templates.update(system.id(),new ReportTemplateService.UpdateRequest("No","day",system.fields(),1L)));failure(409,()->templates.delete(system.id(),1L));
    var clone=templates.clone(system.id(),new ReportTemplateService.CloneRequest("My system copy",1L));assertEquals("custom",clone.origin());assertNotEquals(system.id(),clone.id());assertEquals(system.fields(),clone.fields());
    templates.delete(first.id(),2L);assertEquals(1,db.queryForObject("SELECT count(*) FROM report_template",Integer.class));
  }
  @Test void tenCustomCapAndNamesAreAtomicAndPrivateAcrossUsersAndTenants() {
    var first=create("Same");for(int i=1;i<10;i++)create("Custom "+i);
    failure(409,()->create("Overflow"));failure(409,()->templates.clone(first.id(),new ReportTemplateService.CloneRequest("Overflow clone",1L)));
    assertEquals(10,db.queryForObject("SELECT count(*) FROM report_template",Integer.class));
    actor(8,11);assertEquals(12,templates.list(null,null).size());var other=create("Same");
    failure(404,()->templates.update(first.id(),new ReportTemplateService.UpdateRequest("Foreign","range",fields("revenue"),1L)));failure(404,()->templates.delete(first.id(),1L));failure(404,()->templates.clone(first.id(),new ReportTemplateService.CloneRequest("Foreign clone",1L)));
    actor(9,22);assertEquals(12,templates.list(null,null).size());failure(404,()->templates.delete(other.id(),1L));
    actor(7,11);assertEquals(22,templates.list(null,null).size());
  }
  AnalysisJobService.JobRequest request(String kind,ReportTemplateService.Template template,long version){return new AnalysisJobService.JobRequest(kind,"2026-09-01T00:00:00+08:00","2026-09-02T00:00:00+08:00",null,List.of(),template.id(),version);}
  @Test void filteredPreviewCsvAndHistoryShareAnImmutableSnapshotAfterTemplateDeletion() {
    var template=templates.create(new ReportTemplateService.CreateRequest("Only amounts","revenue","range",selected("revenue","summary.confirmedAmount","section.records.currency","section.records.statement_amount")));
    var request=request("revenue",template,1);
    assertTrue(db.queryForObject("SELECT (recognition_date::timestamp AT TIME ZONE 'Asia/Shanghai')>=?::timestamptz AND (recognition_date::timestamp AT TIME ZONE 'Asia/Shanghai')<?::timestamptz FROM settlement_record WHERE id=1",Boolean.class,request.from(),request.to()),
        "Fixture's Shanghai business midnight must fall inside the report's half-open window");
    var job=jobs.create(101,request);assertEquals("completed",job.status());assertNotNull(job.templateSnapshot());assertEquals("Only amounts",job.templateSnapshot().name());
    UUID id=UUID.fromString(job.id());var preview=jobs.preview(id);
    assertEquals(1,preview.summary().size());assertEquals("12.34",preview.summary().getFirst().value());
    var records=preview.sections().stream().filter(s->s.title().startsWith("结算记录")).findFirst().orElseThrow();
    assertEquals(List.of("currency","statement_amount"),records.columns().stream().map(AnalysisJobService.Column::key).toList());
    assertEquals(Set.of("currency","statement_amount"),records.rows().getFirst().keySet());
    byte[] csv=jobs.download(id);String text=new String(csv,StandardCharsets.UTF_8);
    assertTrue(text.contains("12.34"));assertTrue(text.contains("CNY"));assertFalse(text.contains("15.67"));assertFalse(text.contains("估算金额"));assertFalse(text.contains("record-1"));
    assertEquals(job.templateSnapshot(),jobs.list(101,"revenue",20,0).getFirst().templateSnapshot());
    templates.update(template.id(),new ReportTemplateService.UpdateRequest("Changed","month",fields("revenue"),1L));templates.delete(template.id(),2L);
    var reopened=new AnalysisJobService(support,json,telemetry);assertEquals(preview,reopened.preview(id));assertArrayEquals(csv,reopened.download(id));
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try{assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->db.update("UPDATE analysis_job SET template_snapshot='{}' WHERE id=?",id));}finally{manager.rollback(savepoint);}
    doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"revenue.read");
    failure(403,()->reopened.preview(id));failure(403,()->reopened.download(id));
  }
  @Test void templateVersionKindOwnershipAndFieldValidationRejectBeforeJobInsertion() {
    var template=create("A");
    failure(409,()->jobs.create(101,request("revenue",template,2)));failure(400,()->jobs.create(101,request("health",template,1)));
    actor(8,11);failure(404,()->jobs.create(101,request("revenue",template,1)));actor(7,11);
    failure(400,()->templates.create(new ReportTemplateService.CreateRequest("Bad","revenue","range",selected("revenue","section.records.statement_amount"))));
    assertEquals(0,db.queryForObject("SELECT count(*) FROM analysis_job",Integer.class));assertEquals(1,db.queryForObject("SELECT count(*) FROM report_template",Integer.class));
  }
  @Test void failedJobRetriesTheStoredSnapshotAfterOriginalTemplateIsDeleted() {
    db.update("INSERT INTO ems_binding_period VALUES(101,101,?::uuid,'2026-08-01',null)","11111111-1111-4111-8111-111111111111");
    var template=templates.create(new ReportTemplateService.CreateRequest("Health subset","health","day",selected("health","section.devices.device_id")));
    when(telemetry.query(anyString())).thenThrow(new IllegalStateException("private outage"));
    var failed=jobs.create(101,request("health",template,1));assertEquals("failed",failed.status());
    templates.delete(template.id(),1L);doReturn(json.createArrayNode()).when(telemetry).query(anyString());
    var retried=new AnalysisJobService(support,json,telemetry).retry(UUID.fromString(failed.id()));
    assertEquals("completed",retried.status());assertEquals(failed.templateSnapshot(),retried.templateSnapshot());
    String csv=new String(jobs.download(UUID.fromString(retried.id())),StandardCharsets.UTF_8);
    assertTrue(csv.contains("设备ID"));assertFalse(csv.contains("目录测点数"));
  }
  @Test void noTemplateRequestRetainsExistingOutputAndMetadataShape() {
    var job=jobs.create(101,new AnalysisJobService.JobRequest("revenue","2026-09-01T00:00:00Z","2026-09-02T00:00:00Z",null,List.of()));
    assertNull(job.templateSnapshot());var preview=jobs.preview(UUID.fromString(job.id()));
    assertTrue(preview.sections().stream().noneMatch(s->s.title().equals("报告信息")));
    assertTrue(new String(jobs.download(UUID.fromString(job.id())),StandardCharsets.UTF_8).contains("估算金额"));
  }
  @ParameterizedTest @ValueSource(strings={"create","update","clone","delete"})
  void eachTemplateMutationMarksRollbackOnlyIfAuditFails(String operation) {
    var first=create("A");
    var failingSupport=new DomainSupport(db,access){@Override public void audit(String action,Map<String,?> detail){throw new BusinessException(503,"audit unavailable");}};
    var failing=new ReportTemplateService(failingSupport);assertFalse(outer.isRollbackOnly());
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try {
      Runnable call=switch(operation){case "create"->()->failing.create(new ReportTemplateService.CreateRequest("B","revenue","range",fields("revenue")));case "update"->()->failing.update(first.id(),new ReportTemplateService.UpdateRequest("B","month",fields("revenue"),1L));case "clone"->()->failing.clone(first.id(),new ReportTemplateService.CloneRequest("B",1L));default->()->failing.delete(first.id(),1L);};
      assertEquals(503,assertThrows(BusinessException.class,call::run).status());assertTrue(outer.isRollbackOnly());
    } finally{manager.rollback(savepoint);}
    assertEquals(List.of(first),templates.list(null,null).stream().filter(t->t.origin().equals("custom")).toList());
  }
}
