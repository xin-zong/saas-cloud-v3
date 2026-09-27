package com.enerlution.ems.protocol;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigInteger;
import java.util.*;

/** A worker supplies a structure snapshot already accepted for the current connection.
 * This value does not perform connection/sequence arbitration or retain old readiness. */
public record StructureLayout(UUID emsId,BigInteger structureVersion,UUID connectionId,BigInteger sequence,
                              Integer bmuType,Integer bmuCount,Integer voltageCount,Integer temperatureCount,
                              Map<Integer,Cabinet> cabinets) {
    public record Cabinet(String state,boolean cellReady) {}
    public StructureLayout { cabinets=Map.copyOf(cabinets); }
    public static StructureLayout fromMessage(WireMessage message) {
        if(message==null||!message.type().equals("structure")||!message.channel().equals("telemetry"))
            throw new ProtocolException("Structure message required");
        if(!EnvelopeValidation.validate(message.channel(),message.body(),message.emsId()).equals("structure"))
            throw new ProtocolException("Structure type mismatch");
        var n=message.body(); var b=n.path("d").path("clusterLayout").path("bms");
        var cabinets=new HashMap<Integer,Cabinet>();
        for(var c:n.path("d").path("clusters")) cabinets.put(c.path("c").intValue(),new Cabinet(c.path("state").asText(),c.path("cellReady").booleanValue()));
        Integer count=integer(b,"bmuCount"), volts=integer(b,"voltCount"), temps=integer(b,"tempCount");
        if(count!=null&&(volts!=null&&count*volts>500||temps!=null&&count*temps>500))
            throw new ProtocolException("Unsupported cell layout capacity");
        return new StructureLayout(message.emsId(),n.path("sv").isNull()?null:n.path("sv").bigIntegerValue(),
            UUID.fromString(n.path("connectionId").asText()),n.path("seq").bigIntegerValue(),integer(b,"bmuType"),count,volts,temps,cabinets);
    }
    private static Integer integer(JsonNode n,String key){return n.path(key).isNull()?null:n.path(key).intValue();}
}
