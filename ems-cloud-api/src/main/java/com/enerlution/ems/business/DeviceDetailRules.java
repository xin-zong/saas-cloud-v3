package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;

final class DeviceDetailRules {
  static String type(String source,String category) {
    String value=Objects.toString(source,"").toLowerCase(Locale.ROOT).replaceAll("[ _-]","");
    return switch(value) {
      case "inverter","1" -> "inverter";
      case "energystoragecabinet","66" -> "cabinet";
      case "pcs","46" -> "pcs";
      case "batterycluster","31001" -> "battery-cluster";
      case "batterystack","31002" -> "battery-stack";
      case "airconditioner","6" -> "air-conditioner";
      case "smartmeter","meter","5" -> "meter";
      case "logger","18","185000" -> "logger";
      case "ems","185001","61" -> "ems";
      case "environment","9" -> "environment";
      case "mppt","60" -> "mppt";
      case "liquidcooler","53" -> "liquid-cooler";
      default -> switch(Objects.toString(category,"")) {
        case "PV" -> "inverter"; case "BESS" -> "cabinet"; case "PCS" -> "pcs";
        case "HVAC" -> "air-conditioner"; case "MTR" -> "meter"; default -> "other";
      };
    };
  }
  static void selection(List<Long> selected,Set<Long> owned) {
    if(selected==null || selected.size()>12 || selected.stream().anyMatch(Objects::isNull)
        || new HashSet<>(selected).size()!=selected.size() || !owned.containsAll(selected))
      throw new BusinessException(400,"请选择本设备的至多12个不同测点");
  }
  static Set<String> theoryFields(String type) {
    return switch(type) {
      case "inverter","pcs","cabinet" -> Set.of("ratedPowerKw","capacityKwh");
      case "battery-cluster","battery-stack" -> Set.of("loopNum","theorySoh");
      default -> Set.of();
    };
  }
  static void units(List<Long> selected,Map<Long,String> units) {
    if(selected.stream().map(id->units.getOrDefault(id,"")).filter(v->!v.isBlank()).distinct().count()>4)
      throw new BusinessException(400,"历史参数最多包含4种单位");
  }
  static void theory(String type,Map<String,BigDecimal> values) {
    if(values==null || !theoryFields(type).containsAll(values.keySet()))
      throw new BusinessException(400,"不支持的本地参数");
    for(var entry:values.entrySet()) {
      var v=entry.getValue();
      if(v==null || v.signum()<0 || v.scale()>2 || v.compareTo(new BigDecimal("1000000000"))>0)
        throw new BusinessException(400,"参数必须为非负数，最多两位小数");
      if(entry.getKey().equals("loopNum") && (v.stripTrailingZeros().scale()>0 || v.intValue()<1000 || v.compareTo(new BigDecimal("20000"))>0))
        throw new BusinessException(400,"理论循环次数为1000至20000整数");
      if(entry.getKey().equals("theorySoh") && v.compareTo(new BigDecimal("100"))>0)
        throw new BusinessException(400,"理论SOH为0至100%");
    }
    if(values.containsKey("loopNum")!=values.containsKey("theorySoh"))
      throw new BusinessException(400,"请同时填写理论循环次数与理论SOH");
  }
}
