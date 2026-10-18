package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationBasicElectricityPostgresTest {
 JdbcTemplate db;AccessControl access;StationBasicElectricityService service;DataSourceTransactionManager manager;TransactionStatus outer;
 @BeforeEach void setup() throws Exception{
  var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
  assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("SELECT current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("SELECT current_user",String.class));
  String schema="basic_fee_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
  db.execute("""
   CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint);
   CREATE TABLE station_profile(station_id bigint PRIMARY KEY);
   CREATE TABLE app_user(id bigint PRIMARY KEY,display_name text);
   CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint,target_tenant_id bigint,action text,detail text);
   CREATE TABLE station_audit_event(event_id bigint,station_id bigint,shared_detail boolean,channel text,actor_name text);
   CREATE TABLE tariff(id bigint,price numeric); INSERT INTO tariff VALUES(1,0.31);
   INSERT INTO station VALUES(101,11),(102,22); INSERT INTO app_user VALUES(7,'Test');
   """);
  db.execute(Files.readString(Path.of("src/main/resources/db/migration/V46__station_basic_electricity.sql")));
  access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);service=new StationBasicElectricityService(new DomainSupport(db,access));
 }
 static String required(String key){return Objects.requireNonNull(System.getenv(key),key);}
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 StationBasicElectricityService.Request r(String type,String capacity,String demand,long version){return new StationBasicElectricityService.Request("two-part",type,capacity,demand,"",version);}
 void failure(int status,Runnable action){var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));try{assertEquals(status,assertThrows(BusinessException.class,action::run).status());}finally{manager.rollback(nested);}}
 @Test void durableZeroVersionConditionalFieldsAuditAndUnchangedTariffs(){
  assertNull(service.get(101));var first=service.save(101,r("capacity","0",null,0));assertEquals("0.00",first.transformerCapacityKva());assertEquals(1,first.version());assertFalse(first.billingConnected());
  assertEquals(first,new StationBasicElectricityService(new DomainSupport(db,access)).get(101));
  failure(409,()->service.save(101,r("capacity","2",null,0)));
  var second=service.save(101,r("contract-demand",null,"65535",1));assertNull(second.transformerCapacityKva());assertEquals("65535.00",second.contractDemandKw());
  var third=service.save(101,r("actual-demand",null,null,2));assertNull(third.contractDemandKw());assertEquals(3,third.version());assertNull(service.get(102));
  assertEquals(3,db.queryForObject("SELECT count(*) FROM station_audit_event WHERE station_id=101",Integer.class));assertEquals(3,db.queryForObject("SELECT count(*) FROM audit_event WHERE target_tenant_id=11",Integer.class));assertEquals("0.31",db.queryForObject("SELECT price::text FROM tariff",String.class));
 }
 @Test void crossStationDeniedAndPermissionRecheckedInsideTransaction(){
  doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(102,"tariff.manage");failure(403,()->service.save(102,r("capacity","0",null,0)));assertThrows(BusinessException.class,()->service.get(102));
  doNothing().doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"tariff.manage");failure(403,()->service.save(101,r("capacity","0",null,0)));assertEquals(0,db.queryForObject("SELECT count(*) FROM station_basic_electricity",Integer.class));
 }
}
