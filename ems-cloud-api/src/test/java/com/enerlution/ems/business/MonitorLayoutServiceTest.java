package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
class MonitorLayoutServiceTest {
 @Test void validatesGeometryAndUniqueCardIdentity() {
  var a=new MonitorLayoutService.Widget("站点运营概况",0,0,6,2);
  assertEquals(List.of(a),MonitorLayoutService.validate(List.of(a)));
  assertThrows(BusinessException.class,()->MonitorLayoutService.validate(List.of(a,a)));
  assertThrows(BusinessException.class,()->MonitorLayoutService.validate(List.of(new MonitorLayoutService.Widget("站点运营概况",9,0,6,2))));
  assertThrows(BusinessException.class,()->MonitorLayoutService.validate(List.of(new MonitorLayoutService.Widget("站点运营概况",0,-1,6,2))));
  assertThrows(BusinessException.class,()->MonitorLayoutService.validate(List.of(a,new MonitorLayoutService.Widget("在线运行容量",4,0,6,2))));
 }
}
