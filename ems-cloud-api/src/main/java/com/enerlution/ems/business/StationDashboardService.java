package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;

/** Versioned page read model. Mock values never enter canonical measurements. */
@Service
public class StationDashboardService {
  private final DomainSupport s;
  public StationDashboardService(DomainSupport s) { this.s=s; }
  public record Metric(String key,String label,String unit,String period,BigDecimal value,String status) {}
  public record Panel(String key,String label,List<Metric> metrics) {}
  public record Flow(BigDecimal gridKw,BigDecimal loadKw,BigDecimal pcsKw,BigDecimal mpptKw,BigDecimal batteryKw) {}
  public record Snapshot(String sourceTime,String timezone,String name,String address,String commissionedOn,
      BigDecimal ratedPowerKw,BigDecimal capacityKwh,List<String> modules,List<String> scenes,
      String communicationState,String operatingState,String alarmState,String batteryState,List<Panel> panels,Flow flow) {}
  public record Cell(String type,String status,int count,List<String> deviceIds) {}
  public record Alarm(String id,String title,String severity,String occurredAt,String deviceName) {}
  public record View(String stationId,boolean configured,String datasetId,Integer datasetVersion,boolean mocked,
      String sourceTime,String timezone,String name,String address,String commissionedOn,BigDecimal ratedPowerKw,
      BigDecimal capacityKwh,BigDecimal solarCapacityKw,List<String> modules,List<String> scenes,String communicationState,String operatingState,
      String alarmState,String batteryState,String imageUrl,boolean telemetryAvailable,List<Panel> panels,Flow flow,
      List<Cell> equipment,boolean alarmsAvailable,List<Alarm> alarms,Long alarmTotal) {}
  static Snapshot decode(String json) {
    try { return new ObjectMapper().readValue(json,Snapshot.class); }
    catch(Exception e) { throw new BusinessException(500,"场站页面数据格式无效"); }
  }
  private boolean permitted(long station,String permission) {
    try { s.access.requireStationPermission(station,permission);return true; }
    catch(BusinessException e) { if(e.status()!=403)throw e;return false; }
  }
  private static BigDecimal number(Object value) {return value==null?null:new BigDecimal(value.toString());}
  public View read(long station,UUID substationId) {
    s.access.requireStationPermission(station,"asset.read");
    var stations=s.db.queryForList("SELECT st.name,st.address,st.asset_type,st.rated_power_kw,st.capacity_kwh,sp.solar_capacity_kw,sp.timezone,sp.commissioned_on FROM station st LEFT JOIN station_profile sp ON sp.station_id=st.id WHERE st.id=? AND st.archived_at IS NULL",station);
    if(stations.isEmpty())throw new BusinessException(404,"场站不存在");
    if(substationId!=null) {
      if(s.db.queryForList("SELECT id FROM substation WHERE station_id=? AND id=? AND archived_at IS NULL",station,substationId).isEmpty())throw new BusinessException(404,"子场站不存在");
    }
    var rows=s.db.queryForList("SELECT dataset_id,dataset_version,payload::text FROM station_dashboard_read_model WHERE station_id=? AND active ORDER BY dataset_version DESC LIMIT 1",station);
    var raw=stations.getFirst();var row=rows.isEmpty()?null:rows.getFirst();
    Snapshot p=row==null?null:decode(row.get("payload").toString());
    boolean telemetry=permitted(station,"telemetry.read"),alarmPermission=permitted(station,"alarm.read");
    if(p==null&&telemetry&&substationId==null) {
      var captures=s.db.queryForList("SELECT id,metrics::text,source_updated_at,charge_status FROM monitor_station_capture WHERE station_id=? ORDER BY captured_at DESC,id DESC LIMIT 1",station);
      if(!captures.isEmpty())p=StationDashboardCapture.snapshot(raw,captures.getFirst());
    }
    var equipment=s.db.queryForList("""
      SELECT d.id,r.source_type,r.category,
        CASE WHEN o.observed_at<=now() AND o.observed_at>=now()-interval '90 seconds'
          THEN o.communication_status ELSE 'unknown' END AS status
      FROM device d LEFT JOIN device_reference_profile r ON r.device_id=d.id
      LEFT JOIN device_observation o ON o.device_id=d.id
      WHERE d.station_id=? AND d.archived_at IS NULL
        AND (?::uuid IS NULL OR EXISTS(SELECT 1 FROM substation_device sd WHERE sd.device_id=d.id AND sd.station_id=d.station_id AND sd.substation_id=?))
      ORDER BY d.id
      """,station,substationId,substationId);
    var cells=new LinkedHashMap<String,List<String>>();
    for(var d:equipment) {String key=DeviceDetailRules.type(Objects.toString(d.get("source_type"),null),Objects.toString(d.get("category"),null))+"\n"+(telemetry?Objects.toString(d.get("status"),"unknown"):"unknown");cells.computeIfAbsent(key,k->new ArrayList<>()).add(d.get("id").toString());}
    var matrix=cells.entrySet().stream().map(e->{var k=e.getKey().split("\n");return new Cell(k[0],k[1],e.getValue().size(),e.getValue());}).toList();
    List<Alarm> alarms=List.of();Long total=null;
    if(alarmPermission) {
      String filter=" FROM alarm a JOIN device d ON d.id=a.device_id LEFT JOIN alarm_business_origin origin ON origin.alarm_id=a.id WHERE COALESCE(origin.station_id,d.station_id)=? AND a.deleted_at IS NULL AND a.source='rule' AND a.closed_at IS NULL AND (a.recovered_at IS NULL OR a.recovered_at>now()) AND a.occurred_at<=now() AND (?::uuid IS NULL OR EXISTS(SELECT 1 FROM substation_device sd WHERE sd.device_id=d.id AND sd.station_id=? AND sd.substation_id=?))";
      total=s.db.queryForObject("SELECT count(*)"+filter,Long.class,station,substationId,station,substationId);
      alarms=s.db.query("SELECT a.id,a.title,a.severity,a.occurred_at,d.name"+filter+" ORDER BY a.occurred_at DESC,a.id DESC LIMIT 5",(rs,i)->new Alarm(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5)),station,substationId,station,substationId);
      s.access.requireStationPermission(station,"alarm.read");
    }
    s.access.requireStationPermission(station,"asset.read");
    if(telemetry)s.access.requireStationPermission(station,"telemetry.read");
    // Child scopes cannot inherit whole-station energy values without verified aggregation rules.
    boolean values=telemetry&&p!=null&&substationId==null;
    return new View(Long.toString(station),p!=null,row==null?null:row.get("dataset_id").toString(),row==null?null:((Number)row.get("dataset_version")).intValue(),row!=null,
      values?p.sourceTime():null,p==null?null:p.timezone(),p==null?raw.get("name").toString():p.name(),p==null?Objects.toString(raw.get("address"),null):p.address(),p==null?null:p.commissionedOn(),
      p==null?number(raw.get("rated_power_kw")):p.ratedPowerKw(),p==null?number(raw.get("capacity_kwh")):p.capacityKwh(),number(raw.get("solar_capacity_kw")),p==null||p.modules()==null?List.of():p.modules(),p==null||p.scenes()==null?List.of():p.scenes(),
      values?p.communicationState():null,values?p.operatingState():null,alarmPermission&&p!=null?p.alarmState():null,values?p.batteryState():null,null,telemetry,values&&p.panels()!=null?p.panels():List.of(),values?p.flow():null,matrix,alarmPermission,alarms,total);
  }
}
