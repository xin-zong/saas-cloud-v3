package com.enerlution.ems.business;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
@Service
public class TariffLibraryService {
 private final DomainSupport s;private final TariffTemplateService templates;
 public TariffLibraryService(DomainSupport s,TariffTemplateService templates){this.s=s;this.templates=templates;}
 public record Metadata(String siteType,String priceType,String country,String area,LocalDate validFrom,LocalDate validUntil,@JsonDeserialize(using=TariffTemplateService.StrictText.class) String demandPrice,@JsonDeserialize(using=TariffTemplateService.StrictText.class) String capacityPrice){@com.fasterxml.jackson.annotation.JsonAnySetter public void unknown(String key,Object value){TariffTemplateService.rejectUnknown();}}
 public record Request(@JsonDeserialize(using=TariffTemplateService.StrictText.class) String name,@JsonDeserialize(using=TariffTemplateService.StrictText.class) String currency,@JsonDeserialize(using=TariffTemplateService.StrictText.class) String pricingMode,List<TariffTemplateService.Period> periods,Metadata metadata,@JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){@com.fasterxml.jackson.annotation.JsonAnySetter public void unknown(String key,Object value){TariffTemplateService.rejectUnknown();}}
 public record Entry(TariffTemplateService.Template template,Metadata metadata,String createdBy,String createdAt){}
 private long tenant(){s.access.requirePermission("tariff.manage");return s.access.context().tenantId();}
 static void validateMetadata(String site,String type,String country,String area,LocalDate from,LocalDate until,String demand,String capacity){
  if(!Set.of("COMMERCIAL_INDUSTRIAL_ROOF","HOUSE_ROOF").contains(Objects.toString(site,"")) || !"purchase".equals(type))throw TariffTemplateService.invalid("只支持已接入购电流程的工商业/户用费率");
  if(!"ES".equals(country)||!"all".equals(area))throw TariffTemplateService.invalid("目前仅核验西班牙/EUR及全部地区");
  if(from==null||until==null||!until.isAfter(from))throw TariffTemplateService.invalid("有效周期无效，结束日期不含且须晚于开始日期");
  decimal(demand);decimal(capacity);
 }
 private static BigDecimal decimal(String value){if(value==null||value.isBlank())return null;if(value.length()>64||!value.matches("-?[0-9]+(?:\\.[0-9]{1,6})?"))throw TariffTemplateService.invalid("年单价须为最多六位小数的十进制字符串");var price=new BigDecimal(value);if(price.abs().compareTo(new BigDecimal("99999999.999999"))>0)throw TariffTemplateService.invalid("年单价超出支持范围");return price;}
 static void checkDates(LocalDate from,LocalDate until,LocalDate bindingFrom,LocalDate bindingUntil){if(bindingFrom==null||bindingUntil==null||bindingFrom.isBefore(from)||bindingUntil.isAfter(until))throw new BusinessException(409,"绑定周期须位于费率版本的有效周期内");}
 static void checkProfile(String siteType,String stationType,String country){String actual=Objects.toString(stationType,"").strip();boolean match=siteType.equals("HOUSE_ROOF")?Set.of("residential","户用","Residential","HOUSE_ROOF").contains(actual):Set.of("commercial","工商业","C&I","COMMERCIAL_INDUSTRIAL_ROOF").contains(actual);if(!match||!Set.of("es","spain","西班牙").contains(Objects.toString(country,"").strip().toLowerCase(Locale.ROOT)))throw new BusinessException(409,"场站国家或类型不符合费率适用范围，缺少资料时请先补全场站资料");}
 static void bindingDates(DomainSupport s,long station,Object template,Object version,LocalDate from,LocalDate until){
  if(template==null||version==null)return;
  // Retain legacy databases/fixtures; new metadata is opt-in and never guessed for old prices.
  if(s.db.queryForObject("SELECT to_regclass('tariff_library_metadata')",String.class)==null)return;
  var rows=s.db.queryForList("SELECT site_type,valid_from,valid_until FROM tariff_library_metadata WHERE template_id=?::uuid AND version=?",template.toString(),((Number)version).longValue());
  if(!rows.isEmpty()){var row=rows.getFirst();var profiles=s.db.queryForList("SELECT country,details->>'siteType' AS site_type FROM station_profile WHERE station_id=?",station);if(profiles.isEmpty())throw new BusinessException(409,"缺少场站适用国家/类型资料");checkProfile((String)row.get("site_type"),(String)profiles.getFirst().get("site_type"),(String)profiles.getFirst().get("country"));checkDates(((java.sql.Date)row.get("valid_from")).toLocalDate(),((java.sql.Date)row.get("valid_until")).toLocalDate(),from,until);}
 }
 public List<Entry> list(){long tenant=tenant();var prices=templates.list();var metadata=s.db.queryForList("SELECT m.*,u.display_name FROM tariff_library_metadata m JOIN tariff_template t ON t.id=m.template_id JOIN app_user u ON u.id=t.created_by WHERE m.tenant_id=?",tenant);return prices.stream().map(price->{var row=metadata.stream().filter(m->m.get("template_id").toString().equals(price.id())&&((Number)m.get("version")).longValue()==price.version()).findFirst();if(row.isEmpty())return new Entry(price,null,null,null);var m=row.get();return new Entry(price,new Metadata((String)m.get("site_type"),(String)m.get("price_type"),(String)m.get("country"),(String)m.get("area"),((java.sql.Date)m.get("valid_from")).toLocalDate(),((java.sql.Date)m.get("valid_until")).toLocalDate(),text(m.get("demand_price")),text(m.get("capacity_price"))),(String)m.get("display_name"),m.get("created_at").toString());}).toList();}
 private static String text(Object value){return value==null?null:value.toString();}
 public List<Map<String,Object>> automatic(){tenant();return s.db.queryForList("SELECT code,source,country,area,postal_code,currency,is_mock,live_connected FROM tariff_automatic_catalog ORDER BY country,code");}
 public Entry save(UUID id,Request request){long tenant=tenant();if(request==null||request.metadata()==null)throw TariffTemplateService.invalid("缺少费率信息");var m=request.metadata();validateMetadata(m.siteType(),m.priceType(),m.country(),m.area(),m.validFrom(),m.validUntil(),m.demandPrice(),m.capacityPrice());if(!"EUR".equals(request.currency()))throw TariffTemplateService.invalid("西班牙费率币种须为EUR");return TariffTemplateService.transaction(s,()->{
  var price=id==null?templates.create(new TariffTemplateService.CreateRequest(request.name(),request.currency(),request.pricingMode(),request.periods())):templates.update(id,new TariffTemplateService.UpdateRequest(request.name(),request.currency(),request.pricingMode(),request.periods(),request.expectedVersion()));
  s.db.update("INSERT INTO tariff_library_metadata(template_id,version,tenant_id,site_type,price_type,country,area,valid_from,valid_until,demand_price,capacity_price) VALUES(?::uuid,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(template_id,version) DO UPDATE SET site_type=excluded.site_type,price_type=excluded.price_type,country=excluded.country,area=excluded.area,valid_from=excluded.valid_from,valid_until=excluded.valid_until,demand_price=excluded.demand_price,capacity_price=excluded.capacity_price",price.id(),price.version(),tenant,m.siteType(),m.priceType(),m.country(),m.area(),m.validFrom(),m.validUntil(),decimal(m.demandPrice()),decimal(m.capacityPrice()));
  s.audit("tariff-library.save",Map.of("templateId",price.id(),"version",price.version(),"annualFees","configuration-only"));return list().stream().filter(row->row.template().id().equals(price.id())).findFirst().orElseThrow();
 });}
}


