package com.enerlution.ems.business;
import com.enerlution.ems.common.*;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/stations/{stationId}/display-settings")
public class StationDisplaySettingsController {
 private final DomainSupport s; public StationDisplaySettingsController(DomainSupport s){this.s=s;}
 public record Request(Boolean powerFactorVisible,Boolean revenueVisible,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){@JsonAnySetter public void unknown(String k,Object v){throw new BusinessException(400,"不支持的显示配置");}}
 public record Config(Boolean powerFactorVisible,Boolean revenueVisible,long version){}
 private Config read(long id){var rows=s.db.query("SELECT power_factor_visible,revenue_visible,version FROM station_display_settings WHERE station_id=?",(r,i)->new Config((Boolean)r.getObject(1),(Boolean)r.getObject(2),r.getLong(3)),id);return rows.isEmpty()?new Config(null,null,0):rows.getFirst();}
 @GetMapping public ApiResponse<Config> get(@PathVariable long stationId){s.access.requireStationPermission(stationId,"asset.read");var result=read(stationId);s.access.requireStationPermission(stationId,"asset.read");return ApiResponse.ok(result);}
 @PutMapping public ApiResponse<Config> put(@PathVariable long stationId,@RequestBody Request r){
  if(r==null||r.expectedVersion()==null||r.expectedVersion()<0)throw new BusinessException(400,"缺少有效版本");
  return TariffTemplateService.transaction(s,()->{s.db.queryForObject("SELECT pg_advisory_xact_lock_shared(78291001)",Object.class);s.access.requireStationPermission(stationId,"asset.read");s.access.requireStationPermission(stationId,"asset.edit");s.one("SELECT id FROM station WHERE id=? FOR UPDATE",stationId);var before=read(stationId);if(before.version()!=r.expectedVersion())throw new BusinessException(409,"显示设置已变化，请刷新后重试");s.db.update("INSERT INTO station_display_settings(station_id,power_factor_visible,revenue_visible,version) VALUES(?,?,?,?) ON CONFLICT(station_id) DO UPDATE SET power_factor_visible=excluded.power_factor_visible,revenue_visible=excluded.revenue_visible,version=excluded.version,updated_at=now()",stationId,r.powerFactorVisible(),r.revenueVisible(),before.version()+1);var after=read(stationId);s.auditStation("station.display-settings.save",stationId,Map.of("before",before,"after",after));return ApiResponse.ok(after);});
 }
}
