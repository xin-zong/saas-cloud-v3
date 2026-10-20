package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.auth.AccessControl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonMappingException;
import static org.mockito.Mockito.*;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class TariffTemplateServiceTest {
  @Test void deepValleyKeepsItsDistinctBandAndExactUnitPrice() {
    var config=TariffTemplateService.normalize("Deep valley","EUR","tou",List.of(
      new TariffTemplateService.Period(0,360,"deepValley","-0.123456"),
      new TariffTemplateService.Period(360,1440,"valley","0.25")));
    assertEquals("deepValley",config.periods().getFirst().band());
    assertEquals("-0.123456",config.periods().getFirst().pricePerKwh());
    assertEquals("valley",config.periods().getLast().band());
  }
  void bad(org.junit.jupiter.api.function.Executable call){assertEquals(400,assertThrows(BusinessException.class,call).status());}
  TariffTemplateService.Configuration fixed(String price){return TariffTemplateService.normalize(" Solar ","CNY","fixed",List.of(new TariffTemplateService.Period(0,1440,"flat",price)));}
  @Test void normalizesNamesAndExactNegativeZeroAndSixDecimalPricesWithoutRounding(){
    assertEquals("Solar",fixed("-12.345678").name());assertEquals("-12.345678",fixed("-12.345678").periods().getFirst().pricePerKwh());
    assertEquals("0.000000",fixed("0").periods().getFirst().pricePerKwh());assertEquals("99999999.999999",fixed("99999999.999999").periods().getFirst().pricePerKwh());
    assertEquals("-99999999.999999",fixed("-99999999.999999").periods().getFirst().pricePerKwh());
    for(String value:Arrays.asList(null,"","1e2","NaN","+1","1.0000001","100000000","-100000000"," 1"))bad(()->fixed(value));
    bad(()->TariffTemplateService.normalize(" ","CNY","fixed",List.of()));bad(()->TariffTemplateService.normalize("x".repeat(51),"CNY","fixed",List.of()));
    bad(()->TariffTemplateService.normalize("A","cny","fixed",List.of()));bad(()->TariffTemplateService.normalize("A","CNY","dynamic",List.of()));
  }
  @Test void sortsContinuousHalfOpenPeriodsAndRejectsGapsOverlapsOrInvalidFixedConfiguration(){
    var first=new TariffTemplateService.Period(0,720,"peak","1.25");var second=new TariffTemplateService.Period(720,1440,"valley","-0.25");
    var result=TariffTemplateService.normalize("A","USD","tou",List.of(second,first));assertEquals(0,result.periods().getFirst().startMinute());assertEquals("1.250000",result.periods().getFirst().pricePerKwh());
    for(var periods:List.of(List.of(first),List.of(first,first),List.of(new TariffTemplateService.Period(-1,1440,"flat","1")),List.of(new TariffTemplateService.Period(0,1441,"flat","1")),List.of(new TariffTemplateService.Period(0,1440,"unknown","1"))))bad(()->TariffTemplateService.normalize("A","CNY","tou",periods));
    bad(()->TariffTemplateService.normalize("A","CNY","fixed",List.of(first,second)));
    bad(()->TariffTemplateService.normalize("A","CNY","fixed",List.of(new TariffTemplateService.Period(0,1440,"peak","1"))));
    bad(()->TariffTemplateService.normalize("A","CNY","tou",Collections.nCopies(97,first)));
  }
  @Test void futureOnlyBindingsUseShanghaiTomorrowAndAllowOneDayHalfOpenRange(){
    var clock=Clock.fixed(Instant.parse("2026-12-31T16:00:00Z"),ZoneOffset.UTC);
    var today=LocalDate.of(2027,1,1);var tomorrow=today.plusDays(1);
    assertTrue(TariffBindingService.modifiable(tomorrow,clock));assertFalse(TariffBindingService.modifiable(today,clock));
    TariffBindingService.dates(tomorrow,tomorrow.plusDays(1),clock);
    bad(()->TariffBindingService.dates(today,tomorrow,clock));bad(()->TariffBindingService.dates(tomorrow,tomorrow,clock));
    bad(()->TariffBindingService.dates(null,tomorrow,clock));
  }
  @Test void transportRejectsNumericPricesFractionalMinutesAndUnknownFields() throws Exception {
    var json=new ObjectMapper().findAndRegisterModules().disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    assertThrows(JsonMappingException.class,()->json.readValue("{\"startMinute\":0,\"endMinute\":1440,\"band\":\"flat\",\"pricePerKwh\":1.1234567}",TariffTemplateService.Period.class));
    assertThrows(JsonMappingException.class,()->json.readValue("{\"startMinute\":0.5,\"endMinute\":1440,\"band\":\"flat\",\"pricePerKwh\":\"1\"}",TariffTemplateService.Period.class));
    assertThrows(JsonMappingException.class,()->json.readValue("{\"name\":\"A\",\"currency\":\"CNY\",\"pricingMode\":\"fixed\",\"periods\":[],\"unknown\":true}",TariffTemplateService.CreateRequest.class));
    assertThrows(JsonMappingException.class,()->json.readValue("{\"validFrom\":\"2027-01-02\",\"validUntil\":\"2027-01-03\",\"expectedVersion\":1,\"templateId\":\"changed\"}",TariffBindingService.UpdateRequest.class));
    var period=json.readValue("{\"startMinute\":0,\"endMinute\":1440,\"band\":\"flat\",\"pricePerKwh\":\"-0.000001\"}",TariffTemplateService.Period.class);
    assertEquals("-0.000001",period.pricePerKwh());
  }
  @Test void templateAndBindingPermissionsAreCheckedBeforeAnyDatabaseAccess(){
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var support=new DomainSupport(db,access);
    var templates=new TariffTemplateService(support);var bindings=new TariffBindingService(support,Clock.systemUTC());
    doThrow(new BusinessException(403,"denied")).when(access).requirePermission("tariff.manage");
    assertEquals(403,assertThrows(BusinessException.class,templates::list).status());
    assertEquals(403,assertThrows(BusinessException.class,()->templates.create(null)).status());
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"tariff.manage");
    assertEquals(403,assertThrows(BusinessException.class,()->bindings.list(101,true)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->bindings.create(101,null)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->bindings.update(101,1,null)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->bindings.unbind(101,1,1L)).status());
    assertEquals(403,assertThrows(BusinessException.class,()->bindings.history(101,1)).status());
    verifyNoInteractions(db);
  }
}
