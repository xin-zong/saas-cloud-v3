package com.enerlution.ems.ingestion;

import javax.sql.DataSource;
import java.sql.*;
import java.math.BigInteger;
import java.util.*;

/** DB time and monotonic numeric fencing; no UUID comparison and no cached ownership. */
public final class GatewayLease implements LeaseAuthority {
 private final DataSource source; private final String owner; private final int seconds;
 private boolean closed;
 private UUID renewalCursor;
 public GatewayLease(DataSource source,String owner,int seconds){
  if(owner==null||owner.isBlank()||seconds<1)throw new IllegalArgumentException("Invalid lease configuration");
  this.source=source;this.owner=owner;this.seconds=seconds;
 }
 public synchronized Optional<BigInteger> acquire(UUID id){
  if(closed)return Optional.empty();
  for(int attempt=0;attempt<3;attempt++) {
   try(var c=source.getConnection()) {
    c.setAutoCommit(false);
    try {
     try(var lock=c.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?::text,78291029))")) {lock.setQueryTimeout(5);lock.setString(1,id.toString());lock.execute();}
     try(var insert=c.prepareStatement("INSERT INTO connection_state(ems_uuid) SELECT g.ems_uuid FROM ems_gateway g WHERE g.ems_uuid=?::uuid AND EXISTS(SELECT 1 FROM ems_binding_period b WHERE b.ems_uuid=g.ems_uuid AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp())) ON CONFLICT DO NOTHING")) {insert.setQueryTimeout(5);insert.setString(1,id.toString());insert.executeUpdate();}
     Optional<BigInteger> result;
     try(var update=c.prepareStatement("UPDATE connection_state SET connection_id=CASE WHEN lease_owner=? AND lease_until>clock_timestamp() THEN connection_id ELSE NULL END, ingress_generation=CASE WHEN lease_owner=? AND lease_until>clock_timestamp() THEN ingress_generation ELSE NULL END, ingress_order=CASE WHEN lease_owner=? AND lease_until>clock_timestamp() THEN ingress_order ELSE NULL END, last_fresh_heartbeat=CASE WHEN lease_owner=? AND lease_until>clock_timestamp() THEN last_fresh_heartbeat ELSE NULL END, fencing_token=CASE WHEN lease_owner=? AND lease_until>clock_timestamp() THEN fencing_token ELSE fencing_token+1 END, lease_owner=?, lease_until=clock_timestamp()+make_interval(secs=>?) WHERE ems_uuid=?::uuid AND EXISTS(SELECT 1 FROM ems_binding_period b WHERE b.ems_uuid=connection_state.ems_uuid AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp())) AND (lease_owner=? OR lease_owner IS NULL OR lease_until<=clock_timestamp()) RETURNING fencing_token")) {
      update.setQueryTimeout(5);for(int i=1;i<=6;i++)update.setString(i,owner);update.setInt(7,seconds);update.setString(8,id.toString());update.setString(9,owner);
      try(var rows=update.executeQuery()){result=rows.next()?Optional.of(rows.getBigDecimal(1).toBigIntegerExact()):Optional.empty();}
     }
     c.commit();return result;
    }catch(SQLException|RuntimeException e){c.rollback();throw e;}
   }catch(SQLException e){
    if(attempt<2&&("40001".equals(e.getSQLState())||"40P01".equals(e.getSQLState())))continue;
    throw new IllegalStateException("Lease database operation failed",e);
   }
  }
  throw new IllegalStateException("Lease retry exhausted");
 }
 public boolean isOwner(UUID id,BigInteger fence){
  try(var c=source.getConnection();var q=c.prepareStatement("SELECT 1 FROM connection_state s JOIN ems_gateway g USING(ems_uuid) WHERE s.ems_uuid=?::uuid AND lease_owner=? AND fencing_token=? AND lease_until>clock_timestamp() AND EXISTS(SELECT 1 FROM ems_binding_period b WHERE b.ems_uuid=s.ems_uuid AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()))")){
   q.setQueryTimeout(5);q.setString(1,id.toString());q.setString(2,owner);q.setBigDecimal(3,new java.math.BigDecimal(fence));
   try(var rows=q.executeQuery()){return rows.next();}
  }catch(SQLException e){throw new IllegalStateException("Lease database check failed",e);}
 }
 private record Owned(UUID id,BigInteger fence) {}
 private List<Owned> owned(UUID after,boolean live)throws SQLException {
  var result=new ArrayList<Owned>();
  try(var c=source.getConnection();var q=c.prepareStatement("SELECT ems_uuid,fencing_token FROM connection_state WHERE lease_owner=? AND (?::uuid IS NULL OR ems_uuid>?::uuid) "+(live?"AND lease_until>clock_timestamp() ":"")+"ORDER BY ems_uuid LIMIT 128")) {
   q.setQueryTimeout(5);q.setString(1,owner);q.setObject(2,after);q.setObject(3,after);
   try(var r=q.executeQuery()){while(r.next())result.add(new Owned(r.getObject(1,UUID.class),r.getBigDecimal(2).toBigIntegerExact()));}
  }
  return result;
 }
 /** One bounded page, fair cursor, no acquisition and no heartbeat/connection mutation. */
 public synchronized void renewOwned() {
  if(closed)return;
  try {
   var page=owned(renewalCursor,true);
   for(var row:page)changeOwned(row,false);
   renewalCursor=page.size()<128?null:page.getLast().id();
  }catch(SQLException e){throw new IllegalStateException("Lease renewal failed",e);}
 }
 private void changeOwned(Owned row,boolean release)throws SQLException {
  try(var c=source.getConnection()) {
   c.setAutoCommit(false);
   try {
    // Never wait behind a busy EMS while starving renewals for the rest of the page.
    if(release)ReliableMessageStore.lock(c,row.id().toString());
    else try(var q=c.prepareStatement("SELECT pg_try_advisory_xact_lock(hashtextextended(?::text,78291029))")) {
     q.setQueryTimeout(1);q.setString(1,row.id().toString());try(var r=q.executeQuery()){r.next();if(!r.getBoolean(1)){c.rollback();return;}}
    }
    String assignment=release?"lease_owner=NULL,lease_until=NULL":"lease_until=clock_timestamp()+make_interval(secs=>?)";
    try(var q=c.prepareStatement("UPDATE connection_state SET "+assignment+" WHERE ems_uuid=? AND lease_owner=? AND fencing_token=?"
       +(release?"":" AND lease_until>clock_timestamp() AND EXISTS(SELECT 1 FROM ems_binding_period b WHERE b.ems_uuid=connection_state.ems_uuid AND b.valid_from<=clock_timestamp() AND (b.valid_to IS NULL OR b.valid_to>clock_timestamp()))"))) {
     q.setQueryTimeout(5);int i=1;if(!release)q.setInt(i++,seconds);q.setObject(i++,row.id());q.setString(i++,owner);q.setBigDecimal(i,new java.math.BigDecimal(row.fence()));q.executeUpdate();
    }
    c.commit();
   }catch(SQLException|RuntimeException e){c.rollback();throw e;}
  }
 }
 /** Terminal lifecycle boundary; acquisition/renewal cannot race shutdown. */
 public synchronized void close() {
  closed=true;
  try {
   UUID cursor=null;
   while(true) {
    var page=owned(cursor,false);for(var row:page)changeOwned(row,true);
    if(page.size()<128)return;cursor=page.getLast().id();
   }
  }catch(SQLException e){throw new IllegalStateException("Lease release failed",e);}
 }
}
