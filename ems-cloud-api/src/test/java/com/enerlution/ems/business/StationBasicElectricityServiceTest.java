package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import org.junit.jupiter.api.Test;
class StationBasicElectricityServiceTest {
 @Test void getRechecksPermissionAfterRead(){
  var access=org.mockito.Mockito.mock(com.enerlution.ems.auth.AccessControl.class);
  var db=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
  org.mockito.Mockito.doNothing().doThrow(new BusinessException(403,"revoked")).when(access).requireStationPermission(101,"tariff.manage");
  var service=new StationBasicElectricityService(new DomainSupport(db,access));
  assertEquals(403,assertThrows(BusinessException.class,()->service.get(101)).status());
 }
 @Test void jsonRejectsForgedStationAndNonIntegerVersion() throws Exception{
  var json=new com.fasterxml.jackson.databind.ObjectMapper();
  assertEquals(0L,json.readValue("{\"pricePolicy\":\"single\",\"consumerNumber\":\"\",\"expectedVersion\":0}",StationBasicElectricityService.Request.class).expectedVersion());
  for(String value:java.util.List.of("{\"stationId\":102}","{\"expectedVersion\":\"0\"}","{\"expectedVersion\":0.5}"))assertThrows(com.fasterxml.jackson.databind.JsonMappingException.class,()->json.readValue(value,StationBasicElectricityService.Request.class));
 }
 private StationBasicElectricityService.Request r(String policy,String type,String capacity,String demand,Long version){return new StationBasicElectricityService.Request(policy,type,capacity,demand,"",version);}
 @Test void requiredVersionsPoliciesAndConditionalFields(){
  assertDoesNotThrow(()->StationBasicElectricityService.validate(r("single",null,null,null,0L)));
  assertDoesNotThrow(()->StationBasicElectricityService.validate(r("two-part","actual-demand",null,null,2L)));
  for(var value:java.util.List.of(r("single",null,null,null,null),r("single",null,null,null,-1L),r("single","capacity","1",null,0L),r("two-part","capacity",null,null,0L),r("two-part","actual-demand","0",null,0L),r("two-part","contract-demand","1","2",0L),r("unknown",null,null,null,0L)))assertEquals(400,assertThrows(BusinessException.class,()->StationBasicElectricityService.validate(value)).status());
 }
 @Test void acceptsZeroAndLimitsWithoutUnitConversionOrRounding(){
  for(String value:java.util.List.of("0","0.00","65535","65534.99")){
   assertDoesNotThrow(()->StationBasicElectricityService.validate(r("two-part","capacity",value,null,0L)));
   assertDoesNotThrow(()->StationBasicElectricityService.validate(r("two-part","contract-demand",null,value,1L)));
  }
  assertEquals(0,StationBasicElectricityService.decimal("0").signum());
  for(String value:java.util.List.of("","-1","65535.01","1.001","1e2","NaN"," 1"))assertThrows(BusinessException.class,()->StationBasicElectricityService.decimal(value));
  assertThrows(BusinessException.class,()->StationBasicElectricityService.validate(new StationBasicElectricityService.Request("single",null,null,null,"x".repeat(51),0L)));
 }
}
