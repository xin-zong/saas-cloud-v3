package com.enerlution.ems.ingestion;

import com.enerlution.ems.protocol.WireMessage;
import java.sql.*;
import java.math.BigInteger;
import java.time.Instant;

/** Natural history identity is independent of upload task; PostgreSQL compares exact JSONB values. */
public final class HistoryIdentityStore {
 void save(Connection c,long messageId,WireMessage message) throws SQLException {
  var b=message.body();var base=b.get("ts").bigIntegerValue();
  for(var row:b.get("data")) {
   var at=Instant.ofEpochMilli(base.add(row.get(0).bigIntegerValue()).longValueExact());
   var point=b.get("p").get(row.get(1).bigIntegerValue().intValueExact());
   try(var q=c.prepareStatement("INSERT INTO history_sample_identity(ems_uuid,cabinet_no,source_id,archived_at,canonical_value,reliable_message_id) VALUES(?::uuid,?,?,?,?::jsonb,?) ON CONFLICT(ems_uuid,cabinet_no,source_id,archived_at) DO UPDATE SET canonical_value=history_sample_identity.canonical_value WHERE history_sample_identity.canonical_value=excluded.canonical_value RETURNING reliable_message_id")) {
    q.setString(1,message.emsId().toString());q.setInt(2,b.get("c").intValue());q.setBigDecimal(3,point.decimalValue());q.setTimestamp(4,Timestamp.from(at));q.setString(5,row.get(2).toString());q.setLong(6,messageId);try(var r=q.executeQuery()){if(!r.next())throw new ReliableMessageStore.Rejected();}
   }
  }
 }
}
