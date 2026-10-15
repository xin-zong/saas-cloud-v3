package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ProvisionModelControllerTest {
  @Test void catalogRequiresStationCreationOrEditingPermissionBeforeReadingModels() {
    var db = mock(JdbcTemplate.class);
    var access = mock(AccessControl.class);
    var controller = new ProvisionModelController(new DomainSupport(db, access));
    assertThrows(BusinessException.class, controller::models);
    verifyNoInteractions(db);
    when(access.hasPermission("asset.create")).thenReturn(true);
    when(db.queryForList(anyString())).thenReturn(List.of(Map.of("id", 1L, "category", "PCS", "manufacturer", "registered", "name", "real-model")));
    assertEquals(200, controller.models().code());
    verify(db).queryForList(contains("FROM device_model"));
  }
  @Test void existingStationEditorsMayReadSharedCatalogWithoutCreatePermission() {
    var db = mock(JdbcTemplate.class);
    var access = mock(AccessControl.class);
    when(access.hasPermission("asset.edit")).thenReturn(true);
    when(db.queryForList(anyString())).thenReturn(List.of());
    var result = new ProvisionModelController(new DomainSupport(db, access)).models();
    assertEquals(List.of(), result.data());
  }
}
