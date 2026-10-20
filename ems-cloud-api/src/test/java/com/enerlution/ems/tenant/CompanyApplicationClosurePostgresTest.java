package com.enerlution.ems.tenant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.*;
import org.springframework.transaction.support.DefaultTransactionDefinition;

/**
 * Explicit new-DB opt-in only. Every application/account/mail record is rolled back; no SMTP call.
 */
@EnabledIfEnvironmentVariable(named = "EMS_TOYINGZHEN_TESTS", matches = "true")
class CompanyApplicationClosurePostgresTest {
  JdbcTemplate db;
  DataSourceTransactionManager manager;
  TransactionStatus outer;
  CompanyApplicationService applications;
  EmailChallengeService email;
  ActivationService activation;
  MailDeliveryService mail;
  SecretCodec secrets;
  JavaMailSender sender;
  long packageId;
  String address, context;

  @BeforeEach
  void setup() throws Exception {
    var ds =
        new DriverManagerDataSource(
            required("EMS_TOYINGZHEN_DB_URL"),
            required("EMS_TOYINGZHEN_DB_USER"),
            required("EMS_TOYINGZHEN_DB_PASSWORD"));
    db = new JdbcTemplate(ds);
    assertEquals(
        "ems_cloud_saas_toyingzhen", db.queryForObject("SELECT current_database()", String.class));
    assertEquals("ems_toyingzhen_owner", db.queryForObject("SELECT current_user", String.class));
    assertEquals(
        Boolean.TRUE,
        db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND"
                + " table_name='company_application' AND column_name='language')",
            Boolean.class),
        "Apply the guarded V68 migration before opting into this test");
    manager = new DataSourceTransactionManager(ds);
    outer = manager.getTransaction(new DefaultTransactionDefinition());
    var actor =
        db.queryForMap(
            "SELECT u.id,u.tenant_id FROM app_user u JOIN tenant t ON t.id=u.tenant_id WHERE"
                + " t.kind='platform' AND u.status='active' AND t.enabled ORDER BY u.id LIMIT 1");
    long actorId = ((Number) actor.get("id")).longValue(),
        tenantId = ((Number) actor.get("tenant_id")).longValue();
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(actorId, tenantId, "platform", true));
    when(auth.userId()).thenReturn(actorId);
    var support = new TenantSupport(db, auth, mock(CapabilityEvents.class));
    secrets = new SecretCodec(Base64.getEncoder().encodeToString(new byte[32]));
    @SuppressWarnings("unchecked")
    ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
    sender = mock(JavaMailSender.class);
    when(provider.getIfAvailable()).thenReturn(sender);
    mail = new MailDeliveryService(db, secrets, provider, "test@test.invalid", "http://127.0.0.1");
    var encoder = new BCryptPasswordEncoder(4);
    activation = new ActivationService(db, encoder, mock(SessionTokens.class));
    email = new EmailChallengeService(db, mail);
    applications =
        new CompanyApplicationService(db, support, email, activation, mail, secrets, encoder);
    packageId =
        db.queryForObject(
            "SELECT id FROM permission_package WHERE enabled ORDER BY id LIMIT 1", Long.class);
    address = "onboarding-" + UUID.randomUUID() + "@test.invalid";
    UUID challenge = email.request(address, "zh-CN", "test-" + UUID.randomUUID());
    var payload =
        new ObjectMapper()
            .readTree(
                secrets.decrypt(
                    db.queryForObject(
                        "SELECT payload_ciphertext FROM mail_delivery WHERE event_key=?",
                        String.class,
                        "email-code:" + challenge)));
    context = email.verify(challenge, payload.get("code").asText()).get("context");
  }

  static String required(String key) {
    return Objects.requireNonNull(System.getenv(key), key + " must be set");
  }

  CompanyForm form() {
    return new CompanyForm(
        "验收入驻企业",
        List.of("operator"),
        List.of("commercial"),
        "CN",
        "安徽",
        "合肥",
        "验收地址",
        null,
        null,
        "lt100",
        "230000",
        "验收业务",
        "",
        "",
        "测试联系人",
        "+86 123456789",
        "");
  }

  Map<String, Object> progress() {
    return applications.progress(address, context).getFirst();
  }

  @AfterEach
  void rollback() {
    if (outer != null) manager.rollback(outer);
    if (sender != null) verifyNoInteractions(sender);
  }

  @Test
  void verifiedApplicationApprovalAndOneTimeActivationRoundTripWithoutSendingEmail()
      throws Exception {
    var submitted = applications.submit(form(), address, context, "zh-CN");
    long id = ((Number) submitted.get("id")).longValue();
    assertEquals("await_review", progress().get("nextAction"));
    assertEquals(
        "zh-CN",
        db.queryForObject("SELECT language FROM company_application WHERE id=?", String.class, id));
    var approved =
        applications.approve(
            id,
            new CompanyApplicationService.Approve(List.of(packageId), null, null, null, List.of()));
    long tenant = ((Number) approved.get("tenantId")).longValue();
    assertEquals("wait_for_email", progress().get("nextAction"));
    var mail =
        db.queryForMap(
            "SELECT m.id,m.language,m.payload_ciphertext FROM mail_delivery m JOIN app_user u ON"
                + " m.event_key LIKE 'activation:'||u.id||':%' WHERE u.tenant_id=? ORDER BY m.id"
                + " DESC LIMIT 1",
            tenant);
    assertEquals("zh-CN", mail.get("language"));
    String url =
        new ObjectMapper()
            .readTree(secrets.decrypt((String) mail.get("payload_ciphertext")))
            .get("url")
            .asText();
    String token = url.substring(url.indexOf("#activate=") + 10);
    db.update("UPDATE mail_delivery SET status='sent',sent_at=now() WHERE id=?", mail.get("id"));
    assertEquals("check_activation_email", progress().get("nextAction"));
    assertEquals(address, activation.inspect(token).get("account"));
    activation.accept(token, "StrongPassword9");
    assertEquals("sign_in", progress().get("nextAction"));
    assertEquals(
        400,
        assertThrows(BusinessException.class, () -> activation.accept(token, "StrongPassword9"))
            .status());
    assertEquals(
        409,
        assertThrows(
                BusinessException.class,
                () ->
                    applications.approve(
                        id,
                        new CompanyApplicationService.Approve(
                            List.of(packageId), null, null, null, List.of())))
            .status());
    assertEquals(
        1,
        db.queryForObject("SELECT count(*) FROM app_user WHERE account=?", Integer.class, address));
    assertEquals(
        2, ((List<?>) applications.progress(address, context).getFirst().get("events")).size());
    assertEquals(
        401,
        assertThrows(
                BusinessException.class, () -> applications.progress("other@test.invalid", context))
            .status());
  }

  @Test
  void rejectionReasonIsQueryableAndApplicantCanSubmitAgain() {
    long id =
        ((Number) applications.submit(form(), address, context, "zh-CN").get("id")).longValue();
    applications.reject(id, "请补充材料");
    var rejected = progress();
    assertEquals("reapply", rejected.get("nextAction"));
    assertTrue(rejected.get("events").toString().contains("请补充材料"));
    assertEquals(
        "zh-CN",
        db.queryForObject(
            "SELECT language FROM mail_delivery WHERE event_key=?",
            String.class,
            "rejected:" + id));
    applications.submit(form(), address, context, "zh-CN");
    assertEquals("await_review", progress().get("nextAction"));
    assertEquals(
        2,
        db.queryForObject(
            "SELECT count(*) FROM company_application WHERE email=?", Integer.class, address));
  }

  @Test
  void aSecondServiceInstanceUsesDatabaseCooldownAndCannotInvalidateVerifiedContext() {
    var another = new EmailChallengeService(db, mail);
    assertEquals(
        429,
        assertThrows(
                BusinessException.class,
                () -> another.request(address, "zh-CN", "another-instance"))
            .status());
    assertEquals(address, email.requireContext(context, address));
    assertEquals(
        1,
        db.queryForObject(
            "SELECT count(*) FROM email_challenge WHERE email=?", Integer.class, address));
  }

  @Test
  void expiredActivationAndFailedDeliveryAreShownAsActionableProgress() {
    long id =
        ((Number) applications.submit(form(), address, context, "zh-CN").get("id")).longValue();
    long tenant =
        ((Number)
                applications
                    .approve(
                        id,
                        new CompanyApplicationService.Approve(
                            List.of(packageId), null, null, null, List.of()))
                    .get("tenantId"))
            .longValue();
    db.update(
        "UPDATE account_activation SET created_at=now()-interval '3 days',expires_at=now()-interval"
            + " '1 day' WHERE user_id IN(SELECT id FROM app_user WHERE tenant_id=?)",
        tenant);
    db.update(
        "UPDATE mail_delivery SET status='failed',last_error='PrivateProviderDetail' WHERE"
            + " event_key LIKE 'activation:'||(SELECT id FROM app_user WHERE tenant_id=?)||':%'",
        tenant);
    var row = progress();
    assertEquals("expired", row.get("activationStatus"));
    assertEquals("failed", row.get("mailStatus"));
    assertEquals("contact_administrator", row.get("nextAction"));
    assertFalse(row.toString().contains("PrivateProviderDetail"));
    assertFalse(row.toString().contains("payload_ciphertext"));
  }
}
