package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;

class DeviceDetailRulesTest {
  @Test void classifiesAllNineTypesWithoutCollapsingStackClusterAndLoggerEms() {
    String[] types={"Inverter","Energy Storage Cabinet","PCS","Battery Cluster","Battery Stack","Air Conditioner","Smart Meter","Logger","EMS"};
    assertEquals(9,Arrays.stream(types).map(t->DeviceDetailRules.type(t,"OTHER")).distinct().count());
    assertEquals("battery-cluster",DeviceDetailRules.type("Battery Cluster","BMS"));
    assertEquals("battery-stack",DeviceDetailRules.type("Battery Stack","BMS"));
    assertEquals("logger",DeviceDetailRules.type("18_5000","OTHER"));
    assertEquals("ems",DeviceDetailRules.type("18_5001","OTHER"));
    assertEquals("other",DeviceDetailRules.type("unknown","OTHER"));
  }
  @Test void onlyDeviceOwnedUniquePointsCanBeSaved() {
    assertDoesNotThrow(()->DeviceDetailRules.selection(List.of(1L,2L),Set.of(1L,2L,3L)));
    assertThrows(BusinessException.class,()->DeviceDetailRules.selection(List.of(1L,1L),Set.of(1L)));
    assertThrows(BusinessException.class,()->DeviceDetailRules.selection(List.of(99L),Set.of(1L)));
    assertThrows(BusinessException.class,()->DeviceDetailRules.selection(null,Set.of(1L)));
  }
  @Test void localNameplateAllowsOnlyConfirmedNonnegativeTwoDecimalFields() {
    assertDoesNotThrow(()->DeviceDetailRules.theory("battery-cluster",Map.of("loopNum",new BigDecimal("6000"),"theorySoh",new BigDecimal("80.50"))));
    assertThrows(BusinessException.class,()->DeviceDetailRules.theory("battery-cluster",Map.of("loopNum",new BigDecimal("999"),"theorySoh",new BigDecimal("80"))));
    assertThrows(BusinessException.class,()->DeviceDetailRules.theory("battery-cluster",Map.of("loopNum",new BigDecimal("6000"))));
    assertThrows(BusinessException.class,()->DeviceDetailRules.theory("inverter",Map.of("ratedPowerKw",new BigDecimal("1.234"))));
    assertThrows(BusinessException.class,()->DeviceDetailRules.theory("logger",Map.of("ratedPowerKw",BigDecimal.ONE)));
    assertThrows(BusinessException.class,()->DeviceDetailRules.theory("pcs",Map.of("dispatchPower",BigDecimal.ONE)));
  }
  @Test void atMostFourNonemptyUnitsCanShareAHistorySelection() {
    var units=Map.of(1L,"V",2L,"A",3L,"kW",4L,"%",5L,"°C",6L,"");
    assertDoesNotThrow(()->DeviceDetailRules.units(List.of(1L,2L,3L,4L,6L),units));
    assertThrows(BusinessException.class,()->DeviceDetailRules.units(List.of(1L,2L,3L,4L,5L),units));
  }
}
