package com.enerlution.ems.business;
import com.enerlution.ems.auth.AccessControl;
import java.util.*;
import static org.mockito.Mockito.*;
final class ScopeTestSupport {
 private ScopeTestSupport(){}
 static void useStationIdStubs(AccessControl access){
  when(access.stationScopes(anyCollection())).thenAnswer(call->{
   Collection<String> codes=call.getArgument(0);var result=new LinkedHashMap<String,List<Long>>();
   for(String code:codes)result.put(code,access.stationIds(code));return result;
  });
 }
}
