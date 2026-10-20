package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

/** Opt-in isolated test schema; all fixtures and DDL roll back. */
@EnabledIfEnvironmentVariable(named="EMS_TEST_SCHEMA",matches="ems_ingestion_tests")
class AgentOwnershipPostgresTest {
  JdbcTemplate db;
  DataSourceTransactionManager manager;
  TransactionStatus tx;
  @BeforeEach void setup() throws Exception {
    var ds=new DriverManagerDataSource(System.getenv("EMS_TEST_DB_URL"),System.getenv("EMS_TEST_DB_USER"),System.getenv("EMS_TEST_DB_PASSWORD"));
    manager=new DataSourceTransactionManager(ds);tx=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
    assertEquals("ems_cloud_v2_proto",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_ingestion_test",db.queryForObject("select current_user",String.class));
    db.execute("SET LOCAL search_path TO ems_ingestion_tests,public");
    db.execute("SELECT pg_advisory_xact_lock(78291028)");
    assertEquals(0,db.queryForObject("select count(*) from information_schema.tables where table_schema='ems_ingestion_tests'",Integer.class));
    db.execute("CREATE TABLE tenant(id bigint PRIMARY KEY); CREATE TABLE app_user(id bigint PRIMARY KEY); CREATE TABLE station(id bigint PRIMARY KEY); INSERT INTO tenant VALUES(2); INSERT INTO app_user VALUES(8); INSERT INTO station VALUES(11),(12)");
    db.execute(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/resources/db/migration/V26__agent_resource_ownership.sql")));
  }
  @AfterEach void cleanup() {if(tx!=null)manager.rollback(tx);}
  @Test void ownersSurviveServiceRestartAndCollisionsCannotChangeThem() {
    long tenant=2,userId=8;
    var actor=new AgentGateway.Actor(tenant,userId,"web",List.of("11","12"));
    String id="test_"+UUID.randomUUID().toString().replace("-","");
    var first=new AgentOwnership(db);first.remember("conversation",id,actor,List.of("11","12"));
    var restarted=new AgentOwnership(db);
    assertDoesNotThrow(()->restarted.require("conversation",id,actor,List.of("12","11")));
    var stranger=new AgentGateway.Actor(tenant,userId,"app",List.of("11","12"));
    assertEquals(502,assertThrows(AgentFailure.class,()->restarted.remember("conversation",id,stranger,List.of("11","12"))).status);
    assertDoesNotThrow(()->first.require("conversation",id,actor,List.of("11","12")));
    assertThrows(AgentFailure.class,()->restarted.require("conversation",id,new AgentGateway.Actor(tenant,actor.user(),"web",List.of("11")),List.of("11")));
  }
}
