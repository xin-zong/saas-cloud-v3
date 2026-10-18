package com.enerlution.ems.auth;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.business.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class JointAuthorizationTest {
  private static void auditConnection(JdbcTemplate db) throws Exception {
    var source=mock(javax.sql.DataSource.class);
    var connection=mock(java.sql.Connection.class);
    when(db.getDataSource()).thenReturn(source);
    when(source.getConnection()).thenReturn(connection);
    when(connection.getAutoCommit()).thenReturn(true);
    when(db.queryForObject(startsWith("INSERT INTO audit_event"),eq(Long.class),any(Object[].class)))
        .thenReturn(1L);
  }
  @Test
  void editorAtAReaderAtBMayEditOnlyA() throws Exception {
    JdbcTemplate db = mock(JdbcTemplate.class);
    auditConnection(db);
    SessionTokens session = mock(SessionTokens.class);
    when(session.userId()).thenReturn(7L);
    when(db.queryForObject(
            eq("SELECT tenant_id FROM station WHERE id=?"), eq(Long.class), anyLong()))
        .thenReturn(2L);
    when(session.client()).thenReturn("web");
    when(db.queryForObject(
            startsWith("select exists(select 1 from saas_active_user"), eq(Boolean.class), eq(7L)))
        .thenReturn(true);
    when(db.queryForList(startsWith("select tenant_id,kind,administrator"), eq(7L)))
        .thenReturn(List.of(Map.of("tenant_id", 2L, "kind", "enterprise", "administrator", false)));
    when(db.queryForObject(
            startsWith("select exists(select 1 from saas_effective_station_permission"),
            eq(Boolean.class),
            anyLong(),
            anyLong(),
            anyString(),
            eq("web")))
        .thenAnswer(
            call ->
                (Long) call.getArgument(3) != 102L || !"asset.edit".equals(call.getArgument(4)));
    when(db.queryForObject(anyString(), eq(Boolean.class), any(Object[].class)))
        .thenAnswer(
            call -> {
              String sql = call.getArgument(0);
              if (sql.contains("plan_period")) return false;
              // The legacy separate checks both pass. The joined relation has edit only at A.
              if (sql.contains("effective_station_permission")) {
                Object[] args = call.getArguments();
                return !Arrays.asList(args).contains(102L)
                    || !Arrays.asList(args).contains("asset.edit");
              }
              return true;
            });
    when(db.queryForList(startsWith("SELECT id FROM station"), anyLong()))
        .thenAnswer(call -> List.of(Map.of("id", call.getArgument(1))));
    when(db.queryForList(eq("SELECT * FROM station WHERE id=?"), anyLong()))
        .thenAnswer(call -> List.of(Map.of("id", call.getArgument(1))));
    AssetController controller =
        new AssetController(new DomainSupport(db, new AccessControl(db, session)));
    var edit =
        new AssetController.Edit("name", BigDecimal.TEN, BigDecimal.TEN, null, null, null, null);
    assertDoesNotThrow(() -> controller.edit(101, edit));
    BusinessException denied =
        assertThrows(BusinessException.class, () -> controller.edit(102, edit));
    assertEquals(403, denied.status());
  }

  @Test
  void inspectionAssigneeDoesNotNeedUnrelatedWorkorderHandling() throws Exception {
    JdbcTemplate db = mock(JdbcTemplate.class);
    auditConnection(db);
    AccessControl access = mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    when(db.queryForObject(
            eq("SELECT tenant_id FROM station WHERE id=?"), eq(Long.class), anyLong()))
        .thenReturn(2L);
    when(access.context())
        .thenReturn(new com.enerlution.ems.tenant.TenantContext(7, 2, "enterprise", false));
    when(access.hasStationPermission(8, 101, "inspection.manage")).thenReturn(true);
    when(db.queryForObject(
            startsWith("INSERT INTO inspection"), eq(Long.class), any(Object[].class)))
        .thenReturn(44L);
    MaintenanceController controller = new MaintenanceController(new DomainSupport(db, access));
    assertDoesNotThrow(
        () ->
            controller.createInspection(
                new MaintenanceController.Inspection(
                    101, "Inspect", java.time.OffsetDateTime.now().plusDays(1), 8L)));
    assertEquals(
        400,
        assertThrows(
                BusinessException.class,
                () ->
                    controller.create(
                        new MaintenanceController.NewOrder(
                            101, "Repair", "Details", 8L, null, null)))
            .status());
    verify(db, never())
        .queryForObject(startsWith("INSERT INTO work_order"), eq(Long.class), any(Object[].class));
  }

  @Test
  void approvalStatusIsNotExposedBeforeItsPersistedStationIsAuthorized() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    AccessControl access = mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    when(db.queryForObject(
            eq("SELECT tenant_id FROM station WHERE id=?"), eq(Long.class), anyLong()))
        .thenReturn(2L);
    when(db.queryForList(startsWith("SELECT * FROM approval"), eq(99L)))
        .thenReturn(
            List.of(Map.of("id", 99L, "status", "approved", "submitter_id", 8L, "plan_id", 55L)));
    when(db.queryForList(startsWith("SELECT * FROM operating_plan"), eq(55L)))
        .thenReturn(List.of(Map.of("id", 55L, "station_id", 102L, "status", "approved")));
    doThrow(new BusinessException(403, "denied"))
        .when(access)
        .requireStationPermission(102, "approval.review");
    OperationsController controller = new OperationsController(new DomainSupport(db, access));
    assertEquals(
        403,
        assertThrows(
                BusinessException.class,
                () ->
                    controller.decision(99, new OperationsController.Decision("approved", "Note")))
            .status());
    verify(db, never()).update(anyString(), any(Object[].class));
  }
}
