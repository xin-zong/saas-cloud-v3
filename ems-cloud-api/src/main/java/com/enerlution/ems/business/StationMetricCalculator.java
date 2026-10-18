package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import java.math.*;
import java.util.*;
/** Conservative trapezoidal power integration: exact interval boundaries and no interpolation across gaps. */
final class StationMetricCalculator {
 record Sample(long time,BigDecimal value,boolean valid){}
 record Energy(BigDecimal value,String reason){}
 static BigDecimal offset(String value){
  if(value==null||value.length()>13||!value.matches("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?"))throw new BusinessException(400,"偏移须为正负数字，最多两位小数，不允许多位前导零");
  var n=new BigDecimal(value);if(n.abs().compareTo(new BigDecimal("99999999.99"))>0)throw new BusinessException(400,"偏移范围为±99999999.99");return n.setScale(2);
 }
 static Energy integrate(List<Sample> samples,long start,long end,String unit){
  if(samples.size()<2||samples.getFirst().time()!=start||samples.getLast().time()!=end)return new Energy(null,"缺少自然日精确起止边界采样");
  BigDecimal multiplier=switch(unit){case "kW"->BigDecimal.ONE;case "W"->new BigDecimal("0.001");case "MW"->new BigDecimal("1000");default->null;};
  if(multiplier==null)return new Energy(null,"功率单位未支持");
  BigDecimal sum=BigDecimal.ZERO;
  for(int i=0;i<samples.size();i++){
   Sample p=samples.get(i);if(!p.valid()||p.value()==null)return new Energy(null,"采样缺失、冲突或质量无效");
   if(p.value().signum()<0)return new Energy(null,"负功率方向尚未审定");
   if(i==0)continue;Sample previous=samples.get(i-1);long gap=p.time()-previous.time();
   if(gap<=0||gap>300000)return new Energy(null,"采样乱序或间隔超过5分钟");
   sum=sum.add(previous.value().add(p.value()).multiply(BigDecimal.valueOf(gap)));
  }
  return new Energy(sum.multiply(multiplier).divide(new BigDecimal("7200000"),2,RoundingMode.HALF_UP),null);
 }
}
