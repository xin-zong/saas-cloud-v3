package com.enerlution.ems.protocol;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

/** Typed interpretation of the v1 complete ordinary profile (§3.2/3.3).
 * Every defined ordinary point is required, including unavailable null values.
 * Unknown EMS base extensions are skipped (§3.2); all legal config entries are retained.
 * No source scaling, physical binding, freshness threshold or enum interpretation occurs here.
 */
public final class TelemetryDecoder {
    private final PointCatalog catalog;
    public TelemetryDecoder(PointCatalog catalog){this.catalog=java.util.Objects.requireNonNull(catalog);}
    public TelemetryBatch decode(WireMessage message,StructureLayout layout){
        require(message!=null&&message.channel().equals("telemetry"),"Telemetry message required");
        String type=message.type();
        require(Set.of("ems","cabinet_30s","cabinet_60s","cell_voltage","cell_temperature").contains(type),"Unsupported typed telemetry");
        require(type.equals(EnvelopeValidation.validate(message.channel(),message.body(),message.emsId())),"Telemetry type mismatch");
        var n=message.body();var d=n.path("d");
        if(type.startsWith("cell_"))return cells(message,layout);
        var observations=new ArrayList<PointValue>();var seen=new HashSet<Integer>();
        ConfigurationSnapshot configuration=null;Integer cabinet=null;
        if(type.equals("ems")) {
            for(var block:d.path("base"))readBlock(block,"ems","base",type,observations,seen,true);
            require(seen.containsAll(definedIds("ems",type)),"Incomplete EMS profile");
            var cfg=d.path("cfg");var values=new LinkedHashMap<Integer,JsonNode>();
            var extensions=new LinkedHashMap<java.math.BigInteger,JsonNode>();
            for(var pair:cfg.path("p")) {
                var sourceId=pair.get(0).bigIntegerValue();var value=pair.get(1);
                require(value.isNull()||value.isNumber()||value.isTextual(),"Invalid configuration scalar");
                if(pair.get(0).canConvertToInt())require(values.put(sourceId.intValueExact(),value)==null,"Duplicate configuration point");
                else require(extensions.put(sourceId,value)==null,"Duplicate configuration point");
            }
            require(values.keySet().containsAll(definedIds("config",type)),"Incomplete configuration snapshot");
            configuration=new ConfigurationSnapshot(cfg.path("rev").bigIntegerValue(),values,extensions);
        } else {
            cabinet=n.path("c").intValue();
            for(String subsystem:List.of("emu","bms","tms","pvdc","pcs","grid"))
                readBlock(d.path(subsystem),"cabinet",subsystem,type,observations,seen,false);
            require(seen.equals(definedIds("cabinet",type)),"Incomplete cabinet profile");
            if(type.equals("cabinet_30s"))timestamp(d.path("link").path("ts"));
        }
        return new TelemetryBatch(message.emsId(),cabinet,type,observations,configuration,null);
    }
    private Set<Integer> definedIds(String namespace,String type){
        var ids=new HashSet<Integer>();
        for(var definition:catalog.definitions())if(definition.namespace().equals(namespace)&&type.equals(definition.sourceType()))ids.add(definition.sourcePointId());
        return ids;
    }
    private void readBlock(JsonNode block,String namespace,String subsystem,String type,List<PointValue> out,Set<Integer> seen,boolean extensions){
        Long ts=timestamp(block.path("ts"));String quality=block.path("q").asText();
        for(var pair:block.path("p")) {
            if(extensions&&!pair.get(0).canConvertToInt())continue;
            int id=id(pair.get(0));var definition=catalog.find(namespace,id);
            if(definition.isEmpty()&&extensions)continue;
            require(definition.isPresent(),"Unknown cabinet point");var rule=definition.orElseThrow();
            require(subsystem.equals(rule.subsystem())&&type.equals(rule.sourceType()),"Point placement mismatch");
            require(seen.add(id),"Duplicate telemetry point");validateValue(rule.wireType(),pair.get(1));
            out.add(new PointValue(namespace,id,subsystem,pair.get(1),quality,ts));
        }
    }
    private static void validateValue(PointCatalog.WireType rule,JsonNode value){
        if(value.isNull())return;
        switch(rule) {
            case NUMBER -> require(value.isNumber(),"Numeric point required");
            case TEXT -> require(value.isTextual(),"Text point required");
            case U16_WORDS -> {
                require(value.isArray()&&value.size()==4,"Four U16 words required");
                for(var word:value)require(word.isIntegralNumber()&&word.canConvertToInt()&&word.intValue()>=0&&word.intValue()<=65535,"Invalid U16 word");
            }
            default -> throw new ProtocolException("Unsupported measurement definition");
        }
    }
    private static TelemetryBatch cells(WireMessage message,StructureLayout layout){
        var n=message.body();int cabinet=n.path("c").intValue();var sv=n.path("sv").bigIntegerValue();
        require(layout!=null&&layout.emsId().equals(message.emsId())&&sv.equals(layout.structureVersion()),"Unknown or mismatched cell structure");
        var c=layout.cabinets().get(cabinet);
        require(c!=null&&c.state().equals("active")&&c.cellReady(),"Cabinet cell layout not ready");
        Integer count=layout.bmuCount(),columns=message.type().equals("cell_voltage")?layout.voltageCount():layout.temperatureCount();
        require(layout.bmuType()!=null&&count!=null&&columns!=null&&count>=1&&count<=10&&columns>=1&&columns<=255&&count*columns<=500,"Unknown or unsupported cell dimensions");
        var d=n.path("d");var values=d.path("values");String quality=d.path("q").asText();
        if(values.isNull())require(quality.equals("invalid"),"Unavailable cell group requires invalid quality");
        else {
            require(values.size()==count,"Cell BMU dimension mismatch");boolean hasValue=false;
            for(var row:values){require(row.size()==columns,"Cell dimension mismatch");for(var value:row)if(!value.isNull())hasValue=true;}
            require(hasValue,"Unavailable cell group must use outer null");
        }
        var frame=new CellFrame(cabinet,sv,message.type(),timestamp(d.path("ts")),quality,values);
        return new TelemetryBatch(message.emsId(),cabinet,message.type(),List.of(),null,frame);
    }
    private static int id(JsonNode n){require(n.isIntegralNumber()&&n.canConvertToInt()&&n.intValue()>0,"Unsupported point ID");return n.intValue();}
    private static Long timestamp(JsonNode n){if(n.isNull())return null;require(n.isIntegralNumber()&&n.canConvertToLong(),"Source timestamp outside supported range");return n.longValue();}
    private static void require(boolean condition,String message){if(!condition)throw new ProtocolException(message);}
}
