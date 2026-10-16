package com.enerlution.ems.business;

import com.enerlution.ems.common.BusinessException;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Actor-tenant resources: station grants never widen the tenant boundary. */
@Service
public class StationTagService {
  private final DomainSupport s;
  private static final RowMapper<Tag> TAG = (rs, row) -> new Tag(
      rs.getObject("id",UUID.class),rs.getString("name"),rs.getString("description"),rs.getLong("version"));
  public record Tag(UUID id, String name, String description, long version) {}
  public record TagRequest(String name, String description, Long expectedVersion) {}
  public record BindingRequest(List<UUID> tagIds) {}
  public StationTagService(DomainSupport support) { this.s = support; }

  static String normalizeName(String name) {
    if (name == null) throw invalid("标签名称不能为空");
    String value = name.strip();
    if (value.isEmpty() || value.codePointCount(0,value.length()) > 50)
      throw invalid("标签名称应为 1–50 个字符");
    return value;
  }
  static String normalizeDescription(String description) {
    String value = Objects.requireNonNullElse(description, "");
    if (value.codePointCount(0,value.length()) > 500) throw invalid("标签描述最多 500 个字符");
    return value;
  }
  static List<UUID> normalizeIds(BindingRequest request) {
    if (request == null || request.tagIds() == null) throw invalid("tagIds 必须为数组");
    if (request.tagIds().size() > 1000) throw invalid("最多选择 1000 个标签");
    var ids = new LinkedHashSet<UUID>();
    for (UUID id : request.tagIds()) {
      if (id == null) throw invalid("标签 ID 无效");
      ids.add(id);
    }
    return List.copyOf(ids);
  }
  public List<Tag> list(String q, int limit, int offset) {
    s.access.requirePermission("asset.read");
    s.limit(limit); s.offset(offset);
    long tenant = s.access.context().tenantId();
    String keyword = Objects.requireNonNullElse(q, "").strip();
    if (keyword.codePointCount(0,keyword.length()) > 500) throw invalid("搜索内容过长");
    return s.db.query("SELECT id,name,description,version FROM station_tag WHERE tenant_id=? AND position(lower(?) in lower(name))>0 ORDER BY lower(name),id LIMIT ? OFFSET ?",
        TAG,tenant,keyword,limit,offset);
  }
  public Tag create(TagRequest request) {
    s.access.requirePermission("asset.edit");
    validateRequest(request);
    String name = normalizeName(request.name()), description = normalizeDescription(request.description());
    long tenant = s.access.context().tenantId(), actor = s.access.userId();
    return write(() -> {
      UUID id = UUID.randomUUID();
      s.db.update("INSERT INTO station_tag(id,tenant_id,created_by,name,description) VALUES(?,?,?,?,?)",id,tenant,actor,name,description);
      s.audit("station-tag.create",Map.of("tagId",id,"name",name));
      return new Tag(id,name,description,1);
    });
  }
  public Tag update(UUID id, TagRequest request) {
    s.access.requirePermission("asset.edit");
    validateRequest(request); requireVersion(request.expectedVersion());
    String name = normalizeName(request.name()), description = normalizeDescription(request.description());
    long tenant = s.access.context().tenantId();
    return write(() -> {
      Tag current = lockedTag(id,tenant);
      checkVersion(current,request.expectedVersion());
      s.db.update("UPDATE station_tag SET name=?,description=?,version=version+1,updated_at=clock_timestamp() WHERE id=? AND tenant_id=?",name,description,id,tenant);
      s.audit("station-tag.update",Map.of("tagId",id,"version",current.version()+1));
      return new Tag(id,name,description,current.version()+1);
    });
  }
  public void delete(UUID id, Long expectedVersion) {
    s.access.requirePermission("asset.edit");
    requireVersion(expectedVersion);
    long tenant = s.access.context().tenantId();
    write(() -> {
      checkVersion(lockedTag(id,tenant),expectedVersion);
      if (Boolean.TRUE.equals(s.db.queryForObject("SELECT exists(SELECT 1 FROM station_tag_link WHERE tag_id=?)",Boolean.class,id)))
        throw new BusinessException(409,"标签仍被站点使用，请先解除关联");
      s.db.update("DELETE FROM station_tag WHERE id=? AND tenant_id=?",id,tenant);
      s.audit("station-tag.delete",Map.of("tagId",id));
      return null;
    });
  }
  public List<Tag> stationTags(long station) {
    s.access.requireStationPermission(station,"asset.read");
    long tenant = s.access.context().tenantId();
    requireStationTenant(station,tenant,false);
    return readStationTags(station,tenant);
  }
  public List<Tag> replaceStationTags(long station, BindingRequest request) {
    s.access.requireStationPermission(station,"asset.read");
    s.access.requireStationPermission(station,"asset.edit");
    long tenant = s.access.context().tenantId();
    requireStationTenant(station,tenant,false);
    List<UUID> ids = normalizeIds(request);
    return write(() -> {
      // Serialize whole replacements and lock tags in stable order against concurrent deletion.
      requireStationTenant(station,tenant,true);
      for (UUID id : ids.stream().sorted().toList()) {
        var rows = s.db.queryForList("SELECT tenant_id FROM station_tag WHERE id=? FOR UPDATE",id);
        if (rows.isEmpty()) throw invalid("标签不存在");
        if (((Number) rows.getFirst().get("tenant_id")).longValue() != tenant)
          throw new BusinessException(403,"标签不属于当前企业");
      }
      s.db.update("DELETE FROM station_tag_link WHERE station_id=? AND tenant_id=?",station,tenant);
      for (UUID id : ids)
        s.db.update("INSERT INTO station_tag_link(station_id,tag_id,tenant_id,created_by) VALUES(?,?,?,?)",station,id,tenant,s.access.userId());
      s.audit("station-tag.replace",Map.of("stationId",station,"tagIds",ids));
      return readStationTags(station,tenant);
    });
  }
  private List<Tag> readStationTags(long station,long tenant) {
    return s.db.query("SELECT t.id,t.name,t.description,t.version FROM station_tag t JOIN station_tag_link l ON l.tag_id=t.id AND l.tenant_id=t.tenant_id WHERE l.station_id=? AND l.tenant_id=? ORDER BY lower(t.name),t.id",TAG,station,tenant);
  }
  private void requireStationTenant(long station,long tenant,boolean lock) {
    var row = s.one("SELECT tenant_id FROM station WHERE id=?"+(lock?" FOR UPDATE":""),station);
    if (!(row.get("tenant_id") instanceof Number actual) || actual.longValue() != tenant)
      throw new BusinessException(403,"当前企业不可管理此站点标签");
  }
  private Tag lockedTag(UUID id,long tenant) {
    var rows = s.db.query("SELECT id,name,description,version FROM station_tag WHERE id=? AND tenant_id=? FOR UPDATE",TAG,id,tenant);
    if (rows.isEmpty()) throw new BusinessException(404,"标签不存在");
    return rows.getFirst();
  }
  private <T> T write(Supplier<T> operation) {
    try {
      return new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(s.db.getDataSource())))
          .execute(status -> operation.get());
    } catch (DuplicateKeyException e) {
      throw new BusinessException(409,"标签名称已存在");
    }
  }
  private static void validateRequest(TagRequest request) { if (request == null) throw invalid("请求不能为空"); }
  private static void requireVersion(Long version) { if (version == null || version < 1) throw invalid("expectedVersion 必须为正整数"); }
  private static void checkVersion(Tag tag, long expected) { if (tag.version() != expected) throw new BusinessException(409,"标签已变更，请刷新后重试"); }
  private static BusinessException invalid(String message) { return new BusinessException(400,message); }
}
