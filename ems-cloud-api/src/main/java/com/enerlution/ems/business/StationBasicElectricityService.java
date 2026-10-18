package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;

@Service
public class StationBasicElectricityService {
  private final DomainSupport s;
  public StationBasicElectricityService(DomainSupport s){this.s=s;}
  public record Request(String pricePolicy,String priceType,String transformerCapacityKva,String contractDemandKw,String consumerNumber,
      @JsonDeserialize(using=TariffTemplateService.StrictVersion.class) Long expectedVersion){
    @JsonAnySetter public void unknown(String key,Object value){throw invalid("存在不支持的配置字段");}
  }
  public record Config(String stationId,String pricePolicy,String priceType,String transformerCapacityKva,String contractDemandKw,String consumerNumber,long version,boolean billingConnected){}
  private void permission(long station){s.access.requireStationPermission(station,"asset.read");s.access.requireStationPermission(station,"tariff.manage");}
  public Config get(long station){permission(station);Config result=read(station);permission(station);return result;}
  private Config read(long station){
    var rows=s.db.query("SELECT * FROM station_basic_electricity WHERE station_id=?",(rs,i)->new Config(Long.toString(rs.getLong("station_id")),rs.getString("price_policy"),rs.getString("price_type"),rs.getString("transformer_capacity_kva"),rs.getString("contract_demand_kw"),rs.getString("consumer_number"),rs.getLong("version"),false),station);
    return rows.isEmpty()?null:rows.getFirst();
  }
  static BigDecimal decimal(String value){
    if(value==null||!value.matches("[0-9]+(?:\\.[0-9]{1,2})?")||value.length()>20)throw invalid("容量/需量须为0–65535，最多两位小数");
    var number=new BigDecimal(value);if(number.compareTo(new BigDecimal("65535"))>0)throw invalid("容量/需量不能超过65535");return number;
  }
  static void validate(Request r){
    if(r==null||r.expectedVersion()==null||r.expectedVersion()<0)throw invalid("缺少有效配置版本");
    if(r.consumerNumber()==null||r.consumerNumber().length()>50)throw invalid("户号最多50个字符");
    if("single".equals(r.pricePolicy())){
      if(r.priceType()!=null||r.transformerCapacityKva()!=null||r.contractDemandKw()!=null)throw invalid("单一制不能提交两部制参数");
    }else if("two-part".equals(r.pricePolicy())){
      if("capacity".equals(r.priceType())){decimal(r.transformerCapacityKva());if(r.contractDemandKw()!=null)throw invalid("容量制不能提交合同需量");}
      else if("contract-demand".equals(r.priceType())){decimal(r.contractDemandKw());if(r.transformerCapacityKva()!=null)throw invalid("合同需量制不能提交变压器容量");}
      else if("actual-demand".equals(r.priceType())){if(r.transformerCapacityKva()!=null||r.contractDemandKw()!=null)throw invalid("实际需量不能提交容量或合同需量");}
      else throw invalid("请选择两部制类型");
    }else throw invalid("请选择电价政策");
  }
  public Config save(long station,Request request){
    permission(station);validate(request);
    return TariffTemplateService.transaction(s,()->{
      s.db.queryForObject("SELECT pg_advisory_xact_lock_shared(78291001)",Object.class);
      s.one("SELECT id FROM station WHERE id=? FOR UPDATE",station);
      s.db.queryForList("SELECT station_id FROM station_profile WHERE station_id=? FOR UPDATE",station);
      permission(station);
      Config current=read(station);long version=current==null?0:current.version();
      if(version!=request.expectedVersion())throw new BusinessException(409,"基本电费配置已变化，请刷新后重新编辑");
      s.db.update("INSERT INTO station_basic_electricity(station_id,price_policy,price_type,transformer_capacity_kva,contract_demand_kw,consumer_number,version) VALUES(?,?,?,?,?,?,?) ON CONFLICT(station_id) DO UPDATE SET price_policy=excluded.price_policy,price_type=excluded.price_type,transformer_capacity_kva=excluded.transformer_capacity_kva,contract_demand_kw=excluded.contract_demand_kw,consumer_number=excluded.consumer_number,version=excluded.version,updated_at=now()",station,request.pricePolicy(),request.priceType(),request.transformerCapacityKva()==null?null:decimal(request.transformerCapacityKva()),request.contractDemandKw()==null?null:decimal(request.contractDemandKw()),request.consumerNumber(),version+1);
      Config result=read(station);
      var detail=new LinkedHashMap<String,Object>();detail.put("stationId",Long.toString(station));detail.put("before",current);detail.put("after",result);
      s.auditStation("station-basic-electricity.save",station,detail);return result;
    });
  }
  private static BusinessException invalid(String message){return new BusinessException(400,message);}
}
