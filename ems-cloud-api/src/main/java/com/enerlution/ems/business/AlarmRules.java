package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;

/** Configuration semantics only: no inferred sampling cadence or external delivery. */
public final class AlarmRules {
  private AlarmRules() {}
  public record Field(String code,String unit,String cycleType,String objectType) {}
  public record Condition(List<Field> fields,String algorithm,int period,String operator,
      BigDecimal lower,BigDecimal upper,String statusValue,boolean includeLower,
      boolean includeUpper,boolean extend1) {}
  public static void validate(Condition c) {
    if(c==null || c.fields()==null || c.fields().isEmpty() || c.fields().size()>2) bad("条件必须选择一至两个指标");
    if(!Set.of(1,3,5,7,9,11).contains(c.period())) bad("连续周期只能为1/3/5/7/9/11");
    if(c.operator()==null || !Set.of("eq","neq","lt","lte","gt","gte","bet","nbet","mom_up","mom_down","yoy_up","yoy_down").contains(c.operator())) bad("不支持的比较运算符");
    for(var f:c.fields()) if(f==null || f.code()==null || f.code().isBlank() || f.code().length()>120 || f.unit()==null || f.cycleType()==null || !Set.of("INSTANT","DAY_00","YEAR_EARLY").contains(f.cycleType()) || f.objectType()==null || !Set.of("DEVICE","STATION").contains(f.objectType())) bad("指标定义不完整");
    var first=c.fields().getFirst();
    if(c.fields().size()==2) {
      var second=c.fields().get(1);
      if(first.code().equals(second.code()) || !first.unit().equals(second.unit()) || !first.cycleType().equals(second.cycleType()) || !first.objectType().equals(second.objectType())) bad("双指标必须不同且单位、周期和对象一致");
      if(!"dpc_rate".equals(c.algorithm()) || relative(c.operator())) bad("双指标仅支持差异率且不能同比环比");
    } else if(!"self".equals(c.algorithm())) bad("单指标算法必须为self");
    if("deviceStatus".equals(first.code())) {
      if(c.lower()!=null || c.upper()!=null || c.extend1() || c.fields().size()!=1 || !"eq".equals(c.operator()) || !Set.of("online","offline").contains(Objects.toString(c.statusValue(),""))) bad("通信状态只能判断在线或离线");
      return;
    }
    if("dPF".equals(first.code()) && !Set.of("eq","mom_down","bet","lt","lte").contains(c.operator())) bad("功率因数不支持此运算符");
    if(relative(c.operator()) && "DEVICE".equals(first.objectType()) && !"DAY_00".equals(first.cycleType())) bad("设备同比环比仅支持日指标");
    if(c.operator().startsWith("yoy") && "STATION".equals(first.objectType()) && "YEAR_EARLY".equals(first.cycleType())) bad("年初累计不支持同比");
    boolean interval=Set.of("bet","nbet").contains(c.operator()) || relative(c.operator());
    if(c.lower()==null && c.upper()==null) bad("至少填写一个阈值");
    if(!interval && (c.lower()==null || c.upper()!=null)) bad("该运算符需要单阈值");
    if(c.lower()!=null && c.upper()!=null && c.lower().compareTo(c.upper())>=0) bad("区间下界必须小于上界");
    for(var value:Arrays.asList(c.lower(),c.upper())) if(value!=null) {
      if(value.scale()>2 || value.precision()>16) bad("阈值最多两位小数且数值超出范围");
      if(relative(c.operator()) && value.signum()<0) bad("同比环比阈值不能小于零");
    }
    if(c.extend1() && c.lower()!=null) bad("扩展条件不接受下界阈值");
  }
  private static boolean relative(String op) { return op.startsWith("mom_") || op.startsWith("yoy_"); }
  public static String lifecycle(Object recovered,Object closed) { return closed!=null?"closed":recovered!=null?"recovered":"active"; }
  public static void action(String action,String lifecycle,long actualVersion,long expectedVersion) {
    if(actualVersion!=expectedVersion) throw new BusinessException(409,"告警已被其他人更新，请刷新");
    if(!Set.of("acknowledge","note","close","delete").contains(action)) bad("不支持的处置动作");
    if("delete".equals(action) && "active".equals(lifecycle)) throw new BusinessException(409,"请先关闭或恢复告警再删除");
    if(("close".equals(action)||"acknowledge".equals(action)) && !"active".equals(lifecycle)) throw new BusinessException(409,"告警已结束");
  }
  static void bad(String text) { throw new BusinessException(400,text); }
}
