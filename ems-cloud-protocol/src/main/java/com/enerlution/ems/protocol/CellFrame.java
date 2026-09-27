package com.enerlution.ems.protocol;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigInteger;
public record CellFrame(int cabinet,BigInteger structureVersion,String kind,Long sourceTimestampMs,String quality,JsonNode values) {
    public CellFrame { values=values.deepCopy(); }
    @Override public JsonNode values(){return values.deepCopy();}
}
