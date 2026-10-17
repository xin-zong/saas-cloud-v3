package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
class AlarmRulesTest {
  private AlarmRules.Condition condition(String op, BigDecimal lower, BigDecimal upper) {
    return new AlarmRules.Condition(List.of(new AlarmRules.Field("temperature","°C","INSTANT","DEVICE")), "self",1,op,lower,upper,null,true,false,false);
  }
  @Test void invalidIntervalsAndUnsupportedCyclesCannotBeSaved() {
    assertThrows(BusinessException.class,()->AlarmRules.validate(condition("bet",new BigDecimal("5"),new BigDecimal("5"))));
    assertThrows(BusinessException.class,()->AlarmRules.validate(condition("lt",null,null)));
    assertThrows(BusinessException.class,()->AlarmRules.validate(new AlarmRules.Condition(List.of(new AlarmRules.Field("x","kW","INSTANT","DEVICE")),"self",2,"gt",BigDecimal.ONE,null,null,true,false,false)));
    assertDoesNotThrow(()->AlarmRules.validate(condition("bet",null,new BigDecimal("5"))));
  }
  @Test void dualFieldsMustBeDistinctCompatibleAndUseDifferenceRate() {
    var x=new AlarmRules.Field("x","kW","DAY_00","DEVICE");
    var y=new AlarmRules.Field("y","kWh","DAY_00","DEVICE");
    assertThrows(BusinessException.class,()->AlarmRules.validate(new AlarmRules.Condition(List.of(x,y),"dpc_rate",3,"gt",BigDecimal.ONE,null,null,true,false,false)));
    assertThrows(BusinessException.class,()->AlarmRules.validate(new AlarmRules.Condition(List.of(x,x),"dpc_rate",3,"gt",BigDecimal.ONE,null,null,true,false,false)));
  }
  @Test void manualCloseDoesNotBecomeAutomaticRecoveryAndOnlyTerminalAlarmsDelete() {
    assertEquals("active",AlarmRules.lifecycle(null,null));
    assertEquals("closed",AlarmRules.lifecycle(null,"now"));
    assertEquals("recovered",AlarmRules.lifecycle("now",null));
    assertThrows(BusinessException.class,()->AlarmRules.action("delete","active",1,1));
    assertThrows(BusinessException.class,()->AlarmRules.action("close","recovered",1,1));
    assertThrows(BusinessException.class,()->AlarmRules.action("close","active",2,1));
    assertDoesNotThrow(()->AlarmRules.action("delete","closed",2,2));
  }
  @Test void statusAndPowerFactorHaveRestrictedOperators() {
    assertThrows(BusinessException.class,()->AlarmRules.validate(new AlarmRules.Condition(List.of(new AlarmRules.Field("deviceStatus","","INSTANT","DEVICE")),"self",1,"gt",BigDecimal.ONE,null,null,true,false,false)));
    assertThrows(BusinessException.class,()->AlarmRules.validate(new AlarmRules.Condition(List.of(new AlarmRules.Field("dPF","","DAY_00","DEVICE")),"self",1,"gt",BigDecimal.ONE,null,null,true,false,false)));
  }
}
