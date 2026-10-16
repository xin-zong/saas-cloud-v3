package com.enerlution.ems.business;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.tenant.TenantContext;
import java.math.BigDecimal;
import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class TariffTemplateReadTest {
  /** Model a pool with one available lease; a second nested read cannot acquire another lease. */
  static class SingleLeaseJdbc extends JdbcTemplate {
    boolean headerLeaseHeld;final UUID id=UUID.randomUUID();
    final ResultSet header=mock(ResultSet.class),period=mock(ResultSet.class);
    SingleLeaseJdbc()throws Exception{
      when(header.getObject("id",UUID.class)).thenReturn(id);when(header.getString("name")).thenReturn("A");when(header.getLong("version")).thenReturn(1L);
      when(header.getLong("tariff_id")).thenReturn(1L);when(header.getString("pricing_mode")).thenReturn("fixed");when(header.getString("currency")).thenReturn("CNY");
      when(period.getInt("start_minute")).thenReturn(0);when(period.getInt("end_minute")).thenReturn(1440);when(period.getString("band")).thenReturn("flat");when(period.getBigDecimal("price_per_kwh")).thenReturn(new BigDecimal("-0.000001"));
    }
    @Override public <T>List<T> query(String sql,RowMapper<T> mapper,Object... args){
      try{
        if(sql.startsWith("SELECT t.id")){
          headerLeaseHeld=true;
          try{return List.of(mapper.mapRow(header,0));}finally{headerLeaseHeld=false;}
        }
        if(headerLeaseHeld)throw new IllegalStateException("No connection lease available while header result set is open");
        return List.of(mapper.mapRow(period,0));
      }catch(SQLException e){throw new AssertionError(e);}
    }
    @Override public List<Map<String,Object>> queryForList(String sql,Object... args){
      headerLeaseHeld=true;
      try{return List.of(Map.of("id",id,"name","A","version",1L,"tariff_id",1L,"pricing_mode","fixed","currency","CNY"));}
      finally{headerLeaseHeld=false;}
    }
  }
  @Test void listAndGetReturnExactImmutablePricesWithoutHoldingASecondPoolLease()throws Exception{
    var db=new SingleLeaseJdbc();var access=mock(AccessControl.class);when(access.context()).thenReturn(new TenantContext(7,11,"enterprise",false));
    var templates=new TariffTemplateService(new DomainSupport(db,access));
    var rows=assertDoesNotThrow(templates::list);assertEquals(1,rows.size());assertEquals("-0.000001",rows.getFirst().periods().getFirst().pricePerKwh());
    assertEquals(rows.getFirst(),assertDoesNotThrow(()->templates.get(db.id)));assertFalse(db.headerLeaseHeld);
  }
}
