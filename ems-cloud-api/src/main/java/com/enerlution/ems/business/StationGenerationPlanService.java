package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Annual kWh configuration only; these values do not calculate actual production or KPIs. */
@Service
public class StationGenerationPlanService {
  private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
  private static final BigDecimal MINIMUM = new BigDecimal("0.01"), MAXIMUM = new BigDecimal("99999999.99");
  private final DomainSupport s;
  private final Clock clock;

  public record Month(
      @JsonDeserialize(using=StrictInteger.class) int month,
      @JsonDeserialize(using=StrictDecimalString.class) String plannedKwh,
      @JsonDeserialize(using=StrictDecimalString.class) String excellentKwh) {}
  public record Plan(UUID id, String stationId, int year, List<Month> months, long version) {}
  public record CreateRequest(@JsonDeserialize(using=StrictInteger.class) Integer year, List<Month> months) {}
  public record UpdateRequest(List<Month> months, @JsonDeserialize(using=StrictVersion.class) Long expectedVersion) {
    @JsonAnySetter public void rejectUnexpectedField(String field, Object value) {
      throw new IllegalArgumentException("更新仅支持 months 和 expectedVersion，年份不可修改");
    }
  }
  public StationGenerationPlanService(DomainSupport s, Clock clock) { this.s=s; this.clock=clock; }

