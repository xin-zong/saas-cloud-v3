package com.enerlution.ems.business;

import com.enerlution.ems.auth.*;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.*;

/** Organization writes share the same lock and transaction as member/grant governance. */
final class OrganizationWorkflows {
  private final DomainSupport s;
  private final GovernanceGuard governance;
  private final GrantDelegation delegation;

  OrganizationWorkflows(DomainSupport s) {
    this.s = s;
    governance = new GovernanceGuard(s.db);
    delegation = new GrantDelegation(s.db, s.access);
  }

  long create(String name, Long parent, Long lead) {
    governance.lock();
    if (parent == null) throw new BusinessException(400, "请选择上级组织");
    s.access.requireOrganizationPermission(parent, "organization.manage");
    if (lead != null) throw new BusinessException(400, "新组织请先添加成员，再设置负责人");
    long id =
        s.db.queryForObject(
            "INSERT INTO organization(name,parent_id) VALUES(?,?) RETURNING id",
            Long.class,
            name.trim(),
            parent);
    initializeRoles(id);
    s.audit("organization.create", Map.of("organizationId", id, "after",
        s.one("SELECT name,parent_id,lead_user_id FROM organization WHERE id=?", id)));
    return id;
  }

  void edit(long id, String name, Long requestedParent, Long lead, boolean updateLead) {
    governance.lock();
    s.access.requireOrganizationPermission(id, "organization.manage");
    var existing = s.one("SELECT name,parent_id,lead_user_id FROM organization WHERE id=? FOR UPDATE", id);
    Long oldParent = (Long) existing.get("parent_id");
    Long parent = requestedParent == null ? oldParent : requestedParent;
    var before = governance.snapshot();
    List<Map<String, Object>> affected = List.of();
    List<Long> invalidatedLeads = new ArrayList<>();
    if (!Objects.equals(parent, oldParent)) {
      if (isManagementRoot(id, oldParent)) throw new BusinessException(409, "不能移动自己的管理根组织");
      var oldBranches = branches(null, null);
      if (oldBranches.get(id).contains(parent)) throw new BusinessException(400, "组织不能移动到自身或下级组织中");
      s.access.requireOrganizationPermission(parent, "organization.manage");
      for (long child : oldBranches.get(id))
        s.access.requireOrganizationPermission(child, "organization.manage");
      var proposed = branches(id, parent);
      for (var relationship :
          s.db.queryForList(
              "SELECT o.id,u.organization_id FROM organization o JOIN app_user u ON"
                  + " u.id=o.lead_user_id WHERE u.organization_id IS NOT NULL")) {
        long leadOrganization = s.number(relationship, "id"),
            membership = s.number(relationship, "organization_id");
        if (oldBranches.get(leadOrganization).contains(membership)
            && !proposed.get(leadOrganization).contains(membership)) {
          s.access.requireOrganizationPermission(leadOrganization, "organization.manage");
          invalidatedLeads.add(leadOrganization);
        }
      }
      affected = affectedGrants(oldBranches, proposed, id);
      for (var grant : affected) {
        requireGrantScope(grant);
        long owner = s.number(grant, "organization_id");
        var added = new HashSet<>(proposed.get(owner));
        added.removeAll(oldBranches.get(owner));
        var codes =
            s.db.queryForList(
                "SELECT permission_code FROM role_permission WHERE role_id=?",
                String.class,
                grant.get("role_id"));
        Timestamp until = (Timestamp) grant.get("valid_until");
        for (long addedOrg : added)
          delegation.requireAddedOrganizationScope(
              addedOrg, codes, until == null ? null : until.toInstant(), "member.grant.manage");
        // customer.manage is station-scoped, but its same-source owner branch also matters.
        if (!added.isEmpty() && codes.contains("customer.manage"))
          delegation.requireDelegation(
              owner,
              s.number(grant, "user_id"),
              stations(grant),
              List.of("customer.manage"),
              until == null ? null : until.toInstant(),
              "member.grant.manage");
      }
    }
    s.db.update("UPDATE organization SET name=?,parent_id=? WHERE id=?", name.trim(), parent, id);
    for (var grant : affected) requireGrantScope(grant);
    if (updateLead) {
      validateLead(id, lead);
      s.db.update("UPDATE organization SET lead_user_id=? WHERE id=?", lead, id);
    }
    // Only relationships valid before and invalid after this move are cleaned up.
    for (long organization : invalidatedLeads)
      s.db.update("UPDATE organization SET lead_user_id=NULL WHERE id=?", organization);
    governance.preserve(before);
    s.audit("organization.edit", Map.of("organizationId", id, "before", existing,
        "after", s.one("SELECT name,parent_id,lead_user_id FROM organization WHERE id=?", id),
        "clearedLeadOrganizations", invalidatedLeads));
  }

