package com.enerlution.ems.protocol;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;

/**
 * Validated wire envelope. Connection state, point semantics and storage are downstream concerns.
 * Type is the wire type, or heartbeat/status/response for those explicitly untyped envelopes.
 */
public record WireMessage(UUID emsId, String channel, String type, JsonNode body, String canonicalHash) {}
