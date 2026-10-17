package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class MonitorLayoutPostgresTest {
 JdbcTemplate db;AccessControl access;DomainSupport support;MonitorLayoutService layouts;DataSourceTransactionManager manager;TransactionStatus transaction;
 @BeforeEach void setup()throws Exception{
  var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);transaction=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  String schema="monitor_layout_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("CREATE TABLE tenant(id bigint PRIMARY KEY);CREATE TABLE app_user(id bigint PRIMARY KEY);CREATE TABLE audit_event(actor_id bigint,target_tenant_id bigint,action text,detail text);INSERT INTO tenant VALUES(11),(22);INSERT INTO app_user VALUES(7),(8),(9)");
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V27__monitor_templates.sql")));db.execute(Files.readString(Path.of("src/main/resources/db/migration/V34__monitor_layout.sql")));
  access=mock(AccessControl.class);actor(7,11);support=new DomainSupport(db,access);layouts=new MonitorLayoutService(support,new ObjectMapper());
 }
 static String required(String key){return Objects.requireNonNull(System.getenv(key),key);}
 void actor(long user,long tenant){when(access.context()).thenReturn(new TenantContext(user,tenant,"enterprise",false));when(access.userId()).thenReturn(user);}
 @AfterEach void cleanup(){if(transaction!=null)manager.rollback(transaction);}
 List<MonitorLayoutService.Widget> widgets(){return List.of(new MonitorLayoutService.Widget("站点运营概况",0,0,6,3));}
 @Test void defaultLayoutPersistsWithVersionAuditAndOwnerIsolation(){
  assertEquals(0,layouts.get(null).version());var saved=layouts.save(null,new MonitorLayoutService.Request(widgets(),0L));assertEquals(1,saved.version());assertEquals(saved,new MonitorLayoutService(support,new ObjectMapper()).get(null));
  assertEquals(409,assertThrows(BusinessException.class,()->layouts.save(null,new MonitorLayoutService.Request(widgets(),0L))).status());
  actor(8,11);assertEquals(0,layouts.get(null).version());actor(9,22);assertEquals(0,layouts.get(null).version());actor(7,11);assertEquals(saved,layouts.get(null));assertEquals(1,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
 }
 @Test void privateTemplateGeometryCannotBeReadByAnotherUserAndCascadesOnDeletion(){
  var templates=new MonitorTemplateService(support);var template=templates.create(new MonitorTemplateService.TemplateRequest("A",List.of("站点运营概况"),null));
  layouts.save(template.id(),new MonitorLayoutService.Request(widgets(),0L));actor(8,11);assertEquals(404,assertThrows(BusinessException.class,()->layouts.get(template.id())).status());actor(7,11);
  templates.delete(template.id(),1L);assertEquals(0,db.queryForObject("SELECT count(*) FROM monitor_layout",Integer.class));
 }
}