  public static final class StrictDecimalString extends StdDeserializer<String> {
    public StrictDecimalString() { super(String.class); }
    @Override public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
      if (parser.currentToken()!=JsonToken.VALUE_STRING)
        throw JsonMappingException.from(parser,"kWh values must be decimal strings");
      return parser.getText();
    }
  }
  public static final class StrictInteger extends StdDeserializer<Integer> {
    public StrictInteger() { super(Integer.class); }
    @Override public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
      if (parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)
        throw JsonMappingException.from(parser,"Year and month must be integers");
      return parser.getIntValue();
    }
  }
  public static final class StrictVersion extends StdDeserializer<Long> {
    public StrictVersion() { super(Long.class); }
    @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
      if (parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)
        throw JsonMappingException.from(parser,"expectedVersion must be an integer");
      return parser.getLongValue();
    }
  }

  static List<Month> normalizeMonths(List<Month> months) {
    if (months==null || months.size()!=12) throw invalid("必须填写全部 12 个月");
    var normalized = new TreeMap<Integer,Month>();
    for (Month month : months) {
      if (month==null || month.month()<1 || month.month()>12 || normalized.containsKey(month.month()))
        throw invalid("月份必须为不重复的 1–12 月");
      normalized.put(month.month(),new Month(month.month(),amount(month.plannedKwh()),
          month.excellentKwh()==null ? null : amount(month.excellentKwh())));
    }
    return List.copyOf(normalized.values());
  }
  private static String amount(String input) {
    if (input==null || input.length()>64 || !input.matches("[0-9]+(?:\\.[0-9]{1,2})?"))
      throw invalid("计划电量须为最多 2 位小数的十进制字符串，单位 kWh");
    BigDecimal number = new BigDecimal(input);
    if (number.compareTo(MINIMUM)<0 || number.compareTo(MAXIMUM)>0)
      throw invalid("计划电量须为 0.01–99999999.99 kWh");
    return number.setScale(2).toPlainString();
  }
  int validateNewYear(Integer year) {
    int current = LocalDate.now(clock.withZone(BUSINESS_ZONE)).getYear();
    if (year==null || year<current-20 || year>current+20) throw invalid("新建年份须在上海时区当前年前后 20 年内");
    return year;
  }
  private static void requireVersion(Long version) {
    if (version==null || version<1) throw invalid("expectedVersion 必须为正整数");
  }
  private void requireWrite(long station) {
    s.access.requireStationPermission(station,"asset.read");
    s.access.requireStationPermission(station,"asset.edit");
  }
  public List<Plan> list(long station, Integer year) {
    s.access.requireStationPermission(station,"asset.read");
    if (year!=null && (year<1 || year>9999)) throw invalid("年份无效");
    return read(station,year,null);
  }
  public Plan create(long station, CreateRequest request) {
    requireWrite(station);
    if (request==null) throw invalid("请求不能为空");
    int year = validateNewYear(request.year());
    List<Month> months = normalizeMonths(request.months());
    return write(() -> {
      UUID id = UUID.randomUUID();
      s.db.update("INSERT INTO station_generation_plan(id,station_id,year,created_by) VALUES(?,?,?,?)",id,station,year,s.access.userId());
      insertMonths(id,months);
      audit("create",station,id,year,1,months);
      return read(station,null,id).getFirst();
    });
  }
  public Plan update(long station, UUID id, UpdateRequest request) {
    requireWrite(station);
    if (request==null) throw invalid("请求不能为空");
    requireVersion(request.expectedVersion());
    List<Month> months = normalizeMonths(request.months());
    return write(() -> {
      var current = locked(station,id,request.expectedVersion());
      s.db.update("UPDATE station_generation_plan SET version=version+1,updated_at=clock_timestamp() WHERE id=? AND station_id=?",id,station);
      s.db.update("DELETE FROM station_generation_plan_month WHERE plan_id=?",id);
      insertMonths(id,months);
      audit("update",station,id,((Number)current.get("year")).intValue(),request.expectedVersion()+1,months);
      return read(station,null,id).getFirst();
    });
  }
  public void delete(long station, UUID id, Long expectedVersion) {
    requireWrite(station); requireVersion(expectedVersion);
    write(() -> {
      var current = locked(station,id,expectedVersion);
      s.db.update("DELETE FROM station_generation_plan WHERE id=? AND station_id=?",id,station);
      audit("delete",station,id,((Number)current.get("year")).intValue(),expectedVersion,null);
      return null;
    });
  }
  private Map<String,Object> locked(long station,UUID id,long version) {
    var row = s.one("SELECT year,version FROM station_generation_plan WHERE id=? AND station_id=? FOR UPDATE",id,station);
    if (((Number)row.get("version")).longValue()!=version) throw new BusinessException(409,"发电计划已更新，请刷新后重试");
    return row;
  }
  private void insertMonths(UUID id,List<Month> months) {
    for (Month month : months)
      s.db.update("INSERT INTO station_generation_plan_month(plan_id,month,planned_kwh,excellent_kwh) VALUES(?,?,?,?)",id,month.month(),
          new BigDecimal(month.plannedKwh()),month.excellentKwh()==null ? null : new BigDecimal(month.excellentKwh()));
  }
  private List<Plan> read(long station,Integer year,UUID id) {
    var args = new ArrayList<Object>(); args.add(station);
    String where = " WHERE p.station_id=?";
    if (year!=null) { where+=" AND p.year=?"; args.add(year); }
    if (id!=null) { where+=" AND p.id=?"; args.add(id); }
    // One statement gives header, version and all monthly values the same database snapshot.
    return s.db.query("SELECT p.id,p.station_id,p.year,p.version,m.month,m.planned_kwh,m.excellent_kwh FROM station_generation_plan p LEFT JOIN station_generation_plan_month m ON m.plan_id=p.id"+where+" ORDER BY p.year DESC,p.id,m.month",
        rs -> {
          var rows = new LinkedHashMap<UUID,Plan>();
          while (rs.next()) {
            UUID planId = rs.getObject("id",UUID.class);
            Plan plan = rows.get(planId);
            if (plan==null) {
              plan = new Plan(planId,Long.toString(rs.getLong("station_id")),rs.getInt("year"),new ArrayList<>(),rs.getLong("version"));
              rows.put(planId,plan);
            }
            if (rs.getObject("month")!=null) {
              BigDecimal excellent = rs.getBigDecimal("excellent_kwh");
              plan.months().add(new Month(rs.getInt("month"),rs.getBigDecimal("planned_kwh").setScale(2).toPlainString(),
                  excellent==null ? null : excellent.setScale(2).toPlainString()));
            }
          }
          return rows.values().stream().map(p -> new Plan(p.id(),p.stationId(),p.year(),List.copyOf(p.months()),p.version())).toList();
        },args.toArray());
  }
  private void audit(String operation,long station,UUID id,int year,long version,List<Month> months) {
    var detail = new LinkedHashMap<String,Object>();
    detail.put("planId",id); detail.put("year",year); detail.put("version",version); detail.put("unit","kWh");
    if (months!=null) detail.put("months",months);
    s.auditStation("station-generation-plan."+operation,station,detail);
  }
  private <T> T write(Supplier<T> operation) {
    try {
      return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource())))
          .execute(status -> operation.get());
    } catch (DuplicateKeyException e) {
      throw new BusinessException(409,"该站点已有此年度发电计划");
    }
  }
  private static BusinessException invalid(String message) { return new BusinessException(400,message); }
}
