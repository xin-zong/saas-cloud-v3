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
    when(db.queryForList(argThat((String sql) -> sql.contains("LEFT JOIN device_reference_profile rp ON rp.device_id=d.id")
        && sql.contains("COALESCE(m.category,rp.category,'OTHER') AS category")
        && sql.contains("COALESCE(m.name,rp.model) AS model_name")
        && sql.contains("o.observed_at<now()-interval '15 minutes'")
        && !sql.contains("provenance")),eq(7L))).thenReturn(List.of(imported));
    assertEquals(List.of(imported),new AssetController(new DomainSupport(db,access)).devices(7).data());
    verify(access).requireStationPermission(7,"asset.read");
  }
  @Test void stationPermissionIsRequiredBeforeReadingImportedInventory() {
    var db=mock(JdbcTemplate.class);
    var access=mock(AccessControl.class);
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(8,"asset.read");
    assertThrows(BusinessException.class,()->new AssetController(new DomainSupport(db,access)).devices(8));
    verifyNoInteractions(db);
  }
}
