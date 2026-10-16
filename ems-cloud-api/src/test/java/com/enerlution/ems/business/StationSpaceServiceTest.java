package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonMappingException;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class StationSpaceServiceTest {
  final JdbcTemplate db=mock(JdbcTemplate.class);
  final AccessControl access=mock(AccessControl.class);
  final StationSpaceService spaces=new StationSpaceService(new DomainSupport(db,access));
  static void status(int status,org.junit.jupiter.api.function.Executable action) {
    assertEquals(status,assertThrows(BusinessException.class,action).status());
  }
  @Test void namesAreTrimmedAndBoundedByTheLocalEightyCharacterContract() {
    assertEquals("一期",StationSpaceService.normalizeName("  一期  "));
    assertEquals("😀".repeat(80),StationSpaceService.normalizeName("😀".repeat(80)));
    for(String name:Arrays.asList(null,"","  ","x".repeat(81)))status(400,()->StationSpaceService.normalizeName(name));
  }
  @Test void typesMatchTheSixConfirmedEnumsWithoutInventingParentTypeRules() {
    for(int type:List.of(10,20,30,40,50,60))assertEquals(type,StationSpaceService.validateType(type));
    for(Integer type:Arrays.asList(null,0,1,15,70))status(400,()->StationSpaceService.validateType(type));
  }
  @Test void batchIdsArePositiveExactLongStringsBoundedAndDeduplicated() {
    assertEquals(List.of(9007199254740993L,19L),StationSpaceService.normalizeDeviceIds(List.of("9007199254740993","19","19")));
    for(String id:Arrays.asList(null,"","0","-1","1.1","1 OR 1=1","9223372036854775808"))
      status(400,()->StationSpaceService.normalizeDeviceIds(Arrays.asList(id)));
    status(400,()->StationSpaceService.normalizeDeviceIds(null));
    status(400,()->StationSpaceService.normalizeDeviceIds(List.of()));
    status(400,()->StationSpaceService.normalizeDeviceIds(Collections.nCopies(201,"1")));
  }
  @Test void readsRequireCurrentStationReadScopeBeforeDatabaseAccess() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.read");
    status(403,()->spaces.list(101));status(403,()->spaces.devices(101,null,null,false,20,0));
    verifyNoInteractions(db);
  }
  @Test void everyWriteRequiresReadAndEditStationScopeBeforeDatabaseAccess() {
    doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(101,"asset.edit");
    UUID id=UUID.randomUUID();
    status(403,()->spaces.create(101,new StationSpaceService.CreateRequest(null,"A",10)));
    status(403,()->spaces.rename(101,id,new StationSpaceService.RenameRequest("B",1L)));
    status(403,()->spaces.move(101,id,new StationSpaceService.MoveRequest(null,1L)));
    status(403,()->spaces.delete(101,id,1L));
    status(403,()->spaces.bind(101,id,new StationSpaceService.BindRequest(List.of("1"),1L)));
    status(403,()->spaces.unbind(101,id,"1",1L));
    verify(access,times(6)).requireStationPermission(101,"asset.read");verifyNoInteractions(db);
  }
  @Test void allExistingResourceMutationsRequirePositiveOptimisticVersion() {
    UUID id=UUID.randomUUID();
    for(Long version:Arrays.asList(null,0L,-1L)) {
      status(400,()->spaces.rename(101,id,new StationSpaceService.RenameRequest("B",version)));
      status(400,()->spaces.move(101,id,new StationSpaceService.MoveRequest(null,version)));
      status(400,()->spaces.delete(101,id,version));
      status(400,()->spaces.bind(101,id,new StationSpaceService.BindRequest(List.of("1"),version)));
      status(400,()->spaces.unbind(101,id,"1",version));
    }
    verifyNoInteractions(db);
  }
  @Test void devicePaginationAndContradictoryFiltersFailBeforeAnyQuery() {
    status(400,()->spaces.devices(101,null,null,false,0,0));
    status(400,()->spaces.devices(101,null,null,false,201,0));
    status(400,()->spaces.devices(101,null,null,false,20,-1));
    status(400,()->spaces.devices(101,null,UUID.randomUUID(),true,20,0));
    verifyNoInteractions(db);
  }
  @Test void wireContractRejectsNumericIdsAndFractionalTypeOrVersionCoercion() {
    var json=new ObjectMapper();
    assertThrows(JsonMappingException.class,()->json.readValue("{\"deviceIds\":[9007199254740993],\"expectedVersion\":1}",StationSpaceService.BindRequest.class));
    assertThrows(JsonMappingException.class,()->json.readValue("{\"name\":\"A\",\"type\":10.5}",StationSpaceService.CreateRequest.class));
    assertThrows(JsonMappingException.class,()->json.readValue("{\"name\":\"A\",\"expectedVersion\":1.5}",StationSpaceService.RenameRequest.class));
  }
}
