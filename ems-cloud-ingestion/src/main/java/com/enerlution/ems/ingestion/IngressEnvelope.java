package com.enerlution.ems.ingestion;
import java.time.Instant;
import java.util.UUID;
import java.math.BigInteger;
public record IngressEnvelope(UUID emsId,String channel,String type,String canonicalHash,String rawBody,String sourceTopic,
 Instant receivedAt,UUID ingressEpoch,BigInteger sequence,BigInteger fencingToken) {
 public enum Lane { FAST, STATE, RELIABLE }
 public Lane lane(){return switch(type){
  case "ems","cabinet_30s","cabinet_60s","cell_voltage","cell_temperature" -> Lane.FAST;
  case "important_history","alarm_event","alarm_data" -> Lane.RELIABLE;
  default -> Lane.STATE;
 };}
}
