package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
@Service
public class StationHistoryService {
 private final DomainSupport s;
 public StationHistoryService(DomainSupport s){this.s=s;}
 public record View(boolean available,String period,String date,String timezone,String source,String capturedAt,JsonNode payload){}
 public View export(long station,String period,String date){
  s.access.requireStationPermission(station,"report.export");
  View result=read(station,period,date);
  s.access.requireStationPermission(station,"report.export");
  return result;
 }
 static void validate(String period,String date){
  try {
   if(period==null||date==null)throw new IllegalArgumentException();
   LocalDate first,last;
   switch(period){
    case "day", "week" -> {if(!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new IllegalArgumentException();last=LocalDate.parse(date);first=period.equals("week")?last.minusDays(6):last;}
    case "month" -> {if(!date.matches("[0-9]{4}-[0-9]{2}"))throw new IllegalArgumentException();var m=YearMonth.parse(date);first=m.atDay(1);last=m.atEndOfMonth();}
    case "year" -> {if(!date.matches("[0-9]{4}"))throw new IllegalArgumentException();first=LocalDate.of(Integer.parseInt(date),1,1);last=first.withMonth(12).withDayOfMonth(31);}
    case "total" -> {if(!date.matches("[0-9]{4}:[0-9]{4}"))throw new IllegalArgumentException();first=LocalDate.of(Integer.parseInt(date.substring(0,4)),1,1);last=LocalDate.of(Integer.parseInt(date.substring(5)),12,31);if(last.getYear()-first.getYear()>30)throw new IllegalArgumentException();}
    default -> throw new IllegalArgumentException();
   }
   if(first.getYear()<1970||last.isBefore(first)||first.isAfter(LocalDate.now(ZoneOffset.ofHours(14)))||last.getYear()>LocalDate.now(ZoneOffset.ofHours(14)).getYear())throw new IllegalArgumentException();
  }catch(RuntimeException ex){throw new BusinessException(400,"历史周期或日期无效");}
 }
 static String capturedAt(Object value){
  if(value instanceof java.sql.Timestamp timestamp)return timestamp.toInstant().toString();
  if(value instanceof OffsetDateTime offset)return offset.toInstant().toString();
  if(value instanceof Instant instant)return instant.toString();
  throw new IllegalArgumentException("Unsupported capture timestamp type");
 }
 public View read(long station,String period,String date){
  s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");validate(period,date);
  var stations=s.db.queryForList("SELECT sp.timezone FROM station st LEFT JOIN station_profile sp ON sp.station_id=st.id WHERE st.id=? AND st.archived_at IS NULL",station);
  if(stations.isEmpty())throw new BusinessException(404,"场站不存在");
  var rows=s.db.queryForList("SELECT c.timezone,c.captured_at,c.payload::text FROM station_reference_history_capture c JOIN station_reference_import i ON i.station_id=c.station_id AND i.source_host=c.source_host AND i.source_id=c.source_id WHERE c.station_id=? AND c.period=? AND c.period_key=? ORDER BY c.captured_at DESC,c.id DESC LIMIT 1",station,period,date);
  View result;
  if(rows.isEmpty()){
   var demo=s.db.queryForList("SELECT timezone,created_at,payload::text FROM station_history_mock_dataset WHERE station_id=? AND period=? AND period_key=? ORDER BY dataset_version DESC,created_at DESC LIMIT 1",station,period,date);
   if(demo.isEmpty())result=new View(false,period,date,Objects.toString(stations.getFirst().get("timezone"),null),"reference-capture",null,null);
   else {var row=demo.getFirst();try{result=new View(true,period,date,row.get("timezone").toString(),"database-mock",capturedAt(row.get("created_at")),new ObjectMapper().readTree(row.get("payload").toString()));}catch(Exception e){throw new BusinessException(500,"模拟历史数据格式无效");}}
  }
  else {var row=rows.getFirst();try{result=new View(true,period,date,row.get("timezone").toString(),"reference-capture",capturedAt(row.get("captured_at")),new ObjectMapper().readTree(row.get("payload").toString()));}catch(Exception e){throw new BusinessException(500,"历史采集数据格式无效");}}
  s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"telemetry.read");return result;
 }
}
