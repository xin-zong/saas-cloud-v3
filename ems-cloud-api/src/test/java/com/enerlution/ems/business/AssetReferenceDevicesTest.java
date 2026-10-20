package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AssetReferenceDevicesTest {
  @Test void importedInventoryUsesProfileFallbackAndRetainsTheExistingObservationFreshnessGate() {
    var db=mock(JdbcTemplate.class);
    var access=mock(AccessControl.class);
    var imported=Map.<String,Object>of("id",19L,"name","Synthetic meter","serial_number","SYNTHETIC-001","category","MTR","source_type","Meter");
    when(db.queryForList(anyString(),eq(7L))).thenReturn(List.of(imported));
    assertEquals(List.of(imported),new AssetController(new DomainSupport(db,access)).devices(7).data());
    var query=org.mockito.ArgumentCaptor.forClass(String.class);
    var order=inOrder(access,db);
    order.verify(access).requireStationPermission(7,"asset.read");
    order.verify(db).queryForList(query.capture(),eq(7L));
    String sql=query.getValue();
    assertAll("profile fallback and observation freshness remain enforced",
        ()->assertTrue(sql.contains("LEFT JOIN device_reference_profile rp ON rp.device_id=d.id")),
        ()->assertTrue(sql.contains("COALESCE(m.category,rp.category,'OTHER') AS category")),
        ()->assertTrue(sql.contains("COALESCE(m.name,rp.model) AS model_name")),
        ()->assertTrue(sql.contains("COALESCE(m.manufacturer,rp.manufacturer) AS manufacturer")),
        ()->assertTrue(sql.contains("CASE WHEN o.observed_at>now() THEN NULL")),
        ()->assertTrue(sql.contains("WHEN o.observed_at<now()-interval '15 minutes' THEN 'offline'")),
        ()->assertTrue(sql.contains("BETWEEN now()-interval '24 hours' AND now() THEN o.health_score ELSE NULL END")));
    assertAll("parent metadata never links another station or the device itself",
        ()->assertTrue(sql.contains("parent.serial_number=ri.provenance->'device'->'raw'->>'parentSerialNumber'")),
        ()->assertTrue(sql.contains("ri.device_id=d.id")),
        ()->assertTrue(sql.contains("parent.station_id=d.station_id")),
        ()->assertTrue(sql.contains("parent.id<>d.id")),
        ()->assertTrue(sql.contains("AS parent_device_id")),
        ()->assertTrue(sql.contains("d.station_id=? AND d.archived_at IS NULL")));

  }
  @Test void stationPermissionIsRequiredBeforeReadingImportedInventory() {
    var db=mock(JdbcTemplate.class);
    var access=mock(AccessControl.class);
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(8,"asset.read");
    assertThrows(BusinessException.class,()->new AssetController(new DomainSupport(db,access)).devices(8));
    verifyNoInteractions(db);
  }
}
