package com.enerlution.ems.business;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;

/** Saved station readings only. No device aggregation or inferred power balance. */
final class StationDashboardCapture {
 private record Field(String source,String key,String label,String unit,String period) {}
 private static Field f(String source,String key,String label,String unit,String period){return new Field(source,key,label,unit,period);}
 private static final List<Field> STORAGE=List.of(
  f("storagePower","installedPower","储能额定功率","kW",null),f("storageCapacity","capacity","储能额定容量","kWh",null),f("storageEfficiency","efficiency","充放电效率","%",null),
  f("storageSoc","soc","整站SOC","%","instant"),f("storageSoh","soh","整站SOH","%","instant"),
  f("storageActivePower","power","储能充放电功率","kW","instant"),
  f("storageDailyCharged","dailyCharge","储能充电量","kWh","day"),f("storageDailyDischarged","dailyDischarge","储能放电量","kWh","day"),
  f("storageMonthlyCharged","monthlyCharge","储能充电量","kWh","month"),f("storageMonthlyDischarged","monthlyDischarge","储能放电量","kWh","month"),
  f("storageTotalCharged","totalCharge","储能充电量","kWh","total"),f("storageTotalDischarged","totalDischarge","储能放电量","kWh","total"),
  f("storageEfficiency7","efficiency7","充放电效率（近7日）","%",null),f("storageEfficiencyMonth","efficiencyMonth","充放电效率","%","month"),f("storageEfficiencyYear","efficiencyYear","充放电效率","%","year"),
  f("storageUtilization7","utilization7","利用率（近7日）","%",null),f("storageUtilizationMonth","utilizationMonth","利用率","%","month"),f("storageUtilizationYear","utilizationYear","利用率","%","year"));
 private static final List<Field> SOLAR=List.of(
  f("pvCapacity","capacity","光伏装机容量","kWp",null),
  f("pvPower","power","光伏功率","kW","instant"),f("pvNormalization","normalization","功率归一化","%","instant"),
  f("pvDaily","dailyProduction","光伏发电量","kWh","day"),f("pvMonthly","monthlyProduction","光伏发电量","kWh","month"),f("pvTotal","totalProduction","光伏发电量","kWh","total"),
  f("pvPeak7","peak7","满发小时（近7日）","h",null),f("pvPeakMonth","peakMonth","满发小时","h","month"),f("pvPeakYear","peakYear","满发小时","h","year"),
  f("pvPrYesterday","prYesterday","PR（昨日）","%",null),f("pvPr7","pr7","PR（近7日）","%",null),f("pvPrMonth","prMonth","PR","%","month"),f("pvPrYear","prYear","PR","%","year"),
  f("pvCompletionMonthBasic","completionMonthBasic","计划完成率（基础）","%","month"),f("pvCompletionYearBasic","completionYearBasic","计划完成率（基础）","%","year"),f("pvCompletionMonthSuperior","completionMonthSuperior","计划完成率（卓越）","%","month"),f("pvCompletionYearSuperior","completionYearSuperior","计划完成率（卓越）","%","year"));
 private static String text(Object value){return value==null?null:value instanceof java.sql.Timestamp stamp?stamp.toInstant().toString():value.toString();}
 private static BigDecimal number(Object value){return value==null?null:new BigDecimal(value.toString());}
 private static void panel(List<StationDashboardService.Panel> panels,Map<String,Object> metrics,String key,String label,List<Field> fields){
  var values=new ArrayList<StationDashboardService.Metric>();
  for(var field:fields)if(metrics.containsKey(field.source())){var value=number(metrics.get(field.source()));values.add(new StationDashboardService.Metric(field.key(),field.label(),field.unit(),field.period(),value,value==null?"missing":"captured"));}
  if(!values.isEmpty())panels.add(new StationDashboardService.Panel(key,label,values));
 }
 static StationDashboardService.Snapshot snapshot(Map<String,Object> station,Map<String,Object> capture){
  Map<String,Object> metrics;
  try{metrics=new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readValue(capture.get("metrics").toString(),new TypeReference<LinkedHashMap<String,Object>>(){});}catch(Exception e){throw new IllegalStateException("Invalid saved station metrics",e);}
  var panels=new ArrayList<StationDashboardService.Panel>();String type=text(station.get("asset_type"));
  if(Set.of("PV","Hybrid").contains(Objects.toString(type,"")))panel(panels,metrics,"solar","光伏",SOLAR);
  if(Set.of("BESS","Hybrid").contains(Objects.toString(type,"")))panel(panels,metrics,"storage","储能",STORAGE);
  var scenes=new ArrayList<String>();if(panels.size()>1)scenes.add("overall");panels.forEach(p->scenes.add(p.key()));
  return new StationDashboardService.Snapshot(text(capture.get("source_updated_at")),text(station.get("timezone")),text(station.get("name")),text(station.get("address")),text(station.get("commissioned_on")),number(station.get("rated_power_kw")),number(station.get("capacity_kwh")),List.of(),scenes,null,null,null,text(capture.get("charge_status")),panels,null);
 }
}


