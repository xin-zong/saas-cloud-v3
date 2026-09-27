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
            "INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',1,'{}',repeat('a',64))");
        rejects(
            c,
            s,
            "INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash)"
                + " VALUES(992,'11111111-1111-4111-8111-111111111111',1,'{\"different\":true}',repeat('b',64))");
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
            "INSERT INTO config_revision(id,ems_uuid,cfg_rev,content_hash)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',1,repeat('a',64))");
        s.execute(
            "INSERT INTO config_value(revision_id,definition_id,value_type,number_value)"
                + " VALUES(991,991,'number',12345678901234567890.123456789)");
        s.execute(
            "INSERT INTO config_revision(id,ems_uuid,cfg_rev,content_hash)"
                + " VALUES(992,'11111111-1111-4111-8111-111111111111',2,repeat('a',64))");
        rejects(
            c,
            s,
            "INSERT INTO config_value(revision_id,definition_id,value_type,number_value,text_value)"
                + " VALUES(992,991,'number',1,'wrong')");
        rejects(
            c,
            s,
            "INSERT INTO config_value(revision_id,definition_id,value_type,text_value)"
                + " VALUES(992,991,'text','wrong')");
        rejects(
            c,
            s,
            "INSERT INTO config_value(revision_id,definition_id,value_type,number_value)"
                + " VALUES(992,991,'number','NaN')");
        rejects(
            c,
            s,
            "INSERT INTO config_value(revision_id,definition_id,value_type,number_value)"
                + " VALUES(992,991,'number','Infinity')");
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

  @Test
  @EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = ".+")
  void bmuLayoutUsesPeriodScopedPhysicalBindingsWithoutWorkerAssetWrites() throws Exception {
    withReviewFixture(
        (c, s) -> {
          try (var r =
              s.executeQuery(
                  "SELECT count(*) FROM information_schema.columns WHERE"
                      + " table_schema='ems_ingestion_tests' AND table_name='bmu_layout' AND"
                      + " column_name='device_id'")) {
            assertTrue(r.next());
            assertEquals(
                0,
                r.getInt(1),
                "Physical asset belongs in period-scoped binding, not immutable layout");
          }
          s.execute(
              "INSERT INTO bmu_layout(ems_uuid,sv,cabinet_no,slot,voltage_count,temperature_count)"
                  + " VALUES('11111111-1111-4111-8111-111111111111',1,1,1,10,5)");
          s.execute(
              "INSERT INTO"
                  + " device_binding(id,binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                  + " VALUES(991,991,'cabinet',1,'bmu',1,993,'2026-01-01')");
          s.execute(
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(991,991,'2026-01-02')");
          rejects(c, s, "UPDATE bmu_layout SET voltage_count=11");
          assertBmuBinding(s, 991, 991);
          rejects(
              c,
              s,
              "INSERT INTO"
                  + " device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                  + " VALUES(991,'cabinet',2,'bmu',1,992,'2026-01-01')");
          s.execute("UPDATE device_binding SET valid_to='2026-02-01' WHERE id=991");
          s.execute("UPDATE ems_binding_period SET valid_to='2026-02-01' WHERE id=991");
          s.execute("UPDATE device SET station_id=992 WHERE id IN(991,993)");
          s.execute(
              "INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from)"
                  + " VALUES(992,'11111111-1111-4111-8111-111111111111',992,'2026-02-01')");
          s.execute(
              "INSERT INTO"
                  + " device_binding(binding_period_id,scope,cabinet_no,role,local_no,device_id,valid_from)"
                  + " VALUES(992,'cabinet',1,'bmu',1,993,'2026-02-01')");
          s.execute(
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(992,991,'2026-02-02')");
          assertBmuBinding(s, 991, 991);
          assertBmuBinding(s, 992, 992);
        });
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = ".+")
  void unchangedVersionsCanBeAcceptedInNewStationWithoutReattributingHistory() throws Exception {
    withReviewFixture(
        (c, s) -> {
          s.execute(
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(991,991,'2026-01-02')");
          s.execute(
              "INSERT INTO config_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(991,991,'2026-01-02')");
          rejects(c, s, "UPDATE ems_binding_period SET valid_to='2026-01-02' WHERE id=991");
          rejects(
              c,
              s,
              "UPDATE structure_acceptance SET received_at='2026-01-03' WHERE"
                  + " binding_period_id=991");
          rejects(
              c,
              s,
              "UPDATE config_acceptance SET received_at='2026-01-03' WHERE binding_period_id=991");
          rejects(c, s, "UPDATE structure_revision SET content_hash=repeat('b',64)");
          rejects(c, s, "UPDATE config_revision SET content_hash=repeat('b',64)");
          s.execute("UPDATE ems_binding_period SET valid_to='2026-02-01' WHERE id=991");
          s.execute("UPDATE device SET station_id=992 WHERE id=991");
          s.execute(
              "INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from)"
                  + " VALUES(992,'11111111-1111-4111-8111-111111111111',992,'2026-02-01')");
          s.execute(
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(992,991,'2026-02-02')");
          s.execute(
              "INSERT INTO config_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(992,991,'2026-02-02')");
          s.execute(
              "INSERT INTO"
                  + " structure_current(ems_uuid,binding_period_id,connection_id,seq,revision_id,metadata,received_at)"
                  + " VALUES('11111111-1111-4111-8111-111111111111',992,'44444444-4444-4444-8444-444444444444',1,991,'{}','2026-02-02')");
          s.execute(
              "INSERT INTO config_current(ems_uuid,binding_period_id,revision_id)"
                  + " VALUES('11111111-1111-4111-8111-111111111111',992,991)");
          try (var r =
              s.executeQuery(
                  "SELECT p.station_id,count(*) FROM structure_acceptance a JOIN ems_binding_period"
                      + " p ON p.id=a.binding_period_id JOIN structure_revision r"
                      + " ON r.id=a.revision_id GROUP BY p.station_id ORDER BY p.station_id")) {
            assertTrue(r.next());
            assertEquals(991, r.getLong(1));
            assertEquals(1, r.getInt(2));
            assertTrue(r.next());
            assertEquals(992, r.getLong(1));
            assertEquals(1, r.getInt(2));
            assertFalse(r.next());
          }
          try (var r =
              s.executeQuery(
                  "SELECT p.station_id FROM config_current c JOIN ems_binding_period p ON"
                      + " p.id=c.binding_period_id JOIN config_acceptance a ON"
                      + " a.binding_period_id=c.binding_period_id AND"
                      + " a.revision_id=c.revision_id")) {
            assertTrue(r.next());
            assertEquals(992, r.getLong(1));
          }
          try (var r =
              s.executeQuery(
                  "SELECT p.station_id FROM config_acceptance a JOIN ems_binding_period p ON"
                      + " p.id=a.binding_period_id ORDER BY p.station_id")) {
            assertTrue(r.next());
            assertEquals(991, r.getLong(1));
            assertTrue(r.next());
            assertEquals(992, r.getLong(1));
            assertFalse(r.next());
          }
          s.execute(
              "INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash)"
                  + " VALUES(992,'11111111-1111-4111-8111-111111111111',2,'{}',repeat('a',64))");
          rejects(
              c,
              s,
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(991,992,'2026-02-01')");
          rejects(
              c,
              s,
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(992,992,'2026-01-31')");
          s.execute(
              "INSERT INTO config_revision(id,ems_uuid,cfg_rev,content_hash)"
                  + " VALUES(992,'11111111-1111-4111-8111-111111111111',2,repeat('a',64))");
          rejects(
              c,
              s,
              "INSERT INTO config_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(991,992,'2026-02-01')");
          rejects(
              c,
              s,
              "INSERT INTO config_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(992,992,'2026-01-31')");
          s.execute("DELETE FROM structure_revision WHERE id=992");
          s.execute("DELETE FROM config_revision WHERE id=992");
          s.execute(
              "INSERT INTO ems_gateway(ems_uuid,device_id)"
                  + " VALUES('22222222-2222-4222-8222-222222222222',992)");
          s.execute(
              "INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from)"
                  + " VALUES(993,'22222222-2222-4222-8222-222222222222',992,'2026-02-01')");
          rejects(
              c,
              s,
              "INSERT INTO structure_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(993,991,'2026-02-02')");
          rejects(
              c,
              s,
              "INSERT INTO config_acceptance(binding_period_id,revision_id,received_at)"
                  + " VALUES(993,991,'2026-02-02')");
          rejects(c, s, "UPDATE structure_current SET binding_period_id=991,revision_id=999");
          rejects(c, s, "UPDATE config_current SET revision_id=999");
          try (var r =
              s.executeQuery(
                  "SELECT (SELECT count(*) FROM structure_revision),(SELECT count(*) FROM"
                      + " config_revision)")) {
            assertTrue(r.next());
            assertEquals(1, r.getInt(1));
            assertEquals(1, r.getInt(2));
          }
        });
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = ".+")
  void queryTerminalFailuresRetainResponseAndTimeoutMeansUnknown() throws Exception {
    withReviewFixture(
        (c, s) -> {
          s.execute(
              "INSERT INTO app_user(id,account,display_name,password_hash)"
                  + " VALUES(991,'ems-test','Test','test-only')");
          s.execute(
              "INSERT INTO"
                  + " query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status,result)"
                  + " VALUES('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',991,991,'44444444-4444-4444-8444-444444444444','structure.get','{}','2026-01-02','2026-01-02"
                  + " 00:00:30','failed','{\"ok\":false,\"error\":{\"code\":\"BUSY\"}}')");
          try (var r = s.executeQuery("SELECT result->'error'->>'code' FROM query_request")) {
            assertTrue(r.next());
            assertEquals("BUSY", r.getString(1));
          }
          s.execute("UPDATE query_request SET status='pending',result=null");
          s.execute("UPDATE query_request SET status='sent'");
          s.execute("UPDATE query_request SET status='unknown'");
          s.execute("UPDATE query_request SET status='expired'");
          rejects(c, s, "UPDATE query_request SET status='succeeded',result=null");
          s.execute(
              "UPDATE query_request SET status='succeeded',result='{\"ok\":true,\"data\":{}}'");
          rejects(c, s, "UPDATE query_request SET status='timed_out'");
        });
  }

  @Test
  @EnabledIfEnvironmentVariable(named = "EMS_TEST_SCHEMA", matches = ".+")
  void automaticReadQueriesNeedNoFabricatedUserAndUnknownUserIsRejected() throws Exception {
    withReviewFixture(
        (c, s) -> {
          s.execute(
              "INSERT INTO"
                  + " query_request(id,ems_uuid,actor_id,binding_period_id,connection_id,operation,params,created_at,expires_at,status)"
                  + " VALUES('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',null,991,'44444444-4444-4444-8444-444444444444','structure.get','{}','2026-01-02','2026-01-02"
                  + " 00:00:30','pending')");
          try (var r = s.executeQuery("SELECT actor_id,status FROM query_request")) {
            assertTrue(r.next());
            assertNull(r.getObject(1));
            assertEquals("pending", r.getString(2));
          }
          rejects(c, s, "UPDATE query_request SET actor_id=999999");
        });
  }

  private static void assertBmuBinding(Statement s, long period, long station) throws SQLException {
    try (var r =
        s.executeQuery(
            "SELECT b.device_id,p.station_id,l.voltage_count FROM bmu_layout l JOIN"
                + " structure_revision r ON r.ems_uuid=l.ems_uuid AND r.sv=l.sv JOIN"
                + " structure_acceptance a ON a.revision_id=r.id JOIN ems_binding_period p ON"
                + " p.id=a.binding_period_id JOIN device_binding b ON b.binding_period_id=p.id AND"
                + " b.role='bmu' AND b.cabinet_no=l.cabinet_no AND b.local_no=l.slot WHERE p.id="
                + period)) {
      assertTrue(r.next());
      assertEquals(993, r.getLong(1));
      assertEquals(station, r.getLong(2));
      assertEquals(10, r.getInt(3));
      assertFalse(r.next());
    }
  }

  @FunctionalInterface
  private interface SqlScenario {
    void run(Connection c, Statement s) throws Exception;
  }

  private static void withReviewFixture(SqlScenario scenario) throws Exception {
    assertEquals("ems_ingestion_tests", System.getenv("EMS_TEST_SCHEMA"));
    try (var c =
        DriverManager.getConnection(
            System.getenv("EMS_TEST_DB_URL"),
            System.getenv("EMS_TEST_DB_USER"),
            System.getenv("EMS_TEST_DB_PASSWORD"))) {
      c.setAutoCommit(false);
      try (var s = c.createStatement()) {
        try (var r = s.executeQuery("SELECT current_database(),current_user")) {
          assertTrue(r.next());
          assertEquals("ems_cloud_v2_proto", r.getString(1));
          assertEquals("ems_ingestion_test", r.getString(2));
        }
        s.execute("SET LOCAL search_path TO ems_ingestion_tests,public");
        s.execute("SELECT pg_advisory_xact_lock(78291028)");
        assertEmpty(s);
        for (int v = 1; v <= 11; v++) {
          final String prefix = "V" + v + "__";
          try (var paths = Files.list(Path.of("src/main/resources/db/migration"))) {
            var files = paths.filter(p -> p.getFileName().toString().startsWith(prefix)).toList();
            assertEquals(1, files.size());
            s.execute(
                Files.readString(files.getFirst())
                    .replace("CREATE EXTENSION IF NOT EXISTS btree_gist;", ""));
          }
        }
        s.execute(
            "INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh)"
                + " VALUES(991,'s1','S1',1,1),(992,'s2','S2',1,1)");
        s.execute(
            "INSERT INTO device(id,station_id,code,name)"
                + " VALUES(991,991,'e','EMS'),(992,992,'x','Other'),(993,991,'b','BMU')");
        s.execute(
            "INSERT INTO ems_gateway(ems_uuid,device_id)"
                + " VALUES('11111111-1111-4111-8111-111111111111',991)");
        s.execute(
            "INSERT INTO ems_binding_period(id,ems_uuid,station_id,valid_from)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',991,'2026-01-01')");
        s.execute(
            "INSERT INTO structure_revision(id,ems_uuid,sv,layout,content_hash)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',1,'{}',repeat('a',64))");
        s.execute(
            "INSERT INTO config_revision(id,ems_uuid,cfg_rev,content_hash)"
                + " VALUES(991,'11111111-1111-4111-8111-111111111111',1,repeat('a',64))");
        scenario.run(c, s);
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