  boolean isManagementRoot(long id, Long parent) {
    if (parent == null || !s.access.organizationIds("organization.manage").contains(parent))
      return true;
    return Boolean.TRUE.equals(
        s.db.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM active_member_grant g JOIN app_role r ON r.id=g.role_id"
                + " JOIN role_permission p ON p.role_id=r.id WHERE g.user_id=? AND"
                + " r.organization_id=? AND p.permission_code='organization.manage')",
            Boolean.class,
            s.access.userId(),
            id));
  }

  private void validateLead(long organization, Long lead) {
    if (lead == null) return;
    var members =
        s.db.queryForList("SELECT organization_id,enabled FROM app_user WHERE id=?", lead);
    if (members.isEmpty()
        || !Boolean.TRUE.equals(members.getFirst().get("enabled"))
        || !delegation
            .descendants(organization)
            .contains(members.getFirst().get("organization_id")))
      throw new BusinessException(400, "负责人必须是本组织或下级组织的启用成员");
    delegation.requireMemberScope(lead, "organization.manage");
  }

  private Map<Long, Set<Long>> branches(Long moved, Long parent) {
    Map<Long, Set<Long>> result = new HashMap<>();
    s.db.query(
        """
WITH RECURSIVE edges AS (
  SELECT id,CASE WHEN id=?::bigint THEN ?::bigint ELSE parent_id END parent_id FROM organization
), branch(root,id) AS (
  SELECT id,id FROM edges UNION SELECT b.root,o.id FROM branch b JOIN edges o ON o.parent_id=b.id
) SELECT root,id FROM branch
""",
        rs -> {
          result
              .computeIfAbsent(rs.getLong("root"), ignored -> new HashSet<>())
              .add(rs.getLong("id"));
        },
        moved,
        parent);
    return result;
  }

  private List<Map<String, Object>> affectedGrants(
      Map<Long, Set<Long>> before, Map<Long, Set<Long>> after, long moved) {
    return s
        .db
        .queryForList(
            "SELECT g.*,r.organization_id FROM member_grant g JOIN app_role r ON r.id=g.role_id"
                + " WHERE r.organization_id IS NOT NULL")
        .stream()
        .filter(
            g -> {
              long owner = s.number(g, "organization_id");
              return before.get(moved).contains(owner)
                  || !before.get(owner).equals(after.get(owner));
            })
        .toList();
  }

  private List<Long> stations(Map<String, Object> grant) {
    return s.db.queryForList(
        "SELECT station_id FROM member_grant_station WHERE grant_id=?",
        Long.class,
        grant.get("id"));
  }

  private void requireGrantScope(Map<String, Object> grant) {
    delegation.requireScope(
        s.number(grant, "organization_id"),
        s.number(grant, "user_id"),
        stations(grant),
        "member.grant.manage");
  }

  private void initializeRoles(long organization) {
    try (var input =
        OrganizationWorkflows.class.getResourceAsStream("/permission-role-templates.json")) {
      for (var template : new ObjectMapper().readTree(input)) {
        long role =
            s.db.queryForObject(
                "INSERT INTO app_role(code,name,description,organization_id) VALUES(?,?,?,?)"
                    + " RETURNING id",
                Long.class,
                "org_" + organization + "_" + template.path("code").asText(),
                template.path("name").asText(),
                template.path("description").asText(),
                organization);
        for (var code : template.path("permissions"))
          if (PermissionCatalog.available(code.asText()))
            s.db.update(
                "INSERT INTO role_permission(role_id,permission_code) SELECT ?,code FROM permission"
                    + " WHERE code=?",
                role,
                code.asText());
      }
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Cannot load canonical organization roles", e);
    }
  }
}
