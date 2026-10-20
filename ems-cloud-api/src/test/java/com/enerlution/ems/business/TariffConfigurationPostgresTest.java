package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class TariffConfigurationPostgresTest {
 JdbcTemplate db;AccessControl access;TariffConfigurationService service;DataSourceTransactionManager manager;TransactionStatus outer;
 @BeforeEach void setup()throws Exception{var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("SELECT current_database()",String.class));assertEquals("ems_toyingzhen_owner",db.queryForObject("SELECT current_user",String.class));String schema="tariff_configuration_test_"+UUID.randomUUID().toString().replace("-","");db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);db.execute("CREATE TABLE tenant(id bigint PRIMARY KEY);CREATE TABLE app_user(id bigint PRIMARY KEY,display_name text);CREATE TABLE audit_event(actor_id bigint,target_tenant_id bigint,action text,detail text);INSERT INTO tenant VALUES(11),(22);INSERT INTO app_user VALUES(7,'Owner');");db.execute(Files.readString(Path.of("src/main/resources/db/migration/V59__nonpurchase_tariff_configuration.sql")));access=mock(AccessControl.class);actor(11);when(access.userId()).thenReturn(7L);service=new TariffConfigurationService(new DomainSupport(db,access));}
 static String required(String name){return Objects.requireNonNull(System.getenv(name),name+" must be set");}
 void actor(long tenant){when(access.context()).thenReturn(new TenantContext(7,tenant,"enterprise",false));}
 void failure(int status,Runnable call){var nested=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));try{assertEquals(status,assertThrows(BusinessException.class,call::run).status());}finally{manager.rollback(nested);}}
 @AfterEach void cleanup(){if(outer!=null)manager.rollback(outer);}
 TariffLibraryService.Request request(String name,String type,Long version){var base=TariffConfigurationTest.request(type,"fixed",List.of(new TariffTemplateService.Period(0,1440,"flat","0.125")));return new TariffLibraryService.Request(name,base.currency(),base.pricingMode(),base.periods(),base.metadata(),version);}
 @Test void configHasRoundTripVersionHistoryTenantIsolationAndArchiveWithoutPurchaseTables(){for(String type:List.of("sell","subsidy","selfUse")){var created=service.save(null,request(type,type,null));assertEquals("configuration-only",created.usage());assertEquals("0.125000",created.periods().getFirst().pricePerKwh());UUID id=UUID.fromString(created.id());assertEquals(type,created.metadata().priceType());var updated=service.save(id,request(type+" updated",type,1L));assertEquals(2,updated.version());assertEquals(type,db.queryForObject("SELECT name FROM tariff_configuration_version WHERE configuration_id=? AND version=1",String.class,id));failure(409,()->service.save(id,request("stale",type,1L)));failure(409,()->service.save(id,request("convert",type.equals("sell")?"subsidy":"sell",2L)));actor(22);assertTrue(service.list().isEmpty());failure(404,()->service.archive(id,2L));failure(404,()->service.save(id,request("foreign",type,2L)));actor(11);service.archive(id,2L);assertTrue(service.list().isEmpty());failure(409,()->service.save(id,request("archived",type,3L)));assertEquals(2,db.queryForObject("SELECT count(*) FROM tariff_configuration_version WHERE configuration_id=?",Integer.class,id));}assertNull(db.queryForObject("SELECT to_regclass('tariff_template')",String.class));assertNull(db.queryForObject("SELECT to_regclass('tariff')",String.class));assertNull(db.queryForObject("SELECT to_regclass('station_tariff')",String.class));}
}
