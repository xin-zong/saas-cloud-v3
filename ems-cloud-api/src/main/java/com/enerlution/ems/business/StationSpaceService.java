package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Station-scoped spaces and associations; no physical layout or energy aggregation is implied. */
@Service
public class StationSpaceService {
  private final DomainSupport s;
  private static final String SPACE_SELECT="SELECT s.id,s.station_id,s.parent_id,s.name,s.type,s.version,(SELECT count(*) FROM station_space_device l WHERE l.space_id=s.id) AS device_count FROM station_space s";
  private static final RowMapper<Space> SPACE=(rs,index)->new Space(rs.getObject("id",UUID.class),Long.toString(rs.getLong("station_id")),rs.getObject("parent_id",UUID.class),rs.getString("name"),rs.getInt("type"),rs.getLong("version"),rs.getLong("device_count"));
  public record Space(UUID id,String stationId,UUID parentId,String name,int type,long version,long deviceCount) {}
  public record Device(String deviceId,String name,String code,UUID spaceId,String spaceName) {}
  public record Devices(List<Device> items,long total) {}
  public record CreateRequest(UUID parentId,String name,@JsonDeserialize(using=StrictInteger.class) Integer type) {}
  public record RenameRequest(String name,@JsonDeserialize(using=StrictVersion.class) Long expectedVersion) {}
  public record MoveRequest(UUID parentId,@JsonDeserialize(using=StrictVersion.class) Long expectedVersion) {}
  public record BindRequest(@JsonDeserialize(contentUsing=StrictDeviceId.class) List<String> deviceIds,@JsonDeserialize(using=StrictVersion.class) Long expectedVersion) {}
  public StationSpaceService(DomainSupport s) { this.s=s; }

