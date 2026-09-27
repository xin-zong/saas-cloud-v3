package com.enerlution.ems.protocol;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigInteger;
import java.util.*;
/** Configuration is a separate revision domain; caller mutations cannot alter a snapshot. */
public record ConfigurationSnapshot(BigInteger revision,Map<Integer,JsonNode> values,Map<BigInteger,JsonNode> extensionValues) {
    public ConfigurationSnapshot(BigInteger revision,Map<Integer,JsonNode> values) {this(revision,values,Map.of());}
    public ConfigurationSnapshot { values=copy(values);extensionValues=copy(extensionValues); }
    @Override public Map<Integer,JsonNode> values(){return copy(values);}
    @Override public Map<BigInteger,JsonNode> extensionValues(){return copy(extensionValues);}
    private static <K> Map<K,JsonNode> copy(Map<K,JsonNode> input){
        var result=new LinkedHashMap<K,JsonNode>(); input.forEach((k,v)->result.put(k,v.deepCopy()));
        return Collections.unmodifiableMap(result);
    }
    public Map<BigInteger,JsonNode> allValues() {
        var result=new LinkedHashMap<BigInteger,JsonNode>();values.forEach((id,value)->result.put(BigInteger.valueOf(id),value.deepCopy()));extensionValues.forEach((id,value)->result.put(id,value.deepCopy()));return Collections.unmodifiableMap(result);
    }
}
