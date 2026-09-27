package com.enerlution.ems.protocol;
import com.fasterxml.jackson.databind.JsonNode;
/** No derived asset identity or unit conversion. Explicit JSON null remains a value. */
public record PointValue(String namespace,int sourcePointId,String subsystem,JsonNode value,String quality,Long sourceTimestampMs) {
    public PointValue { value=value.deepCopy(); }
    @Override public JsonNode value(){return value.deepCopy();}
}
