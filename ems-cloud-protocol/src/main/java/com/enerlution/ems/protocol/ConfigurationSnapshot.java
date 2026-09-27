package com.enerlution.ems.protocol;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigInteger;
import java.util.*;
/** Configuration is a separate revision domain; caller mutations cannot alter a snapshot. */
public record ConfigurationSnapshot(BigInteger revision,Map<Integer,JsonNode> values) {
    public ConfigurationSnapshot { values=copy(values); }
    @Override public Map<Integer,JsonNode> values(){return copy(values);}
    private static Map<Integer,JsonNode> copy(Map<Integer,JsonNode> input){
        var result=new LinkedHashMap<Integer,JsonNode>(); input.forEach((k,v)->result.put(k,v.deepCopy()));
        return Collections.unmodifiableMap(result);
    }
}
