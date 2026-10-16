package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.sql.Connection;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** The clock advances exactly when lock acquisition returns, without a real connection or sleep. */
class TariffBindingTimeTest {
  static final String LOCK_SQL="SELECT pg_advisory_xact_lock(hashtextextended(?,0))";
  static final LocalDate REQUEST_FROM=LocalDate.of(2027,1,1);
  static class MutableClock extends Clock {
    final AtomicReference<Instant> now;final ZoneId zone;
    MutableClock(){this(new AtomicReference<>(Instant.parse("2026-12-31T15:59:59Z")),ZoneOffset.UTC);}
    MutableClock(AtomicReference<Instant> now,ZoneId zone){this.now=now;this.zone=zone;}
    void crossShanghaiMidnight(){now.set(Instant.parse("2026-12-31T16:00:00Z"));}
    @Override public ZoneId getZone(){return zone;}
    @Override public Clock withZone(ZoneId zone){return new MutableClock(now,zone);}
    @Override public Instant instant(){return now.get();}
  }
  static class Fixture {
    final MutableClock clock=new MutableClock();final JdbcTemplate db=mock(JdbcTemplate.class);
    final AccessControl access=mock(AccessControl.class);final UUID template=UUID.randomUUID();
    final TariffBindingService service;
    Fixture(boolean crossOnRowLock)throws Exception{
      var connection=mock(Connection.class);when(connection.getAutoCommit()).thenReturn(true);
      var ds=mock(DataSource.class);when(ds.getConnection()).thenReturn(connection);when(db.getDataSource()).thenReturn(ds);
      when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
      var support=new DomainSupport(db,access){
        @Override public Map<String,Object> one(String sql,Object... args){
          if(sql.startsWith("SELECT version,archived"))return Map.of("version",1L,"archived",false);
          if(sql.startsWith("SELECT tenant_id"))return Map.of("tenant_id",11L);
          if(sql.startsWith("SELECT valid_from,active,version")){
            if(crossOnRowLock)clock.crossShanghaiMidnight();
            return Map.of("valid_from",java.sql.Date.valueOf("2027-01-03"),"active",true,"version",1L);
          }
          throw new AssertionError("Unexpected fixture lookup");
        }
      };
      doReturn(1L).when(db).queryForObject("SELECT tariff_id FROM tariff_template_version WHERE template_id=? AND version=?",Long.class,template,1L);
      // A sentinel records an unsafe write attempt, rather than allowing missing-row stubs to hide it.
      doThrow(new BusinessException(599,"unsafe insert attempted")).when(db).queryForObject(startsWith("INSERT INTO station_tariff"),eq(Long.class),any(Object[].class));
      doThrow(new BusinessException(599,"unsafe update attempted")).when(db).update(startsWith("UPDATE station_tariff"),any(Object[].class));
      service=new TariffBindingService(support,clock);
    }
  }
  @Test void createRechecksDatesAfterBothStationAndTemplateLocksReturn()throws Exception{
    var fixture=new Fixture(false);
    doAnswer(call->{fixture.clock.crossShanghaiMidnight();return null;}).when(fixture.db).queryForObject(LOCK_SQL,Object.class,"tariff-template:11");
    var request=new TariffBindingService.CreateRequest(fixture.template,1L,REQUEST_FROM,REQUEST_FROM.plusDays(1));
    assertEquals(400,assertThrows(BusinessException.class,()->fixture.service.create(101,request)).status());
    verify(fixture.db,never()).queryForObject(startsWith("INSERT INTO station_tariff"),eq(Long.class),any(Object[].class));
  }
  @Test void updateRechecksRequestedDatesAfterBindingRowLockEvenWhenExistingStartRemainsFuture()throws Exception{
    var fixture=new Fixture(true);
    var request=new TariffBindingService.UpdateRequest(REQUEST_FROM,REQUEST_FROM.plusDays(1),1L);
    assertEquals(400,assertThrows(BusinessException.class,()->fixture.service.update(101,1,request)).status());
    verify(fixture.db,never()).update(startsWith("UPDATE station_tariff"),any(Object[].class));
  }
}
