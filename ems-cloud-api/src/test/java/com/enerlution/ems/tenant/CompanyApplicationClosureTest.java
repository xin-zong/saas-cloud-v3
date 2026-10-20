package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class CompanyApplicationClosureTest {
  static class Fixture {
    final JdbcTemplate db = mock(JdbcTemplate.class);
    final TenantAuthorization auth = mock(TenantAuthorization.class);
    final EmailChallengeService email = mock(EmailChallengeService.class);
    final ActivationService activation = mock(ActivationService.class);
    final MailDeliveryService mail = mock(MailDeliveryService.class);
    final TenantSupport support = new TenantSupport(db, auth, mock(CapabilityEvents.class));
    final CompanyApplicationService service =
        new CompanyApplicationService(
            db,
            support,
            email,
            activation,
            mail,
            mock(SecretCodec.class),
            new BCryptPasswordEncoder(4));

    Fixture() {
      when(auth.context()).thenReturn(new TenantContext(1, 1, "platform", true));
      when(auth.userId()).thenReturn(1L);
      when(email.requireContext("context", "owner@test.invalid")).thenReturn("owner@test.invalid");
    }

    Map<String, Object> progress(String status, Map<String, Object> state) {
      var row =
          new HashMap<String, Object>(
              Map.of("id", 7L, "number", "APP-7", "status", status, "name", "企业"));
      row.put("tenant_enabled", true);
      row.putAll(state);
      when(db.queryForList(contains("FROM company_application"), eq("owner@test.invalid")))
          .thenReturn(List.of(row));
      return service.progress("owner@test.invalid", "context").getFirst();
    }
  }

  @Test
  void progressShowsSafeActivationActionAndNeverLeaksInternalMailOrAccountFields() {
    var f = new Fixture();
    var row =
        f.progress(
            "approved",
            Map.of(
                "account_status",
                "invited",
                "activation_present",
                true,
                "activation_valid",
                true,
                "activation_consumed",
                false,
                "activation_revoked",
                false,
                "activation_mail_status",
                "sent"));
    assertEquals("check_activation_email", row.get("nextAction"));
    assertEquals("pending", row.get("activationStatus"));
    assertEquals("invited", row.get("accountStatus"));
    assertEquals("sent", row.get("mailStatus"));
    assertFalse(row.containsKey("activation_mail_status"));
    assertFalse(row.containsKey("account_status"));
    assertFalse(row.containsKey("activation_valid"));
  }

  @Test
  void activationExpiryAndDeliveryFailureRequireAdministratorInsteadOfClaimingLoginReady() {
    for (var state :
        List.of(
            Map.<String, Object>of(
                "account_status",
                "invited",
                "activation_present",
                true,
                "activation_valid",
                false,
                "activation_mail_status",
                "sent"),
            Map.<String, Object>of(
                "account_status",
                "invited",
                "activation_present",
                true,
                "activation_valid",
                true,
                "activation_mail_status",
                "failed"))) {
      var row = new Fixture().progress("approved", state);
      assertEquals("contact_administrator", row.get("nextAction"));
    }
  }

  @Test
  void approvedActiveAccountCanSignInAndSendingMailIsStillPending() {
    var row =
        new Fixture()
            .progress(
                "approved",
                Map.of(
                    "account_status",
                    "active",
                    "activation_present",
                    true,
                    "activation_consumed",
                    true,
                    "activation_mail_status",
                    "sending"));
    assertEquals("sign_in", row.get("nextAction"));
    assertEquals("consumed", row.get("activationStatus"));
    assertEquals("pending", row.get("mailStatus"));
  }

  @Test
  void pendingAndRejectedProgressRemainBoundToVerifiedEmailAndExposeTheirNextStep() {
    var f = new Fixture();
    assertEquals("await_review", f.progress("pending", Map.of()).get("nextAction"));
    assertEquals(
        "reapply",
        f.progress("rejected", Map.of("rejection_mail_status", "failed")).get("nextAction"));
    verify(f.email, times(4)).requireContext("context", "owner@test.invalid");
  }

  @Test
  void invalidCompanyCatalogNeverInsertsAnApplication() {
    var f = new Fixture();
    when(f.db.queryForObject(contains("SELECT EXISTS"), eq(Boolean.class), any(Object[].class)))
        .thenReturn(false);
    var form =
        new CompanyForm(
            "企业",
            List.of("unknown"),
            List.of("commercial"),
            "CN",
            "省",
            "市",
            "地址",
            null,
            null,
            "lt100",
            "123",
            "",
            "",
            "",
            "联系人",
            "+86 123456789",
            "");
    assertEquals(
        400,
        assertThrows(
                BusinessException.class,
                () -> f.service.submit(form, "owner@test.invalid", "context", "zh-CN"))
            .status());
    verify(f.db, never())
        .queryForObject(
            startsWith("INSERT INTO company_application"), eq(Long.class), any(Object[].class));
  }

  @Test
  void approvalDetectsAnAccountCreatedWhileApplicationWasWaiting() {
    var f = new Fixture();
    when(f.db.queryForList(contains("SELECT * FROM company_application"), eq(7L)))
        .thenReturn(
            List.of(
                new HashMap<>(
                    Map.of(
                        "id",
                        7L,
                        "status",
                        "pending",
                        "email",
                        "owner@test.invalid",
                        "language",
                        "zh-CN"))));
    when(f.db.queryForObject(contains("permission_package"), eq(Long.class), any(Object[].class)))
        .thenReturn(1L);
    when(f.db.queryForObject(contains("app_user"), eq(Boolean.class), any(Object[].class)))
        .thenReturn(true);
    assertEquals(
        409,
        assertThrows(
                BusinessException.class,
                () ->
                    f.service.approve(
                        7,
                        new CompanyApplicationService.Approve(
                            List.of(1L), null, null, null, List.of())))
            .status());
    verify(f.db, never())
        .queryForObject(startsWith("INSERT INTO tenant"), eq(Long.class), any(Object[].class));
  }

  @Test
  void approvalRechecksPermissionAfterWaitingForTheTransactionLock() {
    var f = new Fixture();
    doNothing()
        .doThrow(new BusinessException(403, "revoked"))
        .when(f.auth)
        .requirePermission("company.application.review");
    assertEquals(
        403,
        assertThrows(
                BusinessException.class,
                () ->
                    f.service.approve(
                        7,
                        new CompanyApplicationService.Approve(
                            List.of(1L), null, null, null, List.of())))
            .status());
    verify(f.db, never()).queryForList(contains("SELECT * FROM company_application"), eq(7L));
  }

  @Test
  void aDisabledEnterpriseDoesNotOfferSignInEvenIfUserStatusIsStillActive() {
    var row =
        new Fixture()
            .progress("approved", Map.of("account_status", "active", "tenant_enabled", false));
    assertEquals("contact_administrator", row.get("nextAction"));
  }

  @Test
  void concurrentAccountCollisionRollsBackAsAReadableConflict() {
    var f = new Fixture();
    when(f.db.queryForList(contains("SELECT * FROM company_application"), eq(7L)))
        .thenReturn(
            List.of(
                new HashMap<>(
                    Map.of(
                        "id",
                        7L,
                        "status",
                        "pending",
                        "email",
                        "owner@test.invalid",
                        "language",
                        "zh-CN"))));
    when(f.db.queryForObject(contains("permission_package"), eq(Long.class), any(Object[].class)))
        .thenReturn(1L);
    when(f.db.queryForObject(startsWith("INSERT INTO tenant("), eq(Long.class))).thenReturn(42L);
    when(f.db.queryForObject(
            startsWith("INSERT INTO app_user"), eq(Long.class), any(Object[].class)))
        .thenThrow(new org.springframework.dao.DuplicateKeyException("account unique"));
    assertEquals(
        409,
        assertThrows(
                BusinessException.class,
                () ->
                    f.service.approve(
                        7,
                        new CompanyApplicationService.Approve(
                            List.of(1L), null, null, null, List.of())))
            .status());
    verify(f.activation, never()).issue(anyLong());
  }
}
