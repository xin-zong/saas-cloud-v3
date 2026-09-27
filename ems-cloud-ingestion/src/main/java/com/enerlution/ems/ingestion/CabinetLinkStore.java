package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.TelemetryBatch;
import java.sql.*;
import java.math.BigDecimal;

/** Caller holds the EMS lock and has admitted this original receipt against the live period/fence. */
final class CabinetLinkStore {
 static void store(Connection c,long period,IngressEnvelope e,TelemetryBatch batch)throws SQLException {
  var link=batch.link();if(link==null)return;
  try(var q=c.prepareStatement("""
   INSERT INTO cabinet_link_current(binding_period_id,cabinet_no,online,source_at_ms,received_at,ingress_generation,ingress_order,fencing_token)
   VALUES(?,?,?,?,?,?,?,?)
   ON CONFLICT(binding_period_id,cabinet_no) DO UPDATE SET online=excluded.online,source_at_ms=excluded.source_at_ms,
     received_at=excluded.received_at,ingress_generation=excluded.ingress_generation,
     ingress_order=excluded.ingress_order,fencing_token=excluded.fencing_token
   WHERE cabinet_link_current.fencing_token<excluded.fencing_token
     OR (cabinet_link_current.fencing_token=excluded.fencing_token
       AND cabinet_link_current.ingress_generation=excluded.ingress_generation
       AND cabinet_link_current.ingress_order<excluded.ingress_order)
   """)) {
   q.setQueryTimeout(5);q.setLong(1,period);q.setInt(2,batch.cabinet());q.setObject(3,link.online(),Types.BOOLEAN);
   q.setObject(4,link.sourceTimestampMs(),Types.BIGINT);q.setTimestamp(5,Timestamp.from(e.receivedAt()));
   q.setObject(6,e.ingressEpoch());q.setBigDecimal(7,new BigDecimal(e.sequence()));q.setBigDecimal(8,new BigDecimal(e.fencingToken()));q.executeUpdate();
  }
 }
}
