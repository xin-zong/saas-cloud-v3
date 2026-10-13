package com.enerlution.ems.tenant;

import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.business.DomainSupport;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantAuditTargetTest {
  @Test
  void platformActionKeepsRealActorAndPersistedTargetTenant() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(AccessControl.class);
    when(auth.userId()).thenReturn(15L);
    when(db.queryForObject("SELECT tenant_id FROM station WHERE id=?", Long.class, 4L))
        .thenReturn(2L);
    new DomainSupport(db, auth).auditStation("station.edit", 4L, "station=4");
    verify(db)
        .update(
            "INSERT INTO audit_event(actor_id,target_tenant_id,action,detail) VALUES(?,?,?,?)",
            15L,
            2L,
            "station.edit",
            "station=4");
  }
}
