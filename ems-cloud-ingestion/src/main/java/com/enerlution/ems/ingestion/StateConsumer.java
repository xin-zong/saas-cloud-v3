package com.enerlution.ems.ingestion;
public final class StateConsumer {
    private final javax.sql.DataSource source;
    public StateConsumer(javax.sql.DataSource source){this.source=source;}
    static String handler(String type) {
        return switch(type) {
            case "heartbeat","status" -> "connection";
            case "structure" -> "structure";
            case "alarm_current" -> "alarm";
            case "response" -> "response";
            default -> throw new IllegalArgumentException("Unsupported state type");
        };
    }
    public boolean accept(IngressEnvelope envelope) {
        return switch(handler(envelope.type())) {
            case "connection" -> new ConnectionState(source).accept(envelope);
            case "structure" -> new StructureStore(source).accept(envelope);
            case "alarm" -> new AlarmProjection().current(source,envelope);
            case "response" -> new ResponseConsumer(source).accept(envelope);
            default -> throw new IllegalStateException("Missing state handler");
        };
    }
}
