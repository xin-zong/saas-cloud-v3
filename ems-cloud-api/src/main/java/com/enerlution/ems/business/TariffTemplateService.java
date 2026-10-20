package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Tenant-owned manual purchase-price configuration; no billing or external pricing execution. */
@Service
public class TariffTemplateService {
  private final DomainSupport s;
  public record Period(@JsonDeserialize(using=StrictInteger.class) Integer startMinute,
      @JsonDeserialize(using=StrictInteger.class) Integer endMinute,
      @JsonDeserialize(using=StrictText.class) String band,
      @JsonDeserialize(using=StrictText.class) String pricePerKwh) {
    @JsonAnySetter public void unknown(String key,Object value){rejectUnknown();}
  }
  public record Configuration(String name,String currency,String pricingMode,List<Period> periods) {}
  public record Template(String id,String name,String currency,String pricingMode,List<Period> periods,long version) {}
  public record CreateRequest(@JsonDeserialize(using=StrictText.class) String name,
      @JsonDeserialize(using=StrictText.class) String currency,@JsonDeserialize(using=StrictText.class) String pricingMode,List<Period> periods) {
    @JsonAnySetter public void unknown(String key,Object value){rejectUnknown();}
  }
  public record UpdateRequest(@JsonDeserialize(using=StrictText.class) String name,
      @JsonDeserialize(using=StrictText.class) String currency,@JsonDeserialize(using=StrictText.class) String pricingMode,List<Period> periods,
      @JsonDeserialize(using=StrictVersion.class) Long expectedVersion) {
    @JsonAnySetter public void unknown(String key,Object value){rejectUnknown();}
  }
  record Published(long tenant,UUID templateId,long version,long tariffId) {}
  public TariffTemplateService(DomainSupport s){this.s=s;}
  public static final class StrictText extends StdDeserializer<String> {
    public StrictText(){super(String.class);}
    @Override public String deserialize(JsonParser parser,DeserializationContext context)throws IOException{
      if(parser.currentToken()!=JsonToken.VALUE_STRING)throw JsonMappingException.from(parser,"Text and decimal prices must be JSON strings");return parser.getText();
    }
  }
  public static final class StrictInteger extends StdDeserializer<Integer> {
    public StrictInteger(){super(Integer.class);}
    @Override public Integer deserialize(JsonParser parser,DeserializationContext context)throws IOException{
      if(parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw JsonMappingException.from(parser,"Minutes must be integers");return parser.getIntValue();
    }
  }
  public static final class StrictVersion extends StdDeserializer<Long> {
    public StrictVersion(){super(Long.class);}
    @Override public Long deserialize(JsonParser parser,DeserializationContext context)throws IOException{
      if(parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw JsonMappingException.from(parser,"Version must be an integer");return parser.getLongValue();
    }
  }
  static void rejectUnknown(){throw new IllegalArgumentException("请求包含未知字段");}
  static Configuration normalize(String name,String currency,String mode,List<Period> periods){
    if(name==null || name.strip().isEmpty() || name.strip().codePointCount(0,name.strip().length())>50)throw invalid("模板名称应为1–50个字符");
    if(currency==null || !currency.matches("[A-Z]{3}"))throw invalid("币种应为三位大写代码");
    if(mode==null || !Set.of("fixed","tou").contains(mode))throw invalid("仅支持手工固定或时段购电配置");
    if(periods==null || periods.isEmpty() || periods.size()>96 || periods.stream().anyMatch(p->p==null || p.startMinute()==null || p.endMinute()==null))throw invalid("请填写1–96个有效时段");
    var sorted=periods.stream().sorted(Comparator.comparingInt(Period::startMinute)).toList();var result=new ArrayList<Period>();int end=0;
    for(var period:sorted){
      if(period.startMinute()!=end || period.endMinute()<=period.startMinute() || period.endMinute()>1440 || period.band()==null || !Set.of("peak","flat","valley","superPeak","deepValley").contains(period.band()))throw invalid("时段须无缝覆盖全天且使用有效类型");
      String text=period.pricePerKwh();
      if(text==null || text.length()>64 || !text.matches("-?[0-9]+(?:\\.[0-9]{1,6})?"))throw invalid("电价须为最多六位小数的十进制字符串");
      BigDecimal price=new BigDecimal(text);
      if(price.abs().compareTo(new BigDecimal("99999999.999999"))>0)throw invalid("电价绝对值不能超过99999999.999999");
      result.add(new Period(period.startMinute(),period.endMinute(),period.band(),price.setScale(6).toPlainString()));end=period.endMinute();
    }
    if(end!=1440 || (mode.equals("fixed") && (result.size()!=1 || !result.getFirst().band().equals("flat"))))throw invalid("时段须覆盖全天，固定价须为单个全天平时段");
    return new Configuration(name.strip(),currency,mode,List.copyOf(result));
  }
  private long tenant(){s.access.requirePermission("tariff.manage");return s.access.context().tenantId();}
  public List<Template> list(){long tenant=tenant();return read(tenant,null);}
  public Template get(UUID id){return one(tenant(),id);}
  public Template create(CreateRequest request){
    long tenant=tenant();if(request==null)throw invalid("缺少模板内容");var config=normalize(request.name(),request.currency(),request.pricingMode(),request.periods());
    return write(tenant,()->{UUID id=UUID.randomUUID();s.db.update("INSERT INTO tariff_template(id,tenant_id,name,created_by) VALUES(?,?,?,?)",id,tenant,config.name(),s.access.userId());publish(tenant,id,1,config);audit("create",id,1);return one(tenant,id);});
  }
  public Template update(UUID id,UpdateRequest request){
    long tenant=tenant();if(request==null)throw invalid("缺少模板内容");long expected=version(request.expectedVersion());var config=normalize(request.name(),request.currency(),request.pricingMode(),request.periods());
    return write(tenant,()->{locked(tenant,id,expected);s.db.update("UPDATE tariff_template SET name=?,version=version+1 WHERE id=? AND tenant_id=?",config.name(),id,tenant);publish(tenant,id,expected+1,config);audit("update",id,expected+1);return one(tenant,id);});
  }
  public void archive(UUID id,Long expectedVersion){
    long tenant=tenant();long expected=version(expectedVersion);
    write(tenant,()->{locked(tenant,id,expected);s.db.update("UPDATE tariff_template SET archived=true,version=version+1 WHERE id=? AND tenant_id=?",id,tenant);audit("archive",id,expected+1);return null;});
  }
  private void locked(long tenant,UUID id,long expected){
    var row=s.one("SELECT version,archived FROM tariff_template WHERE id=? AND tenant_id=? FOR UPDATE",id,tenant);
    if(Boolean.TRUE.equals(row.get("archived")))throw new BusinessException(409,"模板已归档");
    if(((Number)row.get("version")).longValue()!=expected)throw new BusinessException(409,"模板已更新，请刷新后重试");
  }
  Published forBinding(UUID id,Long expectedVersion){
    long tenant=s.access.context().tenantId();lock(tenant);long expected=version(expectedVersion);locked(tenant,id,expected);
    Long tariff=s.db.queryForObject("SELECT tariff_id FROM tariff_template_version WHERE template_id=? AND version=?",Long.class,id,expected);
    return new Published(tenant,id,expected,Objects.requireNonNull(tariff));
  }
  private void publish(long tenant,UUID id,long version,Configuration config){
    long tariff=s.db.queryForObject("INSERT INTO tariff(name,currency) VALUES(?,?) RETURNING id",Long.class,config.name(),config.currency());
    for(var period:config.periods())s.db.update("INSERT INTO tariff_period(tariff_id,start_minute,end_minute,band,price_per_kwh) VALUES(?,?,?,?,?)",tariff,period.startMinute(),period.endMinute(),period.band(),new BigDecimal(period.pricePerKwh()));
    s.db.update("INSERT INTO tariff_template_version(template_id,tenant_id,version,tariff_id,pricing_mode) VALUES(?,?,?,?,?)",id,tenant,version,tariff,config.pricingMode());
  }
  private List<Template> read(long tenant,UUID id){
    String sql="SELECT t.id,t.name,t.version,v.tariff_id,v.pricing_mode,p.currency FROM tariff_template t JOIN tariff_template_version v ON v.template_id=t.id AND v.version=t.version JOIN tariff p ON p.id=v.tariff_id WHERE t.tenant_id=? AND NOT t.archived";
    var args=new ArrayList<Object>();args.add(tenant);if(id!=null){sql+=" AND t.id=?";args.add(id);}sql+=" ORDER BY lower(t.name),t.id";
    // Finish and release the header result set before reading immutable version periods. A GET
    // has no transaction-bound connection: nested JDBC reads inside its RowMapper need two leases.
    var rows=s.db.queryForList(sql,args.toArray());
    return rows.stream().map(row->new Template(row.get("id").toString(),(String)row.get("name"),
        (String)row.get("currency"),(String)row.get("pricing_mode"),periods(((Number)row.get("tariff_id")).longValue()),
        ((Number)row.get("version")).longValue())).toList();
  }
  List<Period> periods(long tariff){return s.db.query("SELECT start_minute,end_minute,band,price_per_kwh FROM tariff_period WHERE tariff_id=? ORDER BY start_minute",(rs,index)->new Period(rs.getInt("start_minute"),rs.getInt("end_minute"),rs.getString("band"),rs.getBigDecimal("price_per_kwh").setScale(6).toPlainString()),tariff);}
  private Template one(long tenant,UUID id){var rows=read(tenant,id);if(rows.isEmpty())throw new BusinessException(404,"模板不存在或已归档");return rows.getFirst();}
  private void lock(long tenant){s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"tariff-template:"+tenant);}
  private <T>T write(long tenant,Supplier<T> action){return transaction(s,()->{lock(tenant);return action.get();});}
  static <T>T transaction(DomainSupport s,Supplier<T> action){try{return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource()))).execute(status->action.get());}catch(DataIntegrityViolationException ex){
    for(Throwable cause=ex;cause!=null;cause=cause.getCause())if(cause instanceof SQLException sql && Set.of("23505","23P01").contains(sql.getSQLState()))throw new BusinessException(409,"名称或有效区间冲突，请刷新核对");throw ex;}}
  static long version(Long version){if(version==null || version<1)throw invalid("expectedVersion须为正整数");return version;}
  private void audit(String action,UUID id,long version){s.audit("tariff-template."+action,Map.of("templateId",id,"version",version));}
  static BusinessException invalid(String message){return new BusinessException(400,message);}
}

