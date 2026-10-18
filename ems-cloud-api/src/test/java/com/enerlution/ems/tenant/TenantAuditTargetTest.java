package com.enerlution.ems.tenant;

import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.business.DomainSupport;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantAuditTargetTest {
  @Test
  void platformActionKeepsRealActorAndPersistedTargetTenant() throws Exception {
    var db = mock(JdbcTemplate.class);
    var source = mock(javax.sql.DataSource.class);
    var connection = mock(java.sql.Connection.class);
    when(db.getDataSource()).thenReturn(source);
    when(source.getConnection()).thenReturn(connection);
    var auth = mock(AccessControl.class);
    when(auth.userId()).thenReturn(15L);
    when(db.queryForObject("SELECT tenant_id FROM station WHERE id=?", Long.class, 4L))
        .thenReturn(2L);
    when(db.queryForObject("INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?) RETURNING id",
        Long.class,15L,2L,"station.edit","station=4")).thenReturn(42L);
    new DomainSupport(db, auth).auditStation("station.edit", 4L, "station=4");
    verify(db)
        .queryForObject(
            "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?) RETURNING id",
            Long.class,
            15L,
            2L,
            "station.edit",
            "station=4");
  }
}
