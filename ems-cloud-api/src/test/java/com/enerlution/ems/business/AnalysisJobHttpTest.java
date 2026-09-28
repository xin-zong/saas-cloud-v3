package com.enerlution.ems.business;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AnalysisJobHttpTest {
  MockMvc mvc() {
    var access=mock(AccessControl.class);
    when(access.userId()).thenReturn(7L);
    doThrow(new BusinessException(403,"Station permission denied")).when(access).requireStationPermission(102,"telemetry.read");
    var service=new AnalysisJobService(new DomainSupport(mock(JdbcTemplate.class),access),
        new ObjectMapper().findAndRegisterModules(),mock(EmsTelemetryQueries.class));
    return MockMvcBuilders.standaloneSetup(new AnalysisJobController(service)).setControllerAdvice(new ApiExceptionHandler()).build();
  }
  @Test void creationRejectsMissingOffsetAndUnsupportedGrainThroughActualServiceValidation() throws Exception {
    mvc().perform(post("/api/stations/101/analysis-jobs").contentType("application/json")
        .content("{\"kind\":\"telemetry\",\"from\":\"2026-09-01T00:00:00\",\"to\":\"2026-09-02T00:00:00Z\",\"minutes\":0,\"pointIds\":[\"19\"]}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(400));
    mvc().perform(post("/api/stations/101/analysis-jobs").contentType("application/json")
        .content("{\"kind\":\"telemetry\",\"from\":\"2026-09-01T00:00:00Z\",\"to\":\"2026-09-02T00:00:00Z\",\"minutes\":2,\"pointIds\":[\"19\"]}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(400));
  }
  @Test void creationEnforcesRouteStationAuthorizationBeforeSavingOrQueryingData() throws Exception {
    mvc().perform(post("/api/stations/102/analysis-jobs").contentType("application/json")
        .content("{\"kind\":\"telemetry\",\"from\":\"2026-09-01T00:00:00Z\",\"to\":\"2026-09-02T00:00:00Z\",\"minutes\":0,\"pointIds\":[\"19\"]}"))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.data").doesNotExist());
  }
  @Test void listRejectsUnboundedPaginationBeforeDatabaseRead() throws Exception {
    mvc().perform(get("/api/stations/101/analysis-jobs?limit=201&offset=0"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(400));
  }
  @Test void rejectsFractionalMinutesInsteadOfSilentlyRoundingRequest() throws Exception {
    mvc().perform(post("/api/stations/102/analysis-jobs").contentType("application/json")
        .content("{\"kind\":\"telemetry\",\"from\":\"2026-09-01T00:00:00Z\",\"to\":\"2026-09-02T00:00:00Z\",\"minutes\":1.5,\"pointIds\":[\"19\"]}"))
        .andExpect(status().isBadRequest());
  }
}
