package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class ReportTemplateJobServiceTest {
  final AnalysisJobService jobs=new AnalysisJobService(new DomainSupport(mock(JdbcTemplate.class),mock(AccessControl.class)),new ObjectMapper(),mock(EmsTelemetryQueries.class));
  AnalysisJobService.JobRequest request(String kind,List<String> points,String id,Long version) { return new AnalysisJobService.JobRequest(kind,"2026-09-01T00:00:00Z","2026-09-02T00:00:00Z",null,points,id,version); }
  void bad(AnalysisJobService.JobRequest request) { assertEquals(400,assertThrows(BusinessException.class,()->jobs.validate(request)).status()); }
  @Test void optionalTemplateRequiresPairedPositiveVersionAndForbidsExtraPoints() {
    String id=UUID.randomUUID().toString();
    bad(request("operations",List.of(),id,null));bad(request("operations",List.of(),null,1L));
    bad(request("operations",List.of(),id,0L));bad(request("operations",List.of("19"),id,1L));
    bad(request("telemetry",List.of("19"),id,1L));
    assertNotNull(jobs.validate(request("operations",List.of(),id,1L)));
    assertNotNull(jobs.validate(request("operations",List.of("19"),null,null)));
  }
}
