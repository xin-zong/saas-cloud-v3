package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import java.math.BigDecimal;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class StationDashboardHistoryExtras {
 private final DomainSupport s; private final StationHistoryService history;
 public StationDashboardHistoryExtras(DomainSupport s,StationHistoryService history){this.s=s;this.history=history;}
 public record TemplateInput(String name,String scene,List<String> fields){}
 private static final Map<String,String> LABELS=Map.ofEntries(Map.entry("weather","天气"),Map.entry("mpptGenerationPower","MPPT发电功率 (kW)"),Map.entry("mpptGenerationValue","MPPT发电量 (kWh)"),Map.entry("batteryDcPower","电池直流功率 (kW)"),Map.entry("batteryPower","储能充放电功率 (kW)"),Map.entry("wirePower","电网功率 (kW)"),Map.entry("generationPower","光伏发电功率 (kW)"),Map.entry("usePower","用电功率 (kW)"),Map.entry("batterySoc","电池剩余容量SOC (%)"),Map.entry("batterySoh","电池健康度SOH (%)"),Map.entry("temperature","当地温度 (℃)"),Map.entry("radiation","辐照强度 (W/m²)"),Map.entry("price","电价 (元/kWh)"),Map.entry("generationValue","光伏发电量 (kWh)"),Map.entry("useValue","用电量 (kWh)"),Map.entry("chargeValue","储能充电量 (kWh)"),Map.entry("dischargeValue","储能放电量 (kWh)"),Map.entry("buyValue","购电量 (kWh)"),Map.entry("gridValue","并网电量 (kWh)"),Map.entry("powerFactor","电网功率因数"),Map.entry("activeKw","电网有功功率 (kW)"),Map.entry("reactiveKvar","电网无功功率 (kVar)"),Map.entry("buyKwh","购电有功电能 (kWh)"),Map.entry("exportKwh","并网有功电能 (kWh)"),Map.entry("positiveReactiveKvarh","正向无功电能 (kVarh)"),Map.entry("negativeReactiveKvarh","反向无功电能 (kVarh)"));
 static List<String> fields(String scene,List<String> fields){
  if(!Set.of("overall","solar","storage","grid").contains(Objects.toString(scene,""))||fields==null||fields.isEmpty()||fields.size()>LABELS.size()||new HashSet<>(fields).size()!=fields.size()||fields.stream().anyMatch(k->k==null||!LABELS.containsKey(k)))throw new BusinessException(400,"参数目录无效");
  Set<String> allowed=switch(scene){case "solar"->Set.of("weather","mpptGenerationPower","mpptGenerationValue","generationPower","temperature","radiation","generationValue","gridValue");case "storage"->Set.of("usePower","mpptGenerationPower","mpptGenerationValue","batteryDcPower","batteryPower","batterySoc","batterySoh","wirePower","price","chargeValue","dischargeValue","buyValue","gridValue");case "grid"->Set.of("wirePower","usePower","buyValue","gridValue","powerFactor","activeKw","reactiveKvar","buyKwh","exportKwh","positiveReactiveKvarh","negativeReactiveKvarh");default->Set.of("weather","mpptGenerationPower","mpptGenerationValue","batteryDcPower","batteryPower","wirePower","generationPower","usePower","batterySoc","price","generationValue","useValue","chargeValue","dischargeValue","buyValue","gridValue");};
  if(!allowed.containsAll(fields))throw new BusinessException(400,"参数不适用于该场景");return List.copyOf(fields);
 }
 private void readPermission(long station){s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");}
 private void exportPermission(long station){readPermission(station);s.access.requireStationPermission(station,"report.export");}
 public byte[] workbook(long station,String period,String date,String scene,List<String> selected){
  exportPermission(station);var keys=fields(scene,selected);StationHistoryService.validate(period,date);
  boolean grid=keys.stream().anyMatch(GRID_FIELDS::contains);if(grid&&!Set.copyOf(period.equals("day")?List.of("powerFactor","activeKw","reactiveKvar"):List.of("powerFactor","buyKwh","exportKwh","positiveReactiveKvarh","negativeReactiveKvarh")).containsAll(keys))throw new BusinessException(400,"电网参数不适用于该周期");
  if(!grid&&keys.stream().anyMatch(k->period.equals("day")==k.endsWith("Value")))throw new BusinessException(400,"参数不适用于该周期");
  var view=history.read(station,period,date);if(!view.available())throw new BusinessException(404,"该期间无历史数据");
  byte[] result=DeviceHistoryWorkbook.write("场站历史",rows(view,keys));exportPermission(station);return result;
 }
 static List<List<String>> rows(StationHistoryService.View view,List<String> keys){
  if(keys.stream().anyMatch(GRID_FIELDS::contains))return gridRows(view,keys);
  var output=new ArrayList<List<String>>();var header=new ArrayList<String>();header.add("时间 ("+view.timezone()+") · "+view.period()+" · "+view.date()+" · "+view.source());keys.forEach(k->header.add(LABELS.get(k)));output.add(header);
  JsonNode payload=view.payload(),list=payload==null?null:payload.get(switch(view.period()){case "day"->"stationStatisticPowerList";case "month","week"->"stationStatisticDayDtoList";case "year"->"stationStatisticMonthDtoList";default->"stationStatisticYearDtoList";});
  if(list==null||!list.isArray())return output;
  for(JsonNode row:list){var line=new ArrayList<String>();if(view.period().equals("day")){var time=row.get("dateTime");if(time==null||!time.isIntegralNumber()||time.longValue()<=0||time.longValue()>=100000000000L)continue;line.add(Instant.ofEpochSecond(time.longValue()).atZone(ZoneId.of(view.timezone())).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));}else{String key=view.period().equals("total")?"year":view.period().equals("year")?"month":"day";line.add(row.path(key).asText(row.path("acceptDay").asText("")));}
   for(String key:keys){JsonNode v=row.get(key);if(key.equals("weather")){line.add(v!=null&&v.isTextual()?v.textValue():"");continue;}String value="";if(v!=null&&v.isNumber()&&Double.isFinite(v.doubleValue())&&(!Set.of("batterySoc","batterySoh").contains(key)||v.doubleValue()>=0&&v.doubleValue()<=100)){BigDecimal n=v.decimalValue();if(key.endsWith("Power")||key.endsWith("Value"))n=n.movePointLeft(3);value=n.stripTrailingZeros().toPlainString();}line.add(value);}output.add(line);
  }return output;
 }
 public List<Map<String,Object>> templates(long station,String scene){readPermission(station);if(!Set.of("overall","solar","storage","grid").contains(scene))throw new BusinessException(400,"场景无效");var rows=s.db.queryForList("SELECT name,fields::text FROM station_dashboard_history_template WHERE station_id=? AND actor_id=? AND scene=? ORDER BY created_at,name",station,s.access.userId(),scene);var result=new ArrayList<Map<String,Object>>();for(var row:rows){try{result.add(Map.of("name",row.get("name"),"fields",new ObjectMapper().readValue(row.get("fields").toString(),List.class)));}catch(Exception e){throw new BusinessException(500,"模板格式无效");}}readPermission(station);return result;}
 @Transactional public Map<String,Object> save(long station,TemplateInput input){
  s.access.requireStationPermission(station,"asset.edit");readPermission(station);if(input==null||input.name()==null||input.name().isBlank()||input.name().trim().length()>60)throw new BusinessException(400,"模板名称须为1至60字");var keys=fields(input.scene(),input.fields());String name=input.name().trim();String json;try{json=new ObjectMapper().writeValueAsString(keys);}catch(Exception e){throw new IllegalStateException(e);}
  s.db.update("INSERT INTO station_dashboard_history_template(id,station_id,actor_id,name,scene,fields) VALUES(?,?,?,?,?,?::jsonb) ON CONFLICT(station_id,actor_id,scene,name) DO UPDATE SET fields=EXCLUDED.fields",UUID.randomUUID(),station,s.access.userId(),name,input.scene(),json);
  s.auditStation("station.dashboard-history.template.save",station,Map.of("name",name,"scene",input.scene(),"fields",keys));s.access.requireStationPermission(station,"asset.edit");readPermission(station);return Map.of("name",name,"fields",keys);
 }
 private static final Set<String> GRID_FIELDS=Set.of("powerFactor","activeKw","reactiveKvar","buyKwh","exportKwh","positiveReactiveKvarh","negativeReactiveKvarh");
 private static List<List<String>> gridRows(StationHistoryService.View view,List<String> keys){
  var output=new ArrayList<List<String>>();JsonNode payload=view.payload(),supplement=payload==null?new ObjectMapper().createObjectNode():payload.path("dashboardSupplement"),grid=supplement.path("grid"),history=grid.path("history");String timezone=history.path("timezone").asText(supplement.path("timezone").asText(view.timezone()));
  var header=new ArrayList<String>();header.add("时间 ("+timezone+") · "+view.period()+" · "+view.date()+" · "+view.source());keys.forEach(k->header.add(LABELS.get(k)));output.add(header);JsonNode rows=history.path(view.period());
  if(!rows.isArray()||rows.isEmpty()){
   // Direct measured energy aliases only; missing factor/reactive energy stays blank.
   var converted=new ObjectMapper().createArrayNode();JsonNode source=payload==null||view.period().equals("day")?null:payload.get(switch(view.period()){case "day"->"stationStatisticPowerList";case "month"->"stationStatisticDayDtoList";case "year"->"stationStatisticMonthDtoList";default->"stationStatisticYearDtoList";});
   if(source!=null&&source.isArray())for(JsonNode row:source){var r=converted.addObject();String date=view.period().equals("day")?row.path("dateTime").asText(""):view.period().equals("total")?row.path("year").asText(""):view.period().equals("year")?row.path("year").asText(view.date())+"-"+String.format("%02d",row.path("month").asInt()):row.path("acceptDay").asText("").matches("[0-9]{8}")?row.path("acceptDay").asText().substring(0,4)+"-"+row.path("acceptDay").asText().substring(4,6)+"-"+row.path("acceptDay").asText().substring(6):view.date()+"-"+String.format("%02d",row.path("day").asInt());r.put("date",date);if(row.path("powerFactor").isNumber())r.set("powerFactor",row.path("powerFactor"));for(var mapping:Map.of("wirePower","activeKw","buyValue","buyKwh","gridValue","exportKwh").entrySet()){var n=row.get(mapping.getKey());if(n!=null&&n.isNumber())r.put(mapping.getValue(),n.decimalValue().movePointLeft(3));}}rows=converted;
  }
  var sorted=new ArrayList<Map.Entry<String,JsonNode>>();for(var row:rows){String date=row.path("date").asText("");try{if(date.matches("[0-9]{10}"))date=Instant.ofEpochSecond(Long.parseLong(date)).atZone(ZoneId.of(timezone)).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);}catch(RuntimeException e){continue;}try{switch(view.period()){case "total"->java.time.Year.parse(date.substring(0,4));case "year"->YearMonth.parse(date.substring(0,7));default->LocalDate.parse(date.substring(0,10));}}catch(RuntimeException invalid){continue;}boolean match=view.period().equals("total")?date.length()>=4&&date.substring(0,4).matches("[0-9]{4}")&&date.substring(0,4).compareTo(view.date().substring(0,4))>=0&&date.substring(0,4).compareTo(view.date().substring(5))<=0:date.startsWith(view.date());if(match)sorted.add(Map.entry(date,row));}
  sorted.sort(Map.Entry.comparingByKey());sorted.forEach(entry->{String date=entry.getKey();JsonNode row=entry.getValue();var line=new ArrayList<String>();line.add(date);for(String key:keys){var v=row.get(key);boolean valid=v!=null&&v.isNumber()&&Double.isFinite(v.doubleValue())&&(key.equals("powerFactor")?Math.abs(v.doubleValue())<=1:key.equals("activeKw")||key.equals("reactiveKvar")||v.doubleValue()>=0);line.add(valid?v.decimalValue().stripTrailingZeros().toPlainString():"");}output.add(line);});return output;
 }}






