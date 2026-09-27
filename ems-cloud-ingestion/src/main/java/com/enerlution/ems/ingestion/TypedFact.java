package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

final class TypedFact {
    static ObjectNode cells(JsonNode value,java.util.UUID connection) {
        if(connection==null||connection.version()!=4||connection.variant()!=2)throw new IllegalArgumentException("Accepted connection must be UUIDv4");
        var row=cells(value);row.put("connection_id",connection.toString());return row;
    }
    static ObjectNode value(JsonNode value) {
        var row = JsonNodeFactory.instance.objectNode();
        row.putNull("number_exact");
        row.putNull("text_value");
        row.putArray("u16_words");
        if (value.isNull()) row.put("value_kind", "null");
        else if (value.isNumber()) {
            row.put("value_kind", "number");
            row.put("number_exact", number(value));
        } else if (value.isTextual()) {
            row.put("value_kind", "text");
            row.put("text_value", value.textValue());
        } else if (value.isArray() && value.size() == 4) {
            for (var word : value) {
                if (!word.isIntegralNumber() || !word.canConvertToInt() || word.intValue() < 0 || word.intValue() > 65535)
                    throw new IllegalArgumentException("Invalid U16 words");
            }
            row.put("value_kind", "u16_words");
            row.set("u16_words", value.deepCopy());
        } else throw new IllegalArgumentException("Unsupported exact observation value");
        return row;
    }

    static String number(JsonNode value) {
        return value.decimalValue().stripTrailingZeros().toString();
    }

    static ObjectNode cells(JsonNode value) {
        var row = JsonNodeFactory.instance.objectNode();
        row.put("values_present", value.isNull() ? 0 : 1);
        var values = row.putArray("cell_values");
        if (!value.isNull()) for (var sourceRow : value) {
            var targetRow = values.addArray();
            for (var element : sourceRow) {
                if (element.isNull()) targetRow.addNull();
                else if (element.isNumber()) targetRow.add(number(element));
                else throw new IllegalArgumentException("Invalid cell value");
            }
        }
        return row;
    }

    static String id(String... components) {
        try {
            var values = JsonNodeFactory.instance.arrayNode();
            for (String component : components) values.add(component);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(values.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
