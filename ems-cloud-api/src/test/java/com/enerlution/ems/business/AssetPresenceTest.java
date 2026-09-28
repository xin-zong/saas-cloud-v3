package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import java.sql.Timestamp;
class AssetPresenceTest {
  @Test void mappedDeviceNeedsItsOwnCurrentPeriodSampleAndPermission() {
    var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);var telemetry=mock(EmsTelemetryQueries.class);
    var controller=new AssetPresence(new DomainSupport(db,access),telemetry);
    Instant at=Instant.now().minusSeconds(5);
    Map<String,Object> gateway=Map.of("id",2L,"device_id",57L,"reachable",true,"last_fresh_heartbeat",Timestamp.from(at));
    Map<String,Object> mapping=Map.of("device_id",5L,"binding_period_id",2L,"measurement_point_id",19L,"valid_from",Timestamp.from(at.minusSeconds(60)),"reachable",true);
    when(db.queryForList(contains("FROM ems_binding_period p"),eq(4L))).thenReturn(List.of(gateway));
    when(db.queryForList(contains("FROM device_binding d"),eq(4L))).thenReturn(List.of(mapping));
    var sample=new HashMap<String,Object>(Map.of("pointId","19","bindingPeriodId","2","receivedAt",at.toEpochMilli(),"sourceTime",at.toEpochMilli(),"quality","valid"));
    when(telemetry.latest(List.of(2L),List.of(19L))).thenReturn(List.of(sample));
    var data=(Map<?,?>)controller.presence(4).data();
    assertEquals("online",data.get("status"));
    var devices=(Collection<Map<String,Object>>)data.get("devices");
    assertEquals(2,devices.size());assertTrue(devices.stream().allMatch(d->"online".equals(d.get("status"))));
    sample.put("bindingPeriodId","1");
    devices=(Collection<Map<String,Object>>)((Map<?,?>)controller.presence(4).data()).get("devices");
    assertNull(devices.stream().filter(d->d.get("id").equals("5")).findFirst().orElseThrow().get("status"));
    doThrow(new BusinessException(403,"Forbidden")).when(access).requireStationPermission(9L,"asset.read");
    assertThrows(BusinessException.class,()->controller.presence(9));
    verify(db,never()).queryForList(anyString(),eq(9L));
  }
  final Instant now=Instant.parse("2026-09-29T00:00:00Z");
  @Test void requiresLiveHeartbeatAndFreshDeviceEvidence() {
    assertEquals("online",AssetPresence.classify(true,now.minusSeconds(10),now.minusSeconds(10),now));
    assertEquals("offline",AssetPresence.classify(false,now.minusSeconds(10),now.minusSeconds(10),now));
    assertEquals("offline",AssetPresence.classify(true,now.minusSeconds(91),now.minusSeconds(91),now));
    assertNull(AssetPresence.classify(true,null,null,now));
    assertNull(AssetPresence.classify(true,now.plusSeconds(2),now,now));
    assertEquals("offline",AssetPresence.classify(true,now,now.minusSeconds(120),now));
  }
}
