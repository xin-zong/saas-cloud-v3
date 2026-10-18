package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.math.*;
import java.util.*;

/** Shared validation and arithmetic; missing measurements are deliberately not zero. */
final class MonitorWorkspaceRules {
  static boolean needsLive(String mode,String source){return !"capture".equals(mode)||!"reference_capture".equals(source);}

  static final Set<String> METRICS=Set.of("pvCapacity","pvPower","pvNormalization","pvDaily","pvMonthly","pvTotal","pvPeak7","pvPeakMonth","pvPeakYear","pvPrYesterday","pvPr7","pvPrMonth","pvPrYear","pvCompletionMonthBasic","pvCompletionMonthSuperior","pvCompletionYearBasic","pvCompletionYearSuperior","storagePower","storageCapacity","storageSoc","storageDailyCharged","storageDailyDischarged","storageMonthlyCharged","storageMonthlyDischarged","storageTotalCharged","storageTotalDischarged","storageEfficiency","storageActivePower","storageSoh","storageEfficiency7","storageEfficiencyMonth","storageEfficiencyYear","storageUtilization7","storageUtilizationMonth","storageUtilizationYear");
  static final Set<String> SORTS;
  static {var keys=new HashSet<>(METRICS);keys.addAll(Set.of("name","updatedAt","communication","alarmCount"));SORTS=Set.copyOf(keys);}
  private MonitorWorkspaceRules() {}
  static void bad(){throw new BusinessException(400,"监控筛选、排序或分页条件无效");}
  static Map<String,Object> query(Map<String,String> p) {
    var q=new LinkedHashMap<String,Object>();
    option(p,q,"scene","all",Set.of("all","PV","BESS","Hybrid","Wind","Diesel"));
    option(p,q,"communication","all",Set.of("all","online","partial","offline","connecting","unknown"));
    option(p,q,"alarm","all",Set.of("all","active","clear","unknown"));
    option(p,q,"sourceMode","capture",Set.of("capture","current"));
    option(p,q,"scope","all",Set.of("all","imported"));
    option(p,q,"chargeStatus","all",Set.of("all","charging","discharging","idle","unknown"));
    option(p,q,"productionStatus","all",Set.of("all","running","not_started","unknown"));
    option(p,q,"direction","ASC",Set.of("ASC","DESC"));
    option(p,q,"sort","name",SORTS);
    option(p,q,"watched","false",Set.of("true","false"));
    for(String key:List.of("search","region","siteType","tagId","stationId")) {
      String value=p.getOrDefault(key,"").strip();if(value.length()>160)bad();q.put(key,value);
    }
    if(!q.get("tagId").equals(""))try{UUID.fromString(q.get("tagId").toString());}catch(IllegalArgumentException ex){bad();}
    if(!q.get("stationId").equals(""))try{if(Long.parseLong(q.get("stationId").toString())<1)bad();}catch(NumberFormatException ex){bad();}
    for(String key:List.of("minCapacity","maxCapacity")) {
      String value=p.getOrDefault(key,"");BigDecimal number=null;
      if(!value.isBlank())try{number=new BigDecimal(value);if(number.signum()<0||number.compareTo(new BigDecimal("1000000000"))>0)bad();}catch(NumberFormatException ex){bad();}
      q.put(key,number);
    }
    var min=(BigDecimal)q.get("minCapacity");var max=(BigDecimal)q.get("maxCapacity");if(min!=null&&max!=null&&min.compareTo(max)>0)bad();
    try{int limit=Integer.parseInt(p.getOrDefault("limit","50")),offset=Integer.parseInt(p.getOrDefault("offset","0"));if(limit<1||limit>200||offset<0||offset>100000)bad();q.put("limit",limit);q.put("offset",offset);}catch(NumberFormatException ex){bad();}
    return q;
  }
  private static void option(Map<String,String> p,Map<String,Object> q,String key,String fallback,Set<String> allowed){String value=p.getOrDefault(key,fallback);if(!allowed.contains(value))bad();q.put(key,value);}
  static BigDecimal number(Object value){try{return value==null?null:new BigDecimal(value.toString());}catch(NumberFormatException ex){return null;}}
  static Map<String,Map<String,Object>> totals(List<Map<String,Object>> values) {
    var result=new LinkedHashMap<String,Map<String,Object>>();
    for(String key:List.of("pvTotal","storageTotalCharged","storageTotalDischarged")) {
      BigDecimal total=BigDecimal.ZERO;int covered=0;
      for(var row:values){var value=number(row.get(key));if(value!=null){covered++;total=total.add(value);}}
      result.put(key,aggregate(covered==0?null:total,covered,values.size()));
    }
    BigDecimal charge=BigDecimal.ZERO,discharge=BigDecimal.ZERO;int paired=0;
    for(var row:values){var c=number(row.get("storageTotalCharged"));var d=number(row.get("storageTotalDischarged"));if(c!=null&&d!=null){charge=charge.add(c);discharge=discharge.add(d);paired++;}}
    var efficiency=paired==0||charge.signum()<=0?null:discharge.multiply(new BigDecimal("100")).divide(charge,MathContext.DECIMAL128);
    boolean inconsistent=efficiency!=null&&(efficiency.signum()<0||efficiency.compareTo(new BigDecimal("100"))>0);
    var aggregate=aggregate(inconsistent?null:efficiency,paired,values.size());if(inconsistent)aggregate.put("reason","counter_boundary_requires_review");
    result.put("storageEfficiency",aggregate);return result;
  }
  private static Map<String,Object> aggregate(Object value,int covered,int total){var out=new LinkedHashMap<String,Object>();out.put("value",value);out.put("covered",covered);out.put("total",total);out.put("complete",total>0&&covered==total);return out;}
  static String capturedScene(String canonical,Object systems){
    if(!(systems instanceof List<?> values)||values.isEmpty()||values.stream().anyMatch(v->!Set.of("Solar System","Storage System","MPPT PV System").contains(v)))return canonical;
    if(values.contains("Solar System"))return values.contains("Storage System")?"Hybrid":"PV";
    return values.contains("Storage System")?"BESS":canonical;
  }
  @SuppressWarnings("unchecked") static Comparator<Map<String,Object>> comparator(String sort,String direction){
    if(!SORTS.contains(sort)||!Set.of("ASC","DESC").contains(direction))bad();
    return (a,b)->{
      Object av=METRICS.contains(sort)?((Map<String,Object>)a.get("metrics")).get(sort):a.get(sort),bv=METRICS.contains(sort)?((Map<String,Object>)b.get("metrics")).get(sort):b.get(sort);
      int order=av==null?(bv==null?0:1):bv==null?-1:METRICS.contains(sort)||sort.equals("alarmCount")?number(av).compareTo(number(bv)):sort.equals("updatedAt")?java.time.Instant.parse(av.toString()).compareTo(java.time.Instant.parse(bv.toString())):av.toString().compareToIgnoreCase(bv.toString());
      if(av!=null&&bv!=null&&direction.equals("DESC"))order=-order;
      return order!=0?order:a.get("id").toString().compareTo(b.get("id").toString());
    };
  }
}
