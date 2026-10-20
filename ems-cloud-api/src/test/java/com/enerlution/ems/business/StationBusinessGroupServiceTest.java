package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.enerlution.ems.tenant.TenantContext;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class StationBusinessGroupServiceTest {
 private Map<String,Object> group(String id,String parent,String name,String kind){var row=new HashMap<String,Object>();row.put("id",id);row.put("parent_id",parent);row.put("name",name);row.put("kind",kind);return row;}
 @Test void tenantScopedVisibleAssignmentsAggregateOnlyAuthorizedStations(){
  var groups=List.of(group("a",null,"Area","group"),group("b","a","Project","project"),group("empty",null,"Hidden","group"));
  var links=List.<Map<String,Object>>of(Map.of("group_id","b","station_id",16L),Map.of("group_id","empty","station_id",999L));
  var stations=List.<Map<String,Object>>of(Map.of("id",16L,"name","Visible"),Map.of("id",17L,"name","Unassigned"));
  var root=StationBusinessGroupService.buildTree(2,"Company",groups,links,stations,false);
  assertEquals(List.of("16","17"),root.stationIds());assertEquals(2,root.children().size());
  var area=root.children().getFirst();assertEquals("group:a",area.id());assertEquals(List.of("16"),area.stationIds());assertEquals("project",area.children().getFirst().type());
  assertEquals("unassigned",root.children().getLast().type());assertEquals(List.of("17"),root.children().getLast().stationIds());
  assertFalse(root.toString().contains("999"));assertFalse(root.toString().contains("Hidden"));
 }
 @Test void administratorMaySeeVerifiedEmptyGroupsWithoutInventingStationAssignments(){
  var root=StationBusinessGroupService.buildTree(2,"Company",List.of(group("a",null,"Verified group","group")),List.of(),List.of(),true);
  assertEquals(1,root.children().size());assertTrue(root.stationIds().isEmpty());assertTrue(root.children().getFirst().stationIds().isEmpty());
 }
 @Test void missingGroupDatasetFallsBackToRealUnassignedStations(){
  var root=StationBusinessGroupService.buildTree(2,"Actual company",List.of(),List.of(),List.of(Map.of("id",21L,"name","Actual station")),false);
  assertEquals("Actual company",root.name());assertEquals("tenant:2",root.id());assertEquals("未分组电站",root.children().getFirst().name());assertEquals("Actual station",root.children().getFirst().children().getFirst().name());
 }
 @Test void corruptCycleIsRejectedRatherThanHangingOrExposingNodes(){
  assertThrows(BusinessException.class,()->StationBusinessGroupService.buildTree(2,"Company",List.of(group("a","b","A","group"),group("b","a","B","group")),List.of(),List.of(),true));
 }
 @Test void deniedAssetPermissionDoesNotQueryBusinessTables(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);doThrow(new BusinessException(403,"denied")).when(access).requirePermission("asset.read");
  assertThrows(BusinessException.class,()->new StationBusinessGroupService(new DomainSupport(db,access)).tree());verifyNoInteractions(db);
 }
 @Test void platformContextCannotUseTreeAsCrossTenantDirectory(){
  var db=mock(JdbcTemplate.class);var access=mock(AccessControl.class);when(access.context()).thenReturn(new TenantContext(1,1,"platform",true));
  assertThrows(BusinessException.class,()->new StationBusinessGroupService(new DomainSupport(db,access)).tree());verifyNoInteractions(db);
 }
}
