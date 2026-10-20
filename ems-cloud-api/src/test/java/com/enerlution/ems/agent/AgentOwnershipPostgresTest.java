package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

/** Explicit opt-in against the isolated, already migrated database; all changes roll back. */
@EnabledIfEnvironmentVariable(named="EMS_AGENT_POSTGRES_TESTS",matches="true")
class AgentOwnershipPostgresTest {
  JdbcTemplate db;
  DataSourceTransactionManager manager;
  TransactionStatus tx;
  @BeforeEach void setup() {
    var ds=new DriverManagerDataSource(System.getenv("EMS_TOYINGZHEN_DB_URL"),System.getenv("EMS_TOYINGZHEN_DB_USER"),System.getenv("EMS_TOYINGZHEN_DB_PASSWORD"));
    manager=new DataSourceTransactionManager(ds);tx=manager.getTransaction(new DefaultTransactionDefinition());db=new JdbcTemplate(ds);
    assertEquals("ems_cloud_saas_toyingzhen",db.queryForObject("select current_database()",String.class));
    assertEquals("ems_toyingzhen_owner",db.queryForObject("select current_user",String.class));
  }
  @AfterEach void cleanup() {if(tx!=null)manager.rollback(tx);}
  @Test void ownersSurviveServiceRestartAndCollisionsCannotChangeThem() {
    var user=db.queryForList("select user_id,tenant_id from saas_active_user order by user_id limit 1").getFirst();
    long tenant=((Number)user.get("tenant_id")).longValue();
    long userId=((Number)user.get("user_id")).longValue();
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
