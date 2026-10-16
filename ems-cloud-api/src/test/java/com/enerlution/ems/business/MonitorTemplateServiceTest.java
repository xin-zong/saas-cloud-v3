package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
class MonitorTemplateServiceTest {
  static void bad(org.junit.jupiter.api.function.Executable call) {
    assertEquals(400, assertThrows(BusinessException.class, call).status());
  }
  @Test void namesAreTrimmedAndBoundedByFiftyUnicodeCharacters() {
    assertEquals("My board", MonitorTemplateService.normalizeName("  My board  "));
    assertEquals("能".repeat(50), MonitorTemplateService.normalizeName("能".repeat(50)));
    for(String name: Arrays.asList(null,"","  ","a".repeat(51))) bad(()->MonitorTemplateService.normalizeName(name));
  }
  @Test void cardsMustBeNonemptyUniqueStableOverviewNames() {
    var cards=List.of("站点运营概况","运行健康");
    assertEquals(cards,MonitorTemplateService.normalizeCards(cards));
    bad(()->MonitorTemplateService.normalizeCards(null));
    bad(()->MonitorTemplateService.normalizeCards(List.of()));
    bad(()->MonitorTemplateService.normalizeCards(List.of("unknown")));
    bad(()->MonitorTemplateService.normalizeCards(List.of("运行健康","运行健康")));
    bad(()->MonitorTemplateService.normalizeCards(Arrays.asList("运行健康",null)));
  }
  @Test void optimisticMutationsRequirePositiveVersion() {
    assertEquals(1,MonitorTemplateService.expectedVersion(1L));
    bad(()->MonitorTemplateService.expectedVersion(null));
    bad(()->MonitorTemplateService.expectedVersion(0L));
    bad(()->MonitorTemplateService.expectedVersion(-1L));
  }
  @Test void itemsAndSelectionUseOneReadSnapshotWithoutPreferenceWrites() throws Exception {
    var db=mock(JdbcTemplate.class); var access=mock(AccessControl.class);
    when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    UUID id=UUID.randomUUID(); var rs=mock(java.sql.ResultSet.class); var cards=mock(java.sql.Array.class);
    when(rs.getObject("id",UUID.class)).thenReturn(id);
    when(rs.getObject("selected_id",UUID.class)).thenReturn(id);
    when(rs.getString("name")).thenReturn("A"); when(rs.getArray("cards")).thenReturn(cards);
    when(cards.getArray()).thenReturn(new String[]{"运行健康"});
    when(rs.getLong("sort_order")).thenReturn(1L); when(rs.getLong("version")).thenReturn(1L);
    when(db.query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<MonitorTemplateService.Template>>any(),any(Object[].class)))
        .thenAnswer(call->{
          RowMapper<MonitorTemplateService.Template> mapper=call.getArgument(1);
          return List.of(mapper.mapRow(rs,0));
        });
    var result=new MonitorTemplateService(new DomainSupport(db,access)).list();
    assertEquals(id,result.selectedId()); assertEquals(id,result.items().getFirst().id());
    // Two SQL reads can combine items from before deletion with selection from after deletion.
    // Verifying a single read detects that specific consistency regression, and any GET writes.
    verify(db).query(anyString(),org.mockito.ArgumentMatchers.<RowMapper<MonitorTemplateService.Template>>any(),eq(11L),eq(7L));
    verifyNoMoreInteractions(db);
  }
}
