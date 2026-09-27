package com.enerlution.ems.ingestion;

import com.fasterxml.jackson.databind.node.*;
import java.math.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TypedFactTest {
    @Test void arbitraryPrecisionNumbersNeverBecomeFiniteClickHouseDecimals() {
        var integer = new BigInteger("9".repeat(150));
        var decimal = new BigDecimal("1.000000000000000000000000000000000000000000000000000000000000000000000000000001E+200");
        var i = TypedFact.value(BigIntegerNode.valueOf(integer));
        var d = TypedFact.value(DecimalNode.valueOf(decimal));
        assertEquals(integer.toString(), i.path("number_exact").textValue());
        assertEquals(decimal.toString(), d.path("number_exact").textValue());
        assertEquals("number", i.path("value_kind").textValue());
        assertEquals(TypedFact.value(DecimalNode.valueOf(new BigDecimal("1.0"))), TypedFact.value(IntNode.valueOf(1)));
    }

    @Test void stringsWordsAndNullKeepDistinctMutuallyExclusiveSlots() {
        assertEquals("01.020.003", TypedFact.value(TextNode.valueOf("01.020.003")).path("text_value").textValue());
        var words = JsonNodeFactory.instance.arrayNode().add(65535).add(0).add(12).add(42);
        assertEquals(words, TypedFact.value(words).path("u16_words"));
        var absent = TypedFact.value(NullNode.instance);
        assertEquals("null", absent.path("value_kind").textValue());
        assertTrue(absent.path("text_value").isNull());
        assertTrue(absent.path("u16_words").isEmpty());
    }

    @Test void cellWholeNullDoesNotCollapseIntoNullPositions() {
        var absent = TypedFact.cells(NullNode.instance);
        var array = JsonNodeFactory.instance.arrayNode();
        array.add(JsonNodeFactory.instance.arrayNode().add(NullNode.instance).add(new BigDecimal("3.000000000000000000000000001")));
        var present = TypedFact.cells(array);
        assertEquals(0, absent.path("values_present").intValue());
        assertTrue(absent.path("cell_values").isEmpty());
        assertEquals(1, present.path("values_present").intValue());
        assertTrue(present.path("cell_values").get(0).get(0).isNull());
        assertEquals("3.000000000000000000000000001", present.path("cell_values").get(0).get(1).textValue());
    }

    @Test void identityIsReplayStableAndTimestampKindsRemainSeparate() {
        assertEquals(TypedFact.id("ems", "period", "point", "live", "unknown", "message"),
                TypedFact.id("ems", "period", "point", "live", "unknown", "message"));
        assertNotEquals(TypedFact.id("ems", "period", "point", "live", "12", "message"),
                TypedFact.id("ems", "period", "point", "archive", "12", "message"));
        assertNotEquals(TypedFact.id("a|b", "c"), TypedFact.id("a", "b|c"));
    }
    @Test void cellsRetainTheExactAdmittedConnectionRatherThanRevisionOrReceipt() {
        var connection=java.util.UUID.fromString("11111111-1111-4111-8111-111111111111");
        assertEquals(connection.toString(),TypedFact.cells(NullNode.instance,connection).path("connection_id").asText());
    }
}
