package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StationGenerationPlanServiceTest {
  final JdbcTemplate db = mock(JdbcTemplate.class);
  final AccessControl access = mock(AccessControl.class);
  // Shanghai has already entered 2027 while the UTC date remains in 2026.
  final Clock clock = Clock.fixed(Instant.parse("2026-12-31T16:00:00Z"),ZoneOffset.UTC);
  final StationGenerationPlanService plans = new StationGenerationPlanService(new DomainSupport(db,access),clock);
  static List<StationGenerationPlanService.Month> months() {
    return IntStream.rangeClosed(1,12).mapToObj(month -> new StationGenerationPlanService.Month(month,"1",null)).toList();
  }
  static void bad(org.junit.jupiter.api.function.Executable action) {
    assertEquals(400,assertThrows(BusinessException.class,action).status());
  }
  List<StationGenerationPlanService.Month> value(String planned,String excellent) {
    var values = new ArrayList<>(months());
    values.set(0,new StationGenerationPlanService.Month(1,planned,excellent));
    return values;
  }
  @Test void requiresEveryMonthExactlyOnceAndReturnsCalendarOrder() {
    var reversed = new ArrayList<>(months()); Collections.reverse(reversed);
    var result = StationGenerationPlanService.normalizeMonths(reversed);
    assertEquals(12,result.size()); assertEquals(1,result.getFirst().month()); assertEquals(12,result.getLast().month());
    bad(() -> StationGenerationPlanService.normalizeMonths(null));
    bad(() -> StationGenerationPlanService.normalizeMonths(months().subList(0,11)));
    var duplicate = new ArrayList<>(months()); duplicate.set(11,duplicate.getFirst());
    bad(() -> StationGenerationPlanService.normalizeMonths(duplicate));
    for (int month : List.of(0,13)) {
      var values = new ArrayList<>(months()); values.set(0,new StationGenerationPlanService.Month(month,"1",null));
      bad(() -> StationGenerationPlanService.normalizeMonths(values));
    }
    var missing = new ArrayList<>(months()); missing.set(0,null);
    bad(() -> StationGenerationPlanService.normalizeMonths(missing));
  }
  @Test void decimalValuesAreExactBoundedAndCanonicalWithOptionalExcellent() {
    var result = StationGenerationPlanService.normalizeMonths(value("0.01","99999999.99"));
    assertEquals("0.01",result.getFirst().plannedKwh());
    assertEquals("99999999.99",result.getFirst().excellentKwh());
    assertEquals("1.00",result.get(1).plannedKwh()); assertNull(result.get(1).excellentKwh());
    assertEquals("10.10",StationGenerationPlanService.normalizeMonths(value("0010.1",null)).getFirst().plannedKwh());
    for (String invalid : Arrays.asList(null,"","0","-1","0.001","1.000","100000000","NaN","1e2","+1")) {
      bad(() -> StationGenerationPlanService.normalizeMonths(value(invalid,null)));
      if (invalid != null) bad(() -> StationGenerationPlanService.normalizeMonths(value("1",invalid)));
    }
  }
  @Test void newYearWindowUsesShanghaiAndIncludesBothEndpoints() {
    assertEquals(2007,plans.validateNewYear(2007)); assertEquals(2047,plans.validateNewYear(2047));
    for (Integer year : Arrays.asList(null,2006,2048)) bad(() -> plans.validateNewYear(year));
  }
  @Test void readRequiresStationReadScopeBeforeAnyDatabaseAccess() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.read");
    assertEquals(403,assertThrows(BusinessException.class,()->plans.list(101,null)).status());
    verifyNoInteractions(db);
  }
  @Test void everyWriteRequiresBothStationReadAndEditScope() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.edit");
    UUID id = UUID.randomUUID();
    assertEquals(403,assertThrows(BusinessException.class,()->plans.create(101,new StationGenerationPlanService.CreateRequest(2027,months()))).status());
    assertEquals(403,assertThrows(BusinessException.class,()->plans.update(101,id,new StationGenerationPlanService.UpdateRequest(months(),1L))).status());
    assertEquals(403,assertThrows(BusinessException.class,()->plans.delete(101,id,1L)).status());
    verify(access,times(3)).requireStationPermission(101,"asset.read");
    verifyNoInteractions(db);
  }
  @Test void editingAndDeletionRequirePositiveExpectedVersionBeforeAnyDatabaseAccess() {
    for (Long version : Arrays.asList(null,0L,-1L)) {
      bad(() -> plans.update(101,UUID.randomUUID(),new StationGenerationPlanService.UpdateRequest(months(),version)));
      bad(() -> plans.delete(101,UUID.randomUUID(),version));
    }
    verifyNoInteractions(db);
  }
  @Test void transportRequiresDecimalStringsAndRejectsAttemptsToEditYear() {
    var json = new ObjectMapper().disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    assertThrows(JsonMappingException.class, () -> json.readValue(
        "{\"month\":1,\"plannedKwh\":1.25,\"excellentKwh\":null}",StationGenerationPlanService.Month.class));
    assertThrows(JsonMappingException.class, () -> json.readValue(
        "{\"month\":1,\"plannedKwh\":\"1.25\",\"excellentKwh\":2}",StationGenerationPlanService.Month.class));
    assertThrows(JsonMappingException.class, () -> json.readValue(
        "{\"year\":2028,\"months\":[],\"expectedVersion\":1}",StationGenerationPlanService.UpdateRequest.class));
  }
}
