package com.enerlution.ems.protocol;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.*;
import java.util.*;
import java.util.regex.Pattern;

/** Strict UTF-8/JSON decoding and envelope validation; never interprets point catalog or business state. */
public final class WireDecoder {
    private static final Pattern TOPIC = Pattern.compile("ems/v1/([0-9a-f-]{36})/up/(heartbeat|status|response|telemetry|important|alarm)");
    private final ObjectMapper mapper;

    public WireDecoder() {
        var factory = JsonFactory.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .streamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(64)
                .maxStringLength(131072).maxNumberLength(1024).build()).build();
        // Retain the decimal's exact scale/value before canonical normalization (no double conversion).
        mapper = JsonMapper.builder(factory).nodeFactory(JsonNodeFactory.instance)
            .enable(DeserializationFeature.USE_BIG_INTEGER_FOR_INTS, DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES).build();
    }

    public WireMessage decode(String topic, byte[] payload) {
        if (topic == null || payload == null) throw new ProtocolException("Missing wire input");
        var match = TOPIC.matcher(topic);
        if (!match.matches()) throw new ProtocolException("Invalid up topic");
        UUID emsId = EnvelopeValidation.uuid(match.group(1));
        String channel = match.group(2);
        if (payload.length == 0 || payload.length > 131072) throw new ProtocolException("Payload size exceeded");
        JsonNode body;
        try {
            String json = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(payload)).toString();
            try (JsonParser parser = mapper.createParser(json)) {
                body = mapper.readTree(parser);
                if (body == null || parser.nextToken() != null) throw new ProtocolException("Invalid JSON document");
            }
        } catch (ProtocolException e) { throw e; }
          catch (Exception e) { throw new ProtocolException("Invalid UTF-8 JSON document"); }
        validateUnicode(body);
        String type = EnvelopeValidation.validate(channel, body, emsId);
        int limit = channel.equals("response") || type.equals("structure") ? 65536 : type.equals("alarm_data") ? 131072 : 6144;
        if (payload.length > limit) throw new ProtocolException("Payload size exceeded");
        // alarm.current.get response has the stricter whole-envelope 6 KiB limit (§4.2).
        if (channel.equals("response") && body.path("ok").asBoolean()
            && body.path("data").path("type").asText().equals("alarm_current") && payload.length > 6144)
            throw new ProtocolException("Payload size exceeded");
        return new WireMessage(emsId, channel, type, body, hash(body));
    }

    private static void validateUnicode(JsonNode node) {
        if (node.isTextual()) validateUnicode(node.textValue());
        if (node.isObject()) node.fieldNames().forEachRemaining(WireDecoder::validateUnicode);
        if (node.isContainerNode()) node.forEach(WireDecoder::validateUnicode);
    }

    private static void validateUnicode(String value) {
        for (int i = 0; i < value.length(); i++) {
            char unit = value.charAt(i);
            if (Character.isHighSurrogate(unit)) {
                if (i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(++i)))
                    throw new ProtocolException("Invalid Unicode text");
            } else if (Character.isLowSurrogate(unit)) {
                throw new ProtocolException("Invalid Unicode text");
            }
        }
    }

    private String hash(JsonNode body) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(canonical(body).getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }

    private String canonical(JsonNode node) {
        if (node.isNumber()) {
            var decimal = node.decimalValue().stripTrailingZeros();
            // Scientific output avoids allocating enormous zero-filled strings for compact exponents.
            return decimal.signum() == 0 ? "0" : decimal.toString();
        }
        if (node.isArray()) {
            var items = new ArrayList<String>(); node.forEach(n -> items.add(canonical(n)));
            return "[" + String.join(",", items) + "]";
        }
        if (node.isObject()) {
            var names = new ArrayList<String>(); node.fieldNames().forEachRemaining(names::add); Collections.sort(names);
            var items = new ArrayList<String>();
            for (String name : names) {
                try { items.add(mapper.writeValueAsString(name) + ":" + canonical(node.get(name))); }
                catch (Exception e) { throw new ProtocolException("Invalid canonical document"); }
            }
            return "{" + String.join(",", items) + "}";
        }
        return node.toString();
    }
}
