package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.TreeSet;

/** Exact semantic JSON comparison for persisted observations and immutable hashes. */
final class CanonicalJson {
    private static final ObjectMapper EXACT=new ObjectMapper()
        .enable(DeserializationFeature.USE_BIG_INTEGER_FOR_INTS)
        .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    static JsonNode read(String json)throws IOException {return EXACT.readTree(json);}
    static boolean equivalent(JsonNode left,JsonNode right) {
        return normalize(left).toString().equals(normalize(right).toString());
    }
    static JsonNode normalize(JsonNode node) {
        if(node.isNumber()) {
            BigDecimal number=node.decimalValue().stripTrailingZeros();
            return JsonNodeFactory.instance.numberNode(number.signum()==0?BigDecimal.ZERO:number);
        }
        if(node.isObject()) {
            var result=JsonNodeFactory.instance.objectNode();
            var names=new TreeSet<String>();node.fieldNames().forEachRemaining(names::add);
            for(String name:names)result.set(name,normalize(node.get(name)));
            return result;
        }
        if(node.isArray()) {
            var result=JsonNodeFactory.instance.arrayNode();
            node.forEach(item->result.add(normalize(item)));
            return result;
        }
        return node.deepCopy();
    }
}
