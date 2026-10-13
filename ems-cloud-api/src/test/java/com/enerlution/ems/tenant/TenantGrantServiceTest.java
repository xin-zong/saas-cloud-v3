package com.enerlution.ems.tenant;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.*;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantGrantServiceTest {
  @Test
  void immediateGrantUsesTheDatabaseClockEvenWhenApiClockIsAhead() {
    var db = mock(JdbcTemplate.class);
    var auth = mock(TenantAuthorization.class);
    when(auth.context()).thenReturn(new TenantContext(1, 2, "enterprise", true));
    when(auth.userId()).thenReturn(1L);
    var databaseTime = OffsetDateTime.parse("2020-01-01T00:00:00Z");
    when(db.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class))
        .thenReturn(databaseTime);
    when(db.queryForObject(
            startsWith("INSERT INTO member_grant"), eq(Long.class), any(Object[].class)))
        .thenReturn(100L);
    var policy = mock(DelegationPolicy.class);
    var service =
        new TenantGrantService(new TenantSupport(db, auth, mock(CapabilityEvents.class)), policy);
    service.create(new TenantGrantService.Grant(7, 9L, null, List.of(4L), null, null));
    verify(policy).assignment(2, 7, 9L, null, List.of(4L), databaseTime, null);
  }
}
