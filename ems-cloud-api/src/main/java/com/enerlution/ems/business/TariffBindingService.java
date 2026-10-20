package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;

/** Future-only changes; every binding state is also persisted as an immutable historical snapshot. */
@Service
public class TariffBindingService {
  private final DomainSupport s;private final Clock clock;private final ObjectMapper json=new ObjectMapper();
  private static final ZoneId ZONE=ZoneId.of("Asia/Shanghai");
  public record Binding(String id,String stationId,String templateId,Long templateVersion,String name,String currency,String pricingMode,
      List<TariffTemplateService.Period> periods,LocalDate validFrom,LocalDate validUntil,boolean active,long version,boolean modifiable) {}
  public record CreateRequest(UUID templateId,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedTemplateVersion,LocalDate validFrom,LocalDate validUntil){
    @JsonAnySetter public void unknown(String key,Object value){TariffTemplateService.rejectUnknown();}
  }
  public record UpdateRequest(LocalDate validFrom,LocalDate validUntil,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){
    @JsonAnySetter public void unknown(String key,Object value){TariffTemplateService.rejectUnknown();}
  }
  public TariffBindingService(DomainSupport s,Clock clock){this.s=s;this.clock=clock;}
  static boolean modifiable(LocalDate from,Clock clock){return from!=null && !from.isBefore(LocalDate.now(clock.withZone(ZONE)).plusDays(1));}
  static void dates(LocalDate from,LocalDate until,Clock clock){if(from==null || until==null || !until.isAfter(from) || !modifiable(from,clock))throw TariffTemplateService.invalid("有效期须从上海明天或以后开始，结束日期不含且须晚于开始日期");}
  private void permission(long station){s.access.requireStationPermission(station,"tariff.manage");}
  public List<Binding> list(long station,boolean includeInactive){permission(station);return s.db.query("SELECT h.* FROM station_tariff st JOIN station_tariff_history h ON h.binding_id=st.id AND h.version=st.version WHERE st.station_id=?"+(includeInactive?"":" AND st.active")+" ORDER BY st.valid_from DESC,st.id DESC",this::row,station);}
  public List<Binding> history(long station,long id){permission(station);s.one("SELECT id FROM station_tariff WHERE id=? AND station_id=?",id,station);return s.db.query("SELECT * FROM station_tariff_history WHERE station_id=? AND binding_id=? ORDER BY version",this::row,station,id).stream().map(b->new Binding(b.id(),b.stationId(),b.templateId(),b.templateVersion(),b.name(),b.currency(),b.pricingMode(),b.periods(),b.validFrom(),b.validUntil(),b.active(),b.version(),false)).toList();}
  public Binding create(long station,CreateRequest request){
    permission(station);if(request==null || request.templateId()==null)throw TariffTemplateService.invalid("请选择模板");TariffTemplateService.version(request.expectedTemplateVersion());dates(request.validFrom(),request.validUntil(),clock);
    return write(station,()->{
      var source=new TariffTemplateService(s).forBinding(request.templateId(),request.expectedTemplateVersion());
      long stationTenant=((Number)s.one("SELECT tenant_id FROM station WHERE id=?",station).get("tenant_id")).longValue();
      if(stationTenant!=source.tenant())throw new BusinessException(403,"模板与站点须属于同一企业");
      // Either the station lock or the template lock may have waited across Shanghai midnight.
      dates(request.validFrom(),request.validUntil(),clock);
      TariffLibraryService.bindingDates(s,station,source.templateId(),source.version(),request.validFrom(),request.validUntil());
      long id=s.db.queryForObject("INSERT INTO station_tariff(station_id,tariff_id,template_id,template_version,valid_from,valid_until) VALUES(?,?,?,?,?,?) RETURNING id",Long.class,station,source.tariffId(),source.templateId(),source.version(),request.validFrom(),request.validUntil());
      audit("create",station,id,1);return one(station,id);
    });
  }
  public Binding update(long station,long id,UpdateRequest request){
    permission(station);if(request==null)throw TariffTemplateService.invalid("缺少日期配置");long expected=TariffTemplateService.version(request.expectedVersion());dates(request.validFrom(),request.validUntil(),clock);
    return write(station,()->{locked(station,id,expected);dates(request.validFrom(),request.validUntil(),clock);var source=s.one("SELECT template_id,template_version FROM station_tariff WHERE id=? AND station_id=?",id,station);TariffLibraryService.bindingDates(s,station,source.get("template_id"),source.get("template_version"),request.validFrom(),request.validUntil());s.db.update("UPDATE station_tariff SET valid_from=?,valid_until=?,version=version+1 WHERE id=? AND station_id=?",request.validFrom(),request.validUntil(),id,station);audit("dates",station,id,expected+1);return one(station,id);});
  }
  public void unbind(long station,long id,Long expectedVersion){
    permission(station);long expected=TariffTemplateService.version(expectedVersion);
    write(station,()->{locked(station,id,expected);s.db.update("UPDATE station_tariff SET active=false,version=version+1 WHERE id=? AND station_id=?",id,station);audit("unbind",station,id,expected+1);return null;});
  }
  private void locked(long station,long id,long expected){
    var row=s.one("SELECT valid_from,active,version FROM station_tariff WHERE id=? AND station_id=? FOR UPDATE",id,station);
    if(((Number)row.get("version")).longValue()!=expected || !Boolean.TRUE.equals(row.get("active")))throw new BusinessException(409,"绑定已更新或解除，请刷新后重试");
    LocalDate from=((java.sql.Date)row.get("valid_from")).toLocalDate();
    if(!modifiable(from,clock))throw new BusinessException(409,"当前或历史已生效绑定只读；本批仅支持未来绑定改期或解除");
  }
  private Binding one(long station,long id){return s.db.query("SELECT h.* FROM station_tariff st JOIN station_tariff_history h ON h.binding_id=st.id AND h.version=st.version WHERE st.station_id=? AND st.id=?",this::row,station,id).getFirst();}
  private Binding row(java.sql.ResultSet rs,int index)throws SQLException{
    List<TariffTemplateService.Period> periods;
    try{periods=List.of(json.readValue(rs.getString("periods"),TariffTemplateService.Period[].class));}catch(Exception e){throw new BusinessException(503,"费率历史暂不可用");}
    UUID template=rs.getObject("template_id",UUID.class);Number templateVersion=(Number)rs.getObject("template_version");LocalDate from=rs.getDate("valid_from").toLocalDate();boolean active=rs.getBoolean("active");
    return new Binding(Long.toString(rs.getLong("binding_id")),Long.toString(rs.getLong("station_id")),template==null?null:template.toString(),templateVersion==null?null:templateVersion.longValue(),rs.getString("name"),rs.getString("currency"),rs.getString("pricing_mode"),periods,from,rs.getDate("valid_until").toLocalDate(),active,rs.getLong("version"),active && modifiable(from,clock));
  }
  private <T>T write(long station,Supplier<T> action){return TariffTemplateService.transaction(s,()->{s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"tariff-binding:"+station);return action.get();});}
  private void audit(String action,long station,long id,long version){s.auditStation("tariff-binding."+action,station,Map.of("bindingId",Long.toString(id),"version",version));}
}


