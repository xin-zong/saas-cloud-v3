package com.enerlution.ems.protocol;
import java.util.*;
public record TelemetryBatch(UUID emsId,Integer cabinet,String sourceType,List<PointValue> observations,
                             ConfigurationSnapshot configuration,CellFrame cells) {
    public TelemetryBatch { observations=List.copyOf(observations); }
}
