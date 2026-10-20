package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Date;
import java.util.*;
import org.springframework.stereotype.Service;
/** Sale, subsidy and self-use drafts. Never publishes purchase-price or settlement records. */
@Service
public class TariffConfigurationService {
 private final DomainSupport s;private final ObjectMapper json=new ObjectMapper();
 public TariffConfigurationService(DomainSupport s){this.s=s;}
 public record Entry(String id,String name,String currency,String pricingMode,List<TariffTemplateService.Period> periods,TariffLibraryService.Metadata metadata,long version,String createdBy,String createdAt,String usage){}
 private long tenant(){s.access.requirePermission("tariff.manage");return s.access.context().tenantId();}
 static TariffTemplateService.Configuration validate(TariffLibraryService.Request request){
  if(request==null||request.metadata()==null)throw TariffTemplateService.invalid("缺少费率信息");var m=request.metadata();
  if(!Set.of("sell","subsidy","selfUse").contains(Objects.toString(m.priceType(),"")))throw TariffTemplateService.invalid("独立配置仅支持售电、补贴或自用，不可转换为购电模板");
  if(m.demandPrice()!=null&&!m.demandPrice().isBlank()||m.capacityPrice()!=null&&!m.capacityPrice().isBlank())throw TariffTemplateService.invalid("非购电配置不支持需量/容量年费");
  TariffLibraryService.validateMetadata(m.siteType(),"purchase",m.country(),m.area(),m.validFrom(),m.validUntil(),null,null);
  if(!"EUR".equals(request.currency()))throw TariffTemplateService.invalid("西班牙费率币种须为EUR");
  return TariffTemplateService.normalize(request.name(),request.currency(),request.pricingMode(),request.periods());
 }
 public List<Entry> list(){return read(tenant(),null);}
 public Entry save(UUID id,TariffLibraryService.Request request){long tenant=tenant();var config=validate(request);var m=request.metadata();long expected=id==null?0:TariffTemplateService.version(request.expectedVersion());
  return TariffTemplateService.transaction(s,()->{
   s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"tariff-configuration:"+tenant);
   UUID key=id==null?UUID.randomUUID():id;long version=1;
   if(id==null){if(request.expectedVersion()!=null)throw TariffTemplateService.invalid("新配置不应包含版本");s.db.update("INSERT INTO tariff_configuration(id,tenant_id,name,price_type,created_by) VALUES(?,?,?,?,?)",key,tenant,config.name(),m.priceType(),s.access.userId());}
   else{var old=locked(tenant,key,expected);if(!m.priceType().equals(old.get("price_type")))throw new BusinessException(409,"已有配置的电价类型不可更改，请另建配置");version=expected+1;s.db.update("UPDATE tariff_configuration SET name=?,version=? WHERE id=? AND tenant_id=?",config.name(),version,key,tenant);}
   s.db.update("INSERT INTO tariff_configuration_version(configuration_id,tenant_id,version,name,currency,pricing_mode,periods,site_type,country,area,valid_from,valid_until) VALUES(?,?,?,?,?,?,?::jsonb,?,?,?,?,?)",key,tenant,version,config.name(),config.currency(),config.pricingMode(),encode(config.periods()),m.siteType(),m.country(),m.area(),m.validFrom(),m.validUntil());
   s.audit("tariff-configuration.save",Map.of("configurationId",key,"version",version,"usage","configuration-only"));return read(tenant,key).getFirst();
  });
 }
 public void archive(UUID id,Long expectedVersion){long tenant=tenant();long expected=TariffTemplateService.version(expectedVersion);TariffTemplateService.transaction(s,()->{locked(tenant,id,expected);s.db.update("UPDATE tariff_configuration SET archived=true,version=version+1 WHERE id=? AND tenant_id=?",id,tenant);s.audit("tariff-configuration.archive",Map.of("configurationId",id,"version",expected+1));return null;});}
 private Map<String,Object> locked(long tenant,UUID id,long expected){var row=s.one("SELECT version,archived,price_type FROM tariff_configuration WHERE id=? AND tenant_id=? FOR UPDATE",id,tenant);if(Boolean.TRUE.equals(row.get("archived")))throw new BusinessException(409,"配置已归档");if(((Number)row.get("version")).longValue()!=expected)throw new BusinessException(409,"配置已被修改，请刷新后重试");return row;}
 private List<Entry> read(long tenant,UUID id){String sql="SELECT c.*,v.currency,v.pricing_mode,v.periods,v.site_type,v.country,v.area,v.valid_from,v.valid_until,u.display_name FROM tariff_configuration c JOIN tariff_configuration_version v ON v.configuration_id=c.id AND v.version=c.version AND v.tenant_id=c.tenant_id JOIN app_user u ON u.id=c.created_by WHERE c.tenant_id=? AND NOT c.archived";var args=new ArrayList<Object>();args.add(tenant);if(id!=null){sql+=" AND c.id=?";args.add(id);}sql+=" ORDER BY lower(c.name),c.id";return s.db.queryForList(sql,args.toArray()).stream().map(row->new Entry(row.get("id").toString(),(String)row.get("name"),(String)row.get("currency"),(String)row.get("pricing_mode"),decode(row.get("periods").toString()),new TariffLibraryService.Metadata((String)row.get("site_type"),(String)row.get("price_type"),(String)row.get("country"),(String)row.get("area"),((Date)row.get("valid_from")).toLocalDate(),((Date)row.get("valid_until")).toLocalDate(),null,null),((Number)row.get("version")).longValue(),(String)row.get("display_name"),row.get("created_at").toString(),"configuration-only")).toList();}
 private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);}}
 private List<TariffTemplateService.Period> decode(String value){try{return List.of(json.readValue(value,TariffTemplateService.Period[].class));}catch(Exception e){throw new IllegalStateException("Cannot read tariff configuration periods",e);}}
}
