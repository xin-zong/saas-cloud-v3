package com.enerlution.ems.agent;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AgentSitesTest {
  @Test void directoryComesOnlyFromCurrentDatabaseRows() {
    var db=mock(JdbcTemplate.class);var sites=new AgentSites(db);
    when(db.queryForList(anyString(),eq(11L))).thenReturn(List.of(Map.of("id",11L,"code","PROTO-001","name","平台站点")));
    assertEquals("PROTO-001",sites.resolve(List.of("11")).getFirst().get("code"));
    when(db.queryForList(anyString(),eq(12L))).thenReturn(List.of());
    assertEquals(409,assertThrows(AgentFailure.class,()->sites.resolve(List.of("12"))).status);
  }
}
