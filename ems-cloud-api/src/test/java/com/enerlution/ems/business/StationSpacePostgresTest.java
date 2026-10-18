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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

/** All fixture DDL/data and feature mutations roll back; no legacy schema opt-in is used. */
@EnabledIfEnvironmentVariable(named="EMS_TOYINGZHEN_TESTS",matches="true")
class StationSpacePostgresTest {
  JdbcTemplate db; AccessControl access; DomainSupport support; StationSpaceService spaces;
  DataSourceTransactionManager manager; TransactionStatus outer;
  @BeforeEach void setup() throws Exception {
    var ds=new DriverManagerDataSource(required("EMS_TOYINGZHEN_DB_URL"),required("EMS_TOYINGZHEN_DB_USER"),required("EMS_TOYINGZHEN_DB_PASSWORD"));
    manager=new DataSourceTransactionManager(ds);manager.setNestedTransactionAllowed(true);
    outer=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
    assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
    String schema="station_space_test_"+UUID.randomUUID().toString().replace("-","");
    db.execute("CREATE SCHEMA "+schema);db.execute("SET LOCAL search_path TO "+schema);
    db.execute("""
      CREATE TABLE tenant(id bigint PRIMARY KEY);
      CREATE TABLE app_user(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE station(id bigint PRIMARY KEY,tenant_id bigint REFERENCES tenant(id));
      CREATE TABLE device(id bigint PRIMARY KEY,station_id bigint REFERENCES station(id),name text NOT NULL,code text NOT NULL);
      CREATE TABLE audit_event(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id bigint REFERENCES app_user(id),target_tenant_id bigint REFERENCES tenant(id),action text,detail text);
      INSERT INTO tenant VALUES(11),(22);
      INSERT INTO app_user VALUES(7,11);
      INSERT INTO station VALUES(101,11),(102,22);
      INSERT INTO device VALUES(19,101,'Solar meter','serial-19'),(20,101,'Storage meter','serial-20'),(30,102,'Foreign meter','foreign-30');
      """);
    db.execute("ALTER TABLE app_user ADD COLUMN display_name text");
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V44__station_operation_logs.sql")));
    db.execute(Files.readString(Path.of("src/main/resources/db/migration/V29__station_spaces.sql")));
    access=mock(AccessControl.class);when(access.userId()).thenReturn(7L);
    when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    support=new DomainSupport(db,access);spaces=new StationSpaceService(support);
  }
  static String required(String name) { return Objects.requireNonNull(System.getenv(name),name+" must be configured explicitly"); }
  @AfterEach void cleanup() { if(outer!=null)manager.rollback(outer); }
  void failure(int code,Runnable action) {
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try { assertEquals(code,assertThrows(BusinessException.class,action::run).status()); }
    finally { manager.rollback(savepoint); }
  }
  void constraint(Runnable action) {
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try { assertThrows(DataIntegrityViolationException.class,action::run); }
    finally { manager.rollback(savepoint); }
  }
  StationSpaceService.Space create(long station,UUID parent,String name,int type) {
    return spaces.create(station,new StationSpaceService.CreateRequest(parent,name,type));
  }
  @Test void treeCrudMovesAndCaseInsensitiveSiblingNamesPersistWithoutGetWrites() {
    assertTrue(spaces.list(101).isEmpty());assertEquals(0,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
    var root=create(101,null,"  A  ",10);var child=create(101,root.id(),"B",60);
    assertEquals("A",root.name());assertEquals("101",root.stationId());assertEquals(1,root.version());
    assertEquals(2,new StationSpaceService(support).list(101).size());
    int audits=db.queryForObject("SELECT count(*) FROM audit_event",Integer.class);
    spaces.list(101);spaces.devices(101,null,null,false,20,0);
    assertEquals(audits,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
    failure(409,()->create(101,null,"a",20));failure(409,()->create(101,root.id(),"b",30));
    failure(409,()->spaces.delete(101,root.id(),1L));
    failure(409,()->spaces.move(101,root.id(),new StationSpaceService.MoveRequest(child.id(),1L)));
    failure(409,()->spaces.move(101,root.id(),new StationSpaceService.MoveRequest(root.id(),1L)));
    var renamed=spaces.rename(101,child.id(),new StationSpaceService.RenameRequest("  B2 ",1L));
    assertEquals("B2",renamed.name());assertEquals(2,renamed.version());
    failure(409,()->spaces.rename(101,child.id(),new StationSpaceService.RenameRequest("stale",1L)));
    var moved=spaces.move(101,child.id(),new StationSpaceService.MoveRequest(null,2L));
    assertNull(moved.parentId());assertEquals(3,moved.version());
    spaces.delete(101,root.id(),1L);spaces.delete(101,child.id(),3L);assertTrue(spaces.list(101).isEmpty());
  }
  @Test void deviceSearchPaginationBindingRetryAndExplicitReassignmentAreAtomic() {
    var first=create(101,null,"A",10);var second=create(101,null,"B",20);
    assertEquals(2,spaces.devices(101,null,null,true,1,0).total());
    assertEquals(1,spaces.devices(101,null,null,false,1,1).items().size());
    assertEquals(2,spaces.devices(101,null,null,false,1,9).total());
    assertTrue(spaces.devices(101,null,null,false,1,9).items().isEmpty());
    assertEquals("19",spaces.devices(101,"sOlAr",null,false,20,0).items().getFirst().deviceId());
    assertEquals("20",spaces.devices(101,"serial-20",null,false,20,0).items().getFirst().deviceId());
    var bound=spaces.bind(101,first.id(),new StationSpaceService.BindRequest(List.of("19","19"),1L));
    assertEquals(1,bound.deviceCount());assertEquals(2,bound.version());
    bound=spaces.bind(101,first.id(),new StationSpaceService.BindRequest(List.of("19"),2L));
    assertEquals(1,bound.deviceCount());assertEquals(3,bound.version());
    failure(409,()->spaces.bind(101,second.id(),new StationSpaceService.BindRequest(List.of("20","19"),1L)));
    failure(403,()->spaces.bind(101,second.id(),new StationSpaceService.BindRequest(List.of("20","30"),1L)));
    failure(400,()->spaces.bind(101,second.id(),new StationSpaceService.BindRequest(List.of("20","999"),1L)));
    assertEquals(1,spaces.devices(101,null,null,true,20,0).total());
    failure(409,()->spaces.delete(101,first.id(),3L));
    var empty=spaces.unbind(101,first.id(),"19",3L);assertEquals(4,empty.version());assertEquals(0,empty.deviceCount());
    var reassigned=spaces.bind(101,second.id(),new StationSpaceService.BindRequest(List.of("19"),1L));
    assertEquals(2,reassigned.version());
    failure(409,()->spaces.unbind(101,first.id(),"19",4L));
    var filtered=spaces.devices(101,null,second.id(),false,20,0);
    assertEquals(1,filtered.total());assertEquals(second.id(),filtered.items().getFirst().spaceId());assertEquals("B",filtered.items().getFirst().spaceName());
    failure(409,()->spaces.bind(101,second.id(),new StationSpaceService.BindRequest(List.of("19"),1L)));
    spaces.delete(101,first.id(),4L);
  }
  @Test void foreignParentsDevicesAndWrongStationIdsCannotCrossTheStationBoundary() {
    var own=create(101,null,"A",10);var foreign=create(102,null,"Foreign",60);
    failure(403,()->create(101,foreign.id(),"Invalid",10));
    failure(403,()->spaces.move(101,own.id(),new StationSpaceService.MoveRequest(foreign.id(),1L)));
    failure(404,()->spaces.rename(102,own.id(),new StationSpaceService.RenameRequest("Invalid",1L)));
    failure(403,()->spaces.devices(101,null,foreign.id(),false,20,0));
    failure(403,()->spaces.unbind(101,own.id(),"30",1L));
    doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"asset.read");
    failure(403,()->spaces.list(101));failure(403,()->spaces.devices(101,null,null,false,20,0));
    failure(403,()->spaces.bind(101,own.id(),new StationSpaceService.BindRequest(List.of("19"),1L)));
  }
  @Test void databaseGuardsRejectCyclesForeignLinksAndDeviceStationChanges() {
    var root=create(101,null,"A",10);var child=create(101,root.id(),"B",20);var foreign=create(102,null,"Foreign",30);
    constraint(()->db.update("UPDATE station_space SET parent_id=? WHERE id=?",child.id(),root.id()));
    constraint(()->db.update("UPDATE station_space SET parent_id=? WHERE id=?",foreign.id(),child.id()));
    constraint(()->db.update("UPDATE station_space SET station_id=102 WHERE id=?",root.id()));
    constraint(()->db.update("INSERT INTO station_space_device(device_id,station_id,space_id,created_by) VALUES(30,101,?,7)",root.id()));
    spaces.bind(101,child.id(),new StationSpaceService.BindRequest(List.of("19"),1L));
    constraint(()->db.update("UPDATE device SET station_id=102 WHERE id=19"));
    constraint(()->db.update("DELETE FROM station_space WHERE id=?",child.id()));
    assertEquals(101L,db.queryForObject("SELECT station_id FROM device WHERE id=19",Long.class));
  }
  @ParameterizedTest @ValueSource(strings={"create","rename","move","delete","bind","unbind"})
  void eachMutationMarksRollbackOnlyWhenAuditFailsBeforeTestCleanup(String operation) {
    var own=create(101,null,"A",10);var other=create(101,null,"B",60);
    if(operation.equals("unbind"))own=spaces.bind(101,own.id(),new StationSpaceService.BindRequest(List.of("19"),1L));
    final var target=own;
    var before=spaces.list(101);var devicesBefore=spaces.devices(101,null,null,false,20,0);
    int auditsBefore=db.queryForObject("SELECT count(*) FROM audit_event",Integer.class);
    var failingSupport=new DomainSupport(db,access) {
      @Override public void auditStation(String action,long station,Object detail) { throw new BusinessException(503,"audit unavailable"); }
    };
    var failing=new StationSpaceService(failingSupport);
    assertFalse(outer.isRollbackOnly());
    var savepoint=manager.getTransaction(new DefaultTransactionDefinition(TransactionDefinition.PROPAGATION_NESTED));
    try {
      Runnable call=switch(operation) {
        case "create" -> ()->failing.create(101,new StationSpaceService.CreateRequest(null,"C",10));
        case "rename" -> ()->failing.rename(101,target.id(),new StationSpaceService.RenameRequest("Renamed",target.version()));
        case "move" -> ()->failing.move(101,target.id(),new StationSpaceService.MoveRequest(other.id(),target.version()));
        case "delete" -> ()->failing.delete(101,target.id(),target.version());
        case "bind" -> ()->failing.bind(101,target.id(),new StationSpaceService.BindRequest(List.of("19"),target.version()));
        case "unbind" -> ()->failing.unbind(101,target.id(),"19",target.version());
        default -> throw new AssertionError(operation);
      };
      assertEquals(503,assertThrows(BusinessException.class,call::run).status());
      assertTrue(outer.isRollbackOnly(),"Service must roll back the feature write when audit fails");
    } finally { manager.rollback(savepoint); }
    assertEquals(before,spaces.list(101));assertEquals(devicesBefore,spaces.devices(101,null,null,false,20,0));
    assertEquals(auditsBefore,db.queryForObject("SELECT count(*) FROM audit_event",Integer.class));
  }
}
