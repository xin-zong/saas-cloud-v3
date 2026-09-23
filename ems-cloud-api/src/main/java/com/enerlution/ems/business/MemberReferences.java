package com.enerlution.ems.business;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;

/** Blocks even cascading references before deleting an account; history must never disappear. */
final class MemberReferences {
  private final JdbcTemplate db;

  MemberReferences(JdbcTemplate db) {
    this.db = db;
  }

  boolean exists(long member) {
    // Discover schema-local references so future business tables fail closed as well.
    for (var ref :
        db.queryForList(
            """
SELECT ns.nspname AS schema_name,t.relname AS table_name,a.attname AS column_name
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
WHERE c.contype='f' AND c.confrelid='app_user'::regclass AND ns.nspname=current_schema()
""")) {
      String table = quote(ref.get("schema_name")) + "." + quote(ref.get("table_name"));
      if (Boolean.TRUE.equals(
          db.queryForObject(
              "SELECT EXISTS(SELECT 1 FROM "
                  + table
                  + " WHERE "
                  + quote(ref.get("column_name"))
                  + "=?)",
              Boolean.class,
              member))) return true;
    }
    var json = new ObjectMapper();
    for (String detail :
        db.queryForList(
            "SELECT detail FROM audit_event WHERE action IN"
                + " ('member.grant.create','member.grant.edit','member.grant.revoke')",
            String.class)) {
      try {
        var target = json.readTree(detail).path("memberId");
        if (target.isIntegralNumber() && target.canConvertToLong() && target.longValue() == member)
          return true;
      } catch (com.fasterxml.jackson.core.JsonProcessingException ignored) {
        // Legacy free-text audits are not cast to JSON or matched by ambiguous substrings.
      }
    }
    return false;
  }

  private String quote(Object identifier) {
    return "\"" + identifier.toString().replace("\"", "\"\"") + "\"";
  }
}
