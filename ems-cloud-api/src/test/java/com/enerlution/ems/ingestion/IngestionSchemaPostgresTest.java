package com.enerlution.ems.ingestion;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import java.sql.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

class IngestionSchemaPostgresTest {
  @Test
  @EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = ".+")
  void isolatedUpgradeEnforcesIngestionConstraintsAndRollsBack() throws Exception {
    assertEquals(
        "ems_ingestion_tests", System.getenv("EMS_TEST_SCHEMA"), "Dedicated schema is mandatory");
    try (Connection c =
        DriverManager.getConnection(
            System.getenv("EMS_TEST_DB_URL"),
            System.getenv("EMS_TEST_DB_USER"),
            System.getenv("EMS_TEST_DB_PASSWORD"))) {
      c.setAutoCommit(false);
      try (Statement s = c.createStatement()) {
        try (var r = s.executeQuery("select current_database(),current_user")) {
          assertTrue(r.next());
          assertEquals("ems_cloud_v2_proto", r.getString(1));
          assertEquals("ems_ingestion_test", r.getString(2));
        }
        s.execute("SET LOCAL search_path TO ems_ingestion_tests,public");
        s.execute("SELECT pg_advisory_xact_lock(78291028)");
        assertEmpty(s);
        for (int v = 1; v <= 11; v++) {
          if (v == 11)
            s.execute(
                "INSERT INTO app_role(code,name) VALUES('bootstrap_super_admin__o2','Superadmin')");
          final String prefix = "V" + v + "__";
          try (var paths = Files.list(Path.of("src/main/resources/db/migration"))) {
            var files = paths.filter(p -> p.getFileName().toString().startsWith(prefix)).toList();
            assertEquals(1, files.size(), "Migration " + prefix + " required");
            try {
              s.execute(
                  Files.readString(files.getFirst())
                      .replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
            } catch (SQLException e) {
              throw new SQLException(
                  "Migration " + files.getFirst().getFileName() + ": " + e.getMessage(),
                  e.getSQLState(),
                  e);
            }
          }
        }
        s.execute(
            "INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh)"
                + " VALUES(991,'s1','S1',1,1),(992,'s2','S2',1,1)");
        s.execute(
            "INSERT INTO device(id,station_id,code,name)"
                + " VALUES(991,991,'e','EMS'),(992,992,'x','Other'),(993,991,'p','PCS')");
        s.execute(
            "INSERT INTO ems_gateway(ems_uuid,device_id)"
                + " VALUES('11111111-1111-4111-8111-111111111111',991)");
        rejects(
            c,
            s,
            "INSERT INTO ems_gateway(ems_uuid,device_id)"
                + " VALUES('11111111-1111-4111-8111-111111111111',992)");
        rejects(
            c,
            s,
            "INSERT INTO ems_gateway(ems_uuid,device_id)"
                + " VALUES('22222222-2222-4222-8222-222222222222',999)");
        rejects(
            c,
            s,
            "INSERT INTO ems_gateway(ems_uuid,device_id)"
                + " VALUES('22222222-2222-2222-2222-222222222222',992)");
        s.execute(
            "INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',991,'2026-01-01')");
        rejects(
            c,
            s,
            "INSERT INTO ems_binding_period(ems_uuid,station_id,valid_from)"
                + " VALUES('11111111-1111-4111-8111-111111111111',992,'2026-01-01')");
        s.execute(
            "INSERT INTO"
                + " device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                + " VALUES(991,991,'cabinet',1,'pcs',1,993,'2026-01-01')");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                + " VALUES(991,'cabinet',0,'pcs',1,993,'2026-01-01')");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                + " VALUES(991,'cabinet',2,'pcs',1,992,'2026-01-01')");
        s.execute(
            "INSERT INTO structure_revision(ems_uuid,binding_period_id,sv,layout,content_hash)"
                + " VALUES('11111111-1111-4111-8111-111111111111',991,1,'{}',repeat('a',64))");
        rejects(
            c,
            s,
            "INSERT INTO structure_revision(ems_uuid,binding_period_id,sv,layout,content_hash)"
                + " VALUES('11111111-1111-4111-8111-111111111111',991,1,'{\"different\":true}',repeat('b',64))");
        s.execute("INSERT INTO measurement_kind(code,name,unit) VALUES('ems_test','Test','V')");
        s.execute(
            "INSERT INTO"
                + " point_definition(id,catalog_version,namespace,source_id,kind_code,value_type)"
                + " VALUES(991,'1','config',1,'ems_test','number')");
        rejects(
            c,
            s,
            "INSERT INTO point_definition(catalog_version,namespace,source_id,kind_code,value_type)"
                + " VALUES('1','config',1,'ems_test','number')");
        s.execute(
            "INSERT INTO config_revision(id,ems_uuid,binding_period_id,cfg_rev,content_hash)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',991,1,repeat('a',64))");
        s.execute(
            "INSERT INTO config_value(revision_id,definition_id,value_type,number_value)"
                + " VALUES(991,991,'number',12345678901234567890.123456789)");
        rejects(c, s, "UPDATE config_value SET text_value='wrong' WHERE revision_id=991");
        rejects(
            c,
            s,
            "UPDATE config_value SET value_type='text',number_value=null,text_value='wrong' WHERE"
                + " revision_id=991");
        rejects(c, s, "UPDATE device SET station_id=992 WHERE id=991");
        rejects(c, s, "UPDATE device SET station_id=992 WHERE id=993");
        rejects(c, s, "UPDATE ems_gateway SET device_id=992 WHERE device_id=991");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                + " VALUES(991,'cabinet',1,'pcs',1,993,'2026-02-01')");
        s.execute(
            "INSERT INTO measurement_point(id,device_id,kind_code,code)"
                + " VALUES(991,993,'ems_test','p'),(992,992,'ems_test','p')");
        s.execute(
            "INSERT INTO"
                + " point_definition(id,catalog_version,namespace,source_id,kind_code,value_type)"
                + " VALUES(992,'1','cabinet',2,'ems_test','number')");
        s.execute(
            "INSERT INTO"
                + " point_binding(device_binding_id,definition_id,measurement_point_id,valid_from)"
                + " VALUES(991,992,991,'2026-01-01')");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " point_binding(device_binding_id,definition_id,measurement_point_id,valid_from)"
                + " VALUES(991,992,991,'2026-01-01')");
        s.execute(
            "INSERT INTO"
                + " point_definition(id,catalog_version,namespace,source_id,kind_code,value_type)"
                + " VALUES(993,'2','cabinet',2,'ems_test','number')");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " point_binding(device_binding_id,definition_id,measurement_point_id,valid_from)"
                + " VALUES(991,993,991,'2026-01-01')");
        rejects(c, s, "UPDATE point_definition SET source_id=3 WHERE id=992");
        rejects(c, s, "UPDATE config_value SET number_value='NaN'");
        rejects(c, s, "UPDATE config_value SET number_value='Infinity'");
        rejects(c, s, "UPDATE structure_revision SET sv='NaN'");
        try (var r =
            s.executeQuery("SELECT number_value::text FROM config_value WHERE revision_id=991")) {
          assertTrue(r.next());
          assertEquals("12345678901234567890.123456789", r.getString(1));
        }
        rejects(c, s, "UPDATE measurement_point SET device_id=992 WHERE id=991");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " point_binding(device_binding_id,definition_id,measurement_point_id,valid_from)"
                + " VALUES(991,992,992,'2026-01-01')");
        rejects(c, s, "UPDATE ems_binding_period SET valid_to='2026-02-01' WHERE id=991");
        s.execute("UPDATE point_binding SET valid_to='2026-02-01'");
        s.execute("UPDATE device_binding SET valid_to='2026-02-01' WHERE id=991");
        s.execute("UPDATE ems_binding_period SET valid_to='2026-02-01' WHERE id=991");
        s.execute("UPDATE device SET station_id=992 WHERE id IN (991,993)");
        try (var r = s.executeQuery("SELECT station_id FROM ems_binding_period WHERE id=991")) {
          assertTrue(r.next());
          assertEquals(991, r.getLong(1));
        }
        try (var r =
            s.executeQuery(
                "SELECT count(*) FROM role_permission rp JOIN app_role r ON r.id=rp.role_id WHERE"
                    + " r.code='bootstrap_super_admin__o2' AND rp.permission_code IN"
                    + " ('ems.read','ems.manage','ems.query')")) {
          assertTrue(r.next());
          assertEquals(3, r.getInt(1));
        }
        s.execute(
            "INSERT INTO"
                + " reliable_message(ems_uuid,binding_period_id,type,alarm_id,seq,source_at,received_at,raw_payload,content_hash,status)"
                + " VALUES('11111111-1111-4111-8111-111111111111',991,'alarm_event','33333333-3333-4333-8333-333333333333',184467440737095516160,'2026-01-01','2026-01-01','abc',repeat('a',64),'saved')");
        rejects(
            c,
            s,
            "INSERT INTO"
                + " reliable_message(ems_uuid,binding_period_id,type,alarm_id,seq,source_at,received_at,raw_payload,content_hash,status)"
                + " SELECT"
                + " ems_uuid,binding_period_id,type,alarm_id,seq,source_at,received_at,raw_payload,repeat('b',64),status"
                + " FROM reliable_message");
        rejects(c, s, "UPDATE reliable_message SET task_id='33333333-3333-4333-8333-333333333333'");
        c.rollback();
        assertEmpty(s);
      } finally {
        c.rollback();
      }
    }
  }

  private static void assertEmpty(Statement s) throws SQLException {
    try (var r =
        s.executeQuery(
            "SELECT count(*) FROM information_schema.tables WHERE"
                + " table_schema='ems_ingestion_tests'")) {
      assertTrue(r.next());
      assertEquals(0, r.getInt(1));
    }
  }

  private static void rejects(Connection c, Statement s, String sql) throws SQLException {
    var savepoint = c.setSavepoint();
    SQLException failure = assertThrows(SQLException.class, () -> s.execute(sql), sql);
    assertTrue(failure.getSQLState().startsWith("23"), failure.getSQLState());
    c.rollback(savepoint);
    c.releaseSavepoint(savepoint);
  }
}
