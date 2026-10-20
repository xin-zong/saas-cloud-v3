package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import com.enerlution.ems.common.BusinessException;
class AlarmRecoveryHoursTest {
 private AlarmRuleService.Draft draft(Integer hours){var condition=new AlarmRules.Condition(List.of(new AlarmRules.Field("temperature","C","INSTANT","DEVICE")),"self",1,"gt",BigDecimal.ONE,null,null,true,false,false);return new AlarmRuleService.Draft(9,"Temperature","DEVICE",19L,"minor",List.of(condition),0,1440,37,"",new AlarmRuleService.Notification(false,10,List.of(),List.of(),false),1,hours);}
 @Test void defaultAndBoundaryHoursAreIndependentOfNormalSamplingSeconds(){assertEquals(48,draft(null).autoRecoveryDuration());for(int hours:List.of(1,48,72)){var d=draft(hours);assertDoesNotThrow(()->AlarmRuleService.validate(d));assertEquals(37,d.recoveryDuration());assertEquals(hours,d.autoRecoveryDuration());}for(int hours:List.of(0,73,-1))assertThrows(BusinessException.class,()->AlarmRuleService.validate(draft(hours)));}
 @Test void recoveryHoursRejectFractionalJson() throws Exception {var json=new com.fasterxml.jackson.databind.ObjectMapper();assertThrows(com.fasterxml.jackson.databind.JsonMappingException.class,()->json.readValue("{\"autoRecoveryDuration\":1.5}",AlarmRuleService.Draft.class));}
}
