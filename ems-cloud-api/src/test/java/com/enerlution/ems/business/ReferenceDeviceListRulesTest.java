package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
class ReferenceDeviceListRulesTest {
 @Test void missingConflictAndFutureSamplesNeverBecomeMeasurements(){
  var zero=new HashMap<String,Object>(Map.of("name","功率","unit","kW","value",0,"quality","valid","sourceTime",1000L,"staleReason","source_older_than_90_seconds"));
  assertEquals(0,ReferenceDeviceListService.point(zero).get("value"));
  assertEquals(true,ReferenceDeviceListService.point(zero).get("stale"));
  zero.put("conflict",true);assertNull(ReferenceDeviceListService.point(zero).get("value"));
  zero.put("conflict",false);zero.put("staleReason","future_source_time");assertNull(ReferenceDeviceListService.point(zero).get("value"));
  zero.remove("staleReason");zero.put("quality","invalid");assertNull(ReferenceDeviceListService.point(zero).get("value"));
 }
 @Test void columnConfigurationRejectsUnknownCategoryColumnAndDuplicates(){
  assertDoesNotThrow(()->ReferenceDeviceListService.validateColumns(Map.of("inverter",List.of("name","pvPower"),"meter",List.of("name","application"))));
  assertThrows(BusinessException.class,()->ReferenceDeviceListService.validateColumns(Map.of("other",List.of("name"))));
  assertThrows(BusinessException.class,()->ReferenceDeviceListService.validateColumns(Map.of("inverter",List.of("secret"))));
  assertThrows(BusinessException.class,()->ReferenceDeviceListService.validateColumns(Map.of("inverter",List.of("name","name"))));
  assertThrows(BusinessException.class,()->ReferenceDeviceListService.validateColumns(List.of("name")));
 }
}
