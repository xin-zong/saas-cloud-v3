package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.SpringValidatorAdapter;

class AlarmRuleInputValidationTest {
  private final ObjectMapper json = new ObjectMapper();

  @Test void missingOrNullConditionFieldObjectTypeIsBadRequestRatherThanNullPointer() throws Exception {
    for (String fieldJson : List.of(
        "{\"code\":\"temperature\",\"unit\":\"C\",\"cycleType\":\"INSTANT\"}",
        "{\"code\":\"temperature\",\"unit\":\"C\",\"cycleType\":\"INSTANT\",\"objectType\":null}")) {
      var field = json.readValue(fieldJson, AlarmRules.Field.class);
      var condition = new AlarmRules.Condition(List.of(field), "self", 1, "gt",
          BigDecimal.ONE, null, null, true, false, false);
      var draft = new AlarmRuleService.Draft(9, "temperature", "DEVICE", 19L, "warning",
          List.of(condition), 0, 1440, 0, "",
          new AlarmRuleService.Notification(false, 1, List.of(), List.of(), false), 1);
      var failure = assertThrows(BusinessException.class, () -> AlarmRuleService.validate(draft));
      assertEquals(400, failure.status());
    }
  }

  @Test void omittedOrNullEnabledCannotDisableRuleThroughControllerBinding() throws Exception {
    var service = mock(AlarmRuleService.class);
    try (var factory = Validation.buildDefaultValidatorFactory()) {
      var mvc = MockMvcBuilders.standaloneSetup(new AlarmRuleController(service))
          .setValidator(new SpringValidatorAdapter(factory.getValidator())).build();
      for (String payload : List.of("{\"expectedVersion\":1}",
          "{\"expectedVersion\":1,\"enabled\":null}")) {
        mvc.perform(post("/api/alarm-rules/3/enabled").contentType(MediaType.APPLICATION_JSON)
            .content(payload)).andExpect(status().isBadRequest());
      }
      verifyNoInteractions(service);
    }
  }

  @Test void explicitTrueAndFalseRemainValidToggleCommands() throws Exception {
    var service = mock(AlarmRuleService.class);
    when(service.toggle(3, 1, true)).thenReturn(Map.of("id", 3, "enabled", true));
    when(service.toggle(3, 1, false)).thenReturn(Map.of("id", 3, "enabled", false));
    try (var factory = Validation.buildDefaultValidatorFactory()) {
      var mvc = MockMvcBuilders.standaloneSetup(new AlarmRuleController(service))
          .setValidator(new SpringValidatorAdapter(factory.getValidator())).build();
      for (String value : List.of("true", "false")) {
        mvc.perform(post("/api/alarm-rules/3/enabled").contentType(MediaType.APPLICATION_JSON)
            .content("{\"expectedVersion\":1,\"enabled\":" + value + "}"))
            .andExpect(status().isOk());
      }
    }
  }
}
