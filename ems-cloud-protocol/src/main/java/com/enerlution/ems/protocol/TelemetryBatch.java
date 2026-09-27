package com.enerlution.ems.protocol;
import java.util.*;
public record TelemetryBatch(UUID emsId,Integer cabinet,String sourceType,List<PointValue> observations,
                             ConfigurationSnapshot configuration,CellFrame cells,LinkObservation link) {
    public record LinkObservation(Boolean online,Long sourceTimestampMs) {}
    public TelemetryBatch { observations=List.copyOf(observations); }
}
