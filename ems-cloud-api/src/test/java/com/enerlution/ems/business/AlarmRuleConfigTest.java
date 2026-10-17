package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
class AlarmRuleConfigTest {
  AlarmRuleService.Draft draft(int start,int end,AlarmRuleService.Notification n){return new AlarmRuleService.Draft(9,"温度告警","DEVICE",17L,"warning",List.of(new AlarmRules.Condition(List.of(new AlarmRules.Field("temp","°C","INSTANT","DEVICE")),"self",1,"gt",new BigDecimal("50"),null,null,true,false,false)),start,end,30,"检查温度",n,1);}
  AlarmRuleService.Notification disabled(){return new AlarmRuleService.Notification(false,1,List.of(),List.of(),false);}
  @Test void onlyQuarterHourWindowsAndActualNotificationRecipientsAreAccepted(){
    assertThrows(BusinessException.class,()->AlarmRuleService.validate(draft(1,1440,disabled())));
    assertThrows(BusinessException.class,()->AlarmRuleService.validate(draft(30,15,disabled())));
    assertThrows(BusinessException.class,()->AlarmRuleService.validate(draft(0,1440,new AlarmRuleService.Notification(true,1,List.of("email"),List.of(),true))));
    assertDoesNotThrow(()->AlarmRuleService.validate(draft(0,1440,disabled())));
  }
  @Test void invalidNullChannelAndNumericStatusThresholdReturnValidationNotServerError(){
    assertThrows(BusinessException.class,()->AlarmRuleService.validate(draft(0,1440,new AlarmRuleService.Notification(true,1,Arrays.asList((String)null),List.of(7L),false))));
    assertThrows(BusinessException.class,()->AlarmRules.validate(new AlarmRules.Condition(List.of(new AlarmRules.Field("deviceStatus","","INSTANT","DEVICE")),"self",1,"eq",BigDecimal.ONE,null,"online",true,false,false)));
  }
}
