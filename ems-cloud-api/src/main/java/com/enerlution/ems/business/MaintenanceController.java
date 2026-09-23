package com.enerlution.ems.business;

import com.enerlution.ems.common.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class MaintenanceController {
  private final DomainSupport s;

  public MaintenanceController(DomainSupport s) {
    this.s = s;
  }

  @GetMapping("/stations/{id}/alarms")
  public ApiResponse<?> alarms(
      @PathVariable long id,
      @RequestParam(defaultValue = "100") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    s.access.requireStationPermission(id, "alarm.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT a.id,a.device_id,a.code,a.title,a.severity,a.occurred_at,CASE WHEN"
                + " a.recovered_at<=now() THEN a.recovered_at ELSE NULL END AS"
                + " recovered_at,a.acknowledged_by,a.acknowledged_at,a.sla_due_at,d.name AS"
                + " device_name FROM alarm a JOIN device d ON d.id=a.device_id WHERE d.station_id=?"
                + " AND a.occurred_at<=now() ORDER BY occurred_at DESC,a.id DESC LIMIT ? OFFSET ?",
            id,
            s.limit(limit),
            s.offset(offset)));
  }

  @PostMapping("/alarms/{id}/acknowledge")
  @Transactional
  public ApiResponse<?> acknowledge(@PathVariable long id) {
    var a =
        s.one(
            "SELECT a.*,d.station_id FROM alarm a JOIN device d ON d.id=a.device_id WHERE a.id=?"
                + " FOR UPDATE OF a",
            id);
    s.access.requireStationPermission(s.number(a, "station_id"), "alarm.handle");
    if (a.get("acknowledged_at") == null) {
      s.db.update(
          "UPDATE alarm SET acknowledged_by=?,acknowledged_at=now() WHERE id=?",
          s.access.userId(),
          id);
      s.audit("alarm.acknowledge", "alarm=" + id);
    }
    return ApiResponse.ok(Map.of("id", id));
  }

  public record Note(@NotBlank @Size(max = 4000) String note) {}

  @PostMapping("/alarms/{id}/notes")
  @Transactional
  public ApiResponse<?> alarmNote(@PathVariable long id, @Valid @RequestBody Note note) {
    var a =
        s.one(
            "SELECT d.station_id FROM alarm a JOIN device d ON d.id=a.device_id WHERE a.id=?", id);
    s.access.requireStationPermission(s.number(a, "station_id"), "alarm.handle");
    s.db.update(
        "INSERT INTO alarm_note(alarm_id,author_id,body) VALUES(?,?,?)",
        id,
        s.access.userId(),
        note.note());
    s.audit("alarm.note", "alarm=" + id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/alarms/{id}/notes")
  public ApiResponse<?> alarmNotes(@PathVariable long id) {
    var a =
        s.one(
            "SELECT d.station_id FROM alarm a JOIN device d ON d.id=a.device_id WHERE a.id=?", id);
    s.access.requireStationPermission(s.number(a, "station_id"), "alarm.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT n.id,n.body,n.created_at,u.display_name AS author_name FROM alarm_note n JOIN"
                + " app_user u ON u.id=n.author_id WHERE n.alarm_id=? ORDER BY n.id",
            id));
  }

  @GetMapping("/work-orders")
  public ApiResponse<?> orders(
      @RequestParam(required = false) Long stationId,
      @RequestParam(defaultValue = "false") boolean mine,
      @RequestParam(defaultValue = "100") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    if (stationId != null) s.access.requireStationPermission(stationId, "workorder.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT w.* FROM work_order w JOIN effective_station_permission us ON"
                + " us.station_id=w.station_id WHERE us.user_id=? AND"
                + " us.permission_code='workorder.read' AND (?::bigint IS NULL OR w.station_id=?)"
                + " AND (NOT ? OR w.assigned_to=?) ORDER BY w.created_at DESC,w.id DESC LIMIT ?"
                + " OFFSET ?",
            s.access.userId(),
            stationId,
            stationId,
            mine,
            s.access.userId(),
            s.limit(limit),
            s.offset(offset)));
  }

  public record NewOrder(
      @Positive long stationId,
      @NotBlank @Size(max = 200) String title,
      @NotBlank @Size(max = 4000) String description,
      Long assignedTo,
      OffsetDateTime dueAt,
      Long alarmId) {}

  @PostMapping("/work-orders")
  @Transactional
  public ApiResponse<?> create(@Valid @RequestBody NewOrder n) {
    s.access.requireStationPermission(n.stationId(), "workorder.create");
    assignee(n.assignedTo(), n.stationId(), "workorder.handle");
    if (n.dueAt() != null && n.dueAt().isBefore(OffsetDateTime.now()))
      throw new BusinessException(400, "截止时间不能早于创建时间");
    if (n.alarmId() != null) {
      var alarm =
          s.one(
              "SELECT d.station_id FROM alarm a JOIN device d ON d.id=a.device_id WHERE a.id=?",
              n.alarmId());
      if (s.number(alarm, "station_id") != n.stationId())
        throw new BusinessException(400, "告警不属于该站点");
    }
    Long id =
        s.db.queryForObject(
            "INSERT INTO work_order(station_id,title,description,created_by,assigned_to,due_at)"
                + " VALUES(?,?,?,?,?,?) RETURNING id",
            Long.class,
            n.stationId(),
            n.title(),
            n.description(),
            s.access.userId(),
            n.assignedTo(),
            n.dueAt());
    if (n.alarmId() != null)
      s.db.update("INSERT INTO work_order_alarm VALUES(?,?)", id, n.alarmId());
    event(id, "created", n.description());
    return ApiResponse.ok(Map.of("id", id));
  }

  private void assignee(Long user, long station, String permission) {
    if (user != null && !s.access.hasStationPermission(user, station, permission))
      throw new BusinessException(400, "负责人无该站点所需操作权限");
  }

  private void event(long id, String action, String note) {
    s.db.update(
        "INSERT INTO work_order_event(work_order_id,actor_id,action,note) VALUES(?,?,?,?)",
        id,
        s.access.userId(),
        action,
        note);
    s.audit("workorder." + action, "workOrder=" + id);
  }

  public record Transition(
      @NotBlank String expectedStatus,
      @NotBlank String status,
      @NotBlank @Size(max = 4000) String note) {}

  @PostMapping("/work-orders/{id}/transition")
  @Transactional
  public ApiResponse<?> transition(@PathVariable long id, @Valid @RequestBody Transition n) {
    var w = s.one("SELECT * FROM work_order WHERE id=? FOR UPDATE", id);
    s.access.requireStationPermission(s.number(w, "station_id"), "workorder.handle");
    String current = (String) w.get("status");
    if (!current.equals(n.expectedStatus())) throw new BusinessException(409, "工单已被其他人更新");
    BusinessRules.orderTransition(current, n.status());
    if (n.status().equals("processing")
        && w.get("assigned_to") != null
        && s.number(w, "assigned_to") != s.access.userId())
      throw new BusinessException(403, "仅负责人可接单");
    if (n.status().equals("completed")
        && (w.get("assigned_to") == null || s.number(w, "assigned_to") != s.access.userId()))
      throw new BusinessException(403, "仅负责人可完成工单");
    s.db.update(
        "UPDATE work_order SET status=?,assigned_to=CASE WHEN ?='processing' THEN ? ELSE"
            + " assigned_to END,completed_at=CASE WHEN ?='completed' THEN now() ELSE NULL END WHERE"
            + " id=?",
        n.status(),
        n.status(),
        s.access.userId(),
        n.status(),
        id);
    event(id, n.status(), n.note());
    return ApiResponse.ok(Map.of("id", id, "status", n.status()));
  }

  public record Assignment(@NotNull Long assignedTo) {}

  @PutMapping("/work-orders/{id}/assignee")
  @Transactional
  public ApiResponse<?> assign(@PathVariable long id, @Valid @RequestBody Assignment n) {
    var w = s.one("SELECT * FROM work_order WHERE id=? FOR UPDATE", id);
    long station = s.number(w, "station_id");
    s.access.requireStationPermission(station, "workorder.edit");
    if (!Set.of("pending", "processing").contains(w.get("status")))
      throw new BusinessException(409, "工单已关闭");
    assignee(n.assignedTo(), station, "workorder.handle");
    s.db.update("UPDATE work_order SET assigned_to=? WHERE id=?", n.assignedTo(), id);
    event(id, "assigned", "assignee=" + n.assignedTo());
    return ApiResponse.ok(null);
  }

  @GetMapping("/work-orders/{id}/events")
  public ApiResponse<?> events(@PathVariable long id) {
    var w = s.one("SELECT station_id FROM work_order WHERE id=?", id);
    s.access.requireStationPermission(s.number(w, "station_id"), "workorder.read");
    return ApiResponse.ok(
        s.db.queryForList("SELECT * FROM work_order_event WHERE work_order_id=? ORDER BY id", id));
  }

  @PostMapping("/work-orders/{id}/notes")
  @Transactional
  public ApiResponse<?> orderNote(@PathVariable long id, @Valid @RequestBody Note note) {
    var w = s.one("SELECT station_id FROM work_order WHERE id=? FOR UPDATE", id);
    s.access.requireStationPermission(s.number(w, "station_id"), "workorder.handle");
    event(id, "note", note.note());
    return ApiResponse.ok(null);
  }

  @GetMapping("/stations/{id}/inspections")
  public ApiResponse<?> inspections(
      @PathVariable long id,
      @RequestParam(defaultValue = "100") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    s.access.requireStationPermission(id, "inspection.manage");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT * FROM inspection WHERE station_id=? ORDER BY due_at DESC,id DESC LIMIT ?"
                + " OFFSET ?",
            id,
            s.limit(limit),
            s.offset(offset)));
  }

  public record Inspection(
      @Positive long stationId,
      @NotBlank @Size(max = 200) String title,
      @NotNull OffsetDateTime dueAt,
      Long assignedTo) {}

  @PostMapping("/inspections")
  @Transactional
  public ApiResponse<?> createInspection(@Valid @RequestBody Inspection n) {
    s.access.requireStationPermission(n.stationId(), "inspection.manage");
    assignee(n.assignedTo(), n.stationId(), "inspection.manage");
    Long id =
        s.db.queryForObject(
            "INSERT INTO inspection(station_id,title,due_at,assigned_to) VALUES(?,?,?,?) RETURNING"
                + " id",
            Long.class,
            n.stationId(),
            n.title(),
            n.dueAt(),
            n.assignedTo());
    s.audit("inspection.create", "inspection=" + id);
    return ApiResponse.ok(Map.of("id", id));
  }

  @PostMapping("/inspections/{id}/complete")
  @Transactional
  public ApiResponse<?> completeInspection(@PathVariable long id, @Valid @RequestBody Note n) {
    var i = s.one("SELECT * FROM inspection WHERE id=? FOR UPDATE", id);
    s.access.requireStationPermission(s.number(i, "station_id"), "inspection.manage");
    if (!i.get("status").equals("pending")) throw new BusinessException(409, "巡检已结束");
    if (i.get("assigned_to") != null && s.number(i, "assigned_to") != s.access.userId())
      throw new BusinessException(403, "仅负责人可完成巡检");
    s.db.update(
        "UPDATE inspection SET status='completed',completed_at=now(),result=? WHERE id=?",
        n.note(),
        id);
    s.audit("inspection.complete", "inspection=" + id);
    return ApiResponse.ok(null);
  }

  @GetMapping("/stations/{id}/firmware-tasks")
  public ApiResponse<?> firmware(@PathVariable long id) {
    s.access.requireStationPermission(id, "asset.read");
    return ApiResponse.ok(
        s.db.queryForList(
            "SELECT f.* FROM firmware_task f JOIN device d ON d.id=f.device_id WHERE d.station_id=?"
                + " ORDER BY f.updated_at DESC LIMIT 200",
            id));
  }

  @PostMapping("/inspections/{id}/cancel")
  @Transactional
  public ApiResponse<?> cancelInspection(@PathVariable long id, @Valid @RequestBody Note n) {
    var i = s.one("SELECT * FROM inspection WHERE id=? FOR UPDATE", id);
    s.access.requireStationPermission(s.number(i, "station_id"), "inspection.manage");
    if (!i.get("status").equals("pending")) throw new BusinessException(409, "巡检已结束");
    if (i.get("assigned_to") != null && s.number(i, "assigned_to") != s.access.userId())
      throw new BusinessException(403, "仅负责人可取消巡检");
    s.db.update("UPDATE inspection SET status='cancelled',result=? WHERE id=?", n.note(), id);
    s.audit("inspection.cancel", "inspection=" + id);
    return ApiResponse.ok(null);
  }
}