  public static final class StrictDeviceId extends StdDeserializer<String> {
    public StrictDeviceId() { super(String.class); }
    @Override public String deserialize(JsonParser parser,DeserializationContext context) throws IOException {
      if(parser.currentToken()!=JsonToken.VALUE_STRING)throw JsonMappingException.from(parser,"Device IDs must be strings");
      return parser.getText();
    }
  }
  public static final class StrictInteger extends StdDeserializer<Integer> {
    public StrictInteger() { super(Integer.class); }
    @Override public Integer deserialize(JsonParser parser,DeserializationContext context) throws IOException {
      if(parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw JsonMappingException.from(parser,"Space type must be an integer");
      return parser.getIntValue();
    }
  }
  public static final class StrictVersion extends StdDeserializer<Long> {
    public StrictVersion() { super(Long.class); }
    @Override public Long deserialize(JsonParser parser,DeserializationContext context) throws IOException {
      if(parser.currentToken()!=JsonToken.VALUE_NUMBER_INT)throw JsonMappingException.from(parser,"expectedVersion must be an integer");
      return parser.getLongValue();
    }
  }
  static String normalizeName(String name) {
    if(name==null)throw invalid("空间名称不能为空");
    String value=name.strip();
    // 80 is this project's explicit bound; the reference source did not define a maximum.
    if(value.isEmpty() || value.codePointCount(0,value.length())>80)throw invalid("空间名称应为 1–80 个字符");
    return value;
  }
  static int validateType(Integer type) {
    // Confirmed source + zh-cn locale: 10期 / 20座 / 30栋 / 40层 / 50室 / 60房间.
    if(type==null || !Set.of(10,20,30,40,50,60).contains(type))throw invalid("空间类型无效");
    return type;
  }
  static List<Long> normalizeDeviceIds(List<String> ids) {
    if(ids==null || ids.isEmpty() || ids.size()>200)throw invalid("请选择 1–200 台设备");
    var unique=new LinkedHashSet<Long>();
    for(String id:ids)unique.add(deviceId(id));
    return List.copyOf(unique);
  }
  private static long deviceId(String id) {
    try {
      if(id==null || !id.matches("[1-9][0-9]{0,18}"))throw new NumberFormatException();
      return Long.parseLong(id);
    } catch(NumberFormatException e) { throw invalid("设备 ID 无效"); }
  }
  private static void requireVersion(Long version) {
    if(version==null || version<1)throw invalid("expectedVersion 必须为正整数");
  }
  private void requireWrite(long station) {
    s.access.requireStationPermission(station,"asset.read");
    s.access.requireStationPermission(station,"asset.edit");
  }
  public List<Space> list(long station) {
    s.access.requireStationPermission(station,"asset.read");
    return s.db.query(SPACE_SELECT+" WHERE s.station_id=? ORDER BY lower(s.name),s.id",SPACE,station);
  }
  public Space create(long station,CreateRequest request) {
    requireWrite(station);
    if(request==null)throw invalid("请求不能为空");
    String name=normalizeName(request.name());int type=validateType(request.type());
    return write(station,()->{
      requireParent(station,request.parentId());
      UUID id=UUID.randomUUID();
      s.db.update("INSERT INTO station_space(id,station_id,parent_id,name,type,created_by) VALUES(?,?,?,?,?,?)",id,station,request.parentId(),name,type,s.access.userId());
      audit("create",station,id,Map.of("name",name,"type",type));
      return one(station,id);
    });
  }
  public Space rename(long station,UUID id,RenameRequest request) {
    requireWrite(station);
    if(request==null)throw invalid("请求不能为空");
    requireVersion(request.expectedVersion());String name=normalizeName(request.name());
    return write(station,()->{
      locked(station,id,request.expectedVersion());
      s.db.update("UPDATE station_space SET name=?,version=version+1,updated_at=clock_timestamp() WHERE station_id=? AND id=?",name,station,id);
      audit("rename",station,id,Map.of("name",name,"version",request.expectedVersion()+1));
      return one(station,id);
    });
  }
  public Space move(long station,UUID id,MoveRequest request) {
    requireWrite(station);
    if(request==null)throw invalid("请求不能为空");
    requireVersion(request.expectedVersion());
    return write(station,()->{
      locked(station,id,request.expectedVersion());
      requireParent(station,request.parentId());
      if(request.parentId()!=null) {
        if(request.parentId().equals(id) || Boolean.TRUE.equals(s.db.queryForObject("WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM station_space WHERE id=? AND station_id=? UNION SELECT s.id,s.parent_id FROM station_space s JOIN ancestors a ON s.id=a.parent_id WHERE s.station_id=?) SELECT exists(SELECT 1 FROM ancestors WHERE id=?)",Boolean.class,request.parentId(),station,station,id)))
          throw new BusinessException(409,"不能移动到当前空间或其后代空间");
      }
      s.db.update("UPDATE station_space SET parent_id=?,version=version+1,updated_at=clock_timestamp() WHERE station_id=? AND id=?",request.parentId(),station,id);
      var detail=new LinkedHashMap<String,Object>();detail.put("parentId",request.parentId());detail.put("version",request.expectedVersion()+1);
      audit("move",station,id,detail);
      return one(station,id);
    });
  }
  public void delete(long station,UUID id,Long expectedVersion) {
    requireWrite(station);requireVersion(expectedVersion);
    write(station,()->{
      locked(station,id,expectedVersion);
      if(Boolean.TRUE.equals(s.db.queryForObject("SELECT exists(SELECT 1 FROM station_space WHERE parent_id=?) OR exists(SELECT 1 FROM station_space_device WHERE space_id=?)",Boolean.class,id,id)))
        throw new BusinessException(409,"仅可删除没有子空间和关联设备的空叶节点");
      s.db.update("DELETE FROM station_space WHERE station_id=? AND id=?",station,id);
      audit("delete",station,id,Map.of("version",expectedVersion));return null;
    });
  }
  public Devices devices(long station,String q,UUID spaceId,boolean unassigned,int limit,int offset) {
    s.access.requireStationPermission(station,"asset.read");
    s.limit(limit);s.offset(offset);
    if(spaceId!=null && unassigned)throw invalid("空间筛选与未分配筛选不能同时使用");
    String keyword=Objects.requireNonNullElse(q,"").strip();
    if(keyword.codePointCount(0,keyword.length())>500)throw invalid("搜索内容过长");
    if(spaceId!=null)requireParent(station,spaceId);
    var args=new ArrayList<Object>();args.add(station);args.add(keyword);
    String filter=" WHERE d.station_id=? AND position(lower(?) in lower(d.name || ' ' || d.code))>0";
    if(spaceId!=null){filter+=" AND l.space_id=?";args.add(spaceId);}
    if(unassigned)filter+=" AND l.device_id IS NULL";
    args.add(limit);args.add(offset);
    // Count and page share one statement snapshot, including empty out-of-range pages.
    String sql="WITH filtered AS (SELECT d.id AS device_id,d.name,d.code,l.space_id,s.name AS space_name FROM device d LEFT JOIN station_space_device l ON l.device_id=d.id AND l.station_id=d.station_id LEFT JOIN station_space s ON s.id=l.space_id AND s.station_id=d.station_id"+filter+"), page AS (SELECT * FROM filtered ORDER BY device_id LIMIT ? OFFSET ?) SELECT p.*,c.total FROM (SELECT count(*) AS total FROM filtered) c LEFT JOIN page p ON true ORDER BY p.device_id";
    return s.db.query(sql,rs->{
      var items=new ArrayList<Device>();long total=0;
      while(rs.next()) {
        total=rs.getLong("total");
        if(rs.getObject("device_id")!=null)items.add(new Device(Long.toString(rs.getLong("device_id")),rs.getString("name"),rs.getString("code"),rs.getObject("space_id",UUID.class),rs.getString("space_name")));
      }
      return new Devices(List.copyOf(items),total);
    },args.toArray());
  }
  public Space bind(long station,UUID id,BindRequest request) {
    requireWrite(station);
    if(request==null)throw invalid("请求不能为空");
    requireVersion(request.expectedVersion());List<Long> devices=normalizeDeviceIds(request.deviceIds());
    return write(station,()->{
      locked(station,id,request.expectedVersion());
      // Validate the complete batch before inserting any association.
      for(long device:devices.stream().sorted().toList()) {
        requireDeviceStation(station,device);
        requireUnassignedOrSameSpace(device,id);
      }
      for(long device:devices)
        s.db.update("INSERT INTO station_space_device(device_id,station_id,space_id,created_by) VALUES(?,?,?,?) ON CONFLICT(device_id) DO NOTHING",device,station,id,s.access.userId());
      bump(station,id);
      audit("bind",station,id,Map.of("deviceIds",devices.stream().map(String::valueOf).toList(),"version",request.expectedVersion()+1));
      return one(station,id);
    });
  }
  public Space unbind(long station,UUID id,String deviceId,Long expectedVersion) {
    requireWrite(station);requireVersion(expectedVersion);long device=deviceId(deviceId);
    return write(station,()->{
      locked(station,id,expectedVersion);requireDeviceStation(station,device);requireUnassignedOrSameSpace(device,id);
      s.db.update("DELETE FROM station_space_device WHERE station_id=? AND space_id=? AND device_id=?",station,id,device);
      bump(station,id);
      audit("unbind",station,id,Map.of("deviceId",Long.toString(device),"version",expectedVersion+1));
      return one(station,id);
    });
  }
  private Space one(long station,UUID id) {
    var rows=s.db.query(SPACE_SELECT+" WHERE s.station_id=? AND s.id=?",SPACE,station,id);
    if(rows.isEmpty())throw new BusinessException(404,"空间不存在");
    return rows.getFirst();
  }
  private void locked(long station,UUID id,long version) {
    var row=s.one("SELECT version FROM station_space WHERE station_id=? AND id=? FOR UPDATE",station,id);
    if(((Number)row.get("version")).longValue()!=version)throw new BusinessException(409,"空间已更新，请刷新后重试");
  }
  private void requireParent(long station,UUID parent) {
    if(parent==null)return;
    var rows=s.db.queryForList("SELECT station_id FROM station_space WHERE id=?",parent);
    if(rows.isEmpty())throw invalid("父空间或筛选空间不存在");
    if(((Number)rows.getFirst().get("station_id")).longValue()!=station)throw new BusinessException(403,"空间不属于当前站点");
  }
  private void requireDeviceStation(long station,long device) {
    var rows=s.db.queryForList("SELECT station_id FROM device WHERE id=? FOR UPDATE",device);
    if(rows.isEmpty())throw invalid("设备不存在");
    if(((Number)rows.getFirst().get("station_id")).longValue()!=station)throw new BusinessException(403,"设备不属于当前站点");
  }
  private void requireUnassignedOrSameSpace(long device,UUID space) {
    var links=s.db.queryForList("SELECT space_id FROM station_space_device WHERE device_id=?",UUID.class,device);
    if(!links.isEmpty() && !links.getFirst().equals(space))throw new BusinessException(409,"设备已关联其他空间，请先明确解除关联");
  }
  private void bump(long station,UUID id) {
    s.db.update("UPDATE station_space SET version=version+1,updated_at=clock_timestamp() WHERE station_id=? AND id=?",station,id);
  }
  private void audit(String action,long station,UUID id,Map<String,?> extra) {
    var detail=new LinkedHashMap<String,Object>();detail.put("spaceId",id);detail.putAll(extra);
    s.auditStation("station-space."+action,station,detail);
  }
  private <T> T write(long station,Supplier<T> operation) {
    try {
      return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource())))
          .execute(status->{
            // The migration's tree/device triggers take this exact same lock.
            s.db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"station-space:"+station);
            return operation.get();
          });
    } catch(DuplicateKeyException e) { throw new BusinessException(409,"同层空间名称或设备关联已存在"); }
  }
  private static BusinessException invalid(String message) { return new BusinessException(400,message); }
}
