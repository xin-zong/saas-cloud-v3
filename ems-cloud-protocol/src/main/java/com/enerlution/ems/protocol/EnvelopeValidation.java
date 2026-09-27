package com.enerlution.ems.protocol;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigInteger;
import java.util.*;
import java.util.regex.Pattern;

/** Required envelope shapes only. Catalog completeness, layout matching, freshness and lifecycle are not validated here. */
final class EnvelopeValidation {
    private static final Pattern UUID4 = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    private static final BigInteger U64_MAX = new BigInteger("18446744073709551615");
    private static final Set<String> TELEMETRY = Set.of("ems", "cabinet_30s", "cabinet_60s", "cell_voltage", "cell_temperature", "structure");
    private static final Set<String> ALARMS = Set.of("alarm_event", "alarm_data", "alarm_current");
    private EnvelopeValidation() {}

    static UUID uuid(String value) {
        require(UUID4.matcher(value).matches()); return UUID.fromString(value);
    }
    static String validate(String channel, JsonNode n, UUID identity) {
        object(n); version(n);
        if (n.has("emsId")) require(uuid(text(n, "emsId")).equals(identity));
        if (Set.of("heartbeat", "status", "response").contains(channel)) {
            require(!n.has("type")); require(n.has("emsId"));
            switch (channel) {
                case "heartbeat" -> { connection(n); unsignedOrNull(field(n,"uptimeSeconds"), U64_MAX); }
                case "status" -> choice(n,"state", "connected", "disconnected");
                case "response" -> response(n,identity);
            }
            return channel;
        }
        String type = text(n, "type");
        require(channel.equals("telemetry") ? TELEMETRY.contains(type) : channel.equals("alarm") ? ALARMS.contains(type) : type.equals("important_history"));
        typed(type,n); return type;
    }
    private static void typed(String type, JsonNode n) {
        version(n);
        switch (type) {
            case "ems" -> {
                var d = obj(n,"d"); var base = array(d,"base"); require(!base.isEmpty()); base.forEach(EnvelopeValidation::block);
                var cfg = obj(d,"cfg"); unsigned(field(cfg,"rev"),null); pairs(field(cfg,"p"));
            }
            case "cabinet_30s", "cabinet_60s" -> {
                cabinet(field(n,"c")); var d=obj(n,"d");
                for(String key: List.of("emu","bms","tms","pvdc","pcs","grid")) block(field(d,key));
                if(type.equals("cabinet_30s")) { var link=obj(d,"link"); timestamp(field(link,"ts"),true); booleanOrNull(field(link,"online")); }
            }
            case "cell_voltage", "cell_temperature" -> {
                cabinet(field(n,"c")); positive(field(n,"sv")); var d=obj(n,"d"); quality(d);
                matrix(field(d,"values"), -1, true);
            }
            case "structure" -> structure(n);
            case "important_history" -> history(n);
            case "alarm_event" -> event(n,false,null);
            case "alarm_current" -> {
                connection(n); cabinet(field(n,"c")); positive(field(n,"seq")); var a=field(n,"alarms");
                if(!a.isNull()){require(a.isArray()); for(var e:a) event(e,true,n.get("c"));}
            }
            case "alarm_data" -> alarmData(n);
            default -> throw new ProtocolException("Unsupported message type");
        }
    }
    private static void response(JsonNode n, UUID identity) {
        require(text(n,"id").matches("[A-Za-z0-9_-]{1,64}")); var ok=field(n,"ok"); require(ok.isBoolean());
        if(ok.booleanValue()) {
            require(!n.has("error")); var d=obj(n,"data");
            if(d.has("type")) {
                String type=text(d,"type"); require(type.equals("structure")||type.equals("alarm_current"));
                if(d.has("emsId")) require(uuid(text(d,"emsId")).equals(identity));
                typed(type,d);
            } else { // B.3 legacy communication.status.get response is independently defined.
                choice(d,"state","connected","disconnected"); unsignedOrNull(field(d,"uptimeSeconds"),U64_MAX);
            }
        } else {
            require(!n.has("data")); var e=obj(n,"error"); require(!text(e,"code").isEmpty()); require(!text(e,"message").isEmpty());
        }
    }
    private static void structure(JsonNode n) {
        connection(n); positive(field(n,"seq")); positiveOrNull(field(n,"sv")); var d=obj(n,"d");
        identity(obj(d,"ems"),true); meters(field(d,"publicMeters"),true,true);
        var clusters=array(d,"clusters"); var seen=new HashSet<BigInteger>();
        for(var cluster:clusters) {
            object(cluster); cabinet(field(cluster,"c")); require(seen.add(cluster.get("c").bigIntegerValue())); asciiOrNull(field(cluster,"sn"));
            choice(cluster,"state","pending_activation","active","exited"); require(field(cluster,"cellReady").isBoolean());
            var devices=obj(cluster,"devices"); for(String key:List.of("emu","pcs","dcdc","tms","bmu")) identity(obj(devices,key),false);
            meters(field(devices,"clusterMeters"),true,false);
        }
        var layout=obj(d,"clusterLayout"); for(String key:List.of("emu","pcs","dcdc","tms")) one(field(layout,key));
        var vendors=obj(layout,"vendors"); for(String key:List.of("emu","pcs","dcdc","tms","bmu")) vendor(field(vendors,key));
        meters(field(layout,"clusterMeters"),false,true);
        var bms=obj(layout,"bms"); one(field(bms,"count")); boundedOrNull(field(bms,"bmuType"),0,2);
        boundedOrNull(field(bms,"bmuCount"),1,10); boundedOrNull(field(bms,"voltCount"),1,255); boundedOrNull(field(bms,"tempCount"),1,255);
        // Whether sv and this layout agree, and whether any cabinet is ready, is downstream state validation.
    }
    private static void identity(JsonNode n,boolean withVendor) {
        asciiOrNull(field(n,"sn")); asciiOrNull(field(n,"swVersion")); if(withVendor) vendor(field(n,"vendor"));
    }
    private static void meters(JsonNode n, boolean withIdentity, boolean withConfig) {
        if(n.isNull()) return; require(n.isArray()); var ids=new HashSet<BigInteger>();
        for(var meter:n) {
            object(meter); positive(field(meter,"id")); require(ids.add(meter.get("id").bigIntegerValue()));
            if(withIdentity) identity(meter,false);
            if(withConfig) {var use=field(meter,"use"); require(use.isNull()||use.isTextual()); vendor(field(meter,"vendor"));}
        }
    }
    private static void event(JsonNode n,boolean current, JsonNode cabinet) {
        object(n); positiveOrNull(field(n,"sv")); uuid(text(n,"alarmId")); positive(field(n,"seq"));
        var device=obj(n,"device"); require(device.size()==3); var c=field(device,"c"); if(!c.isNull()) cabinet(c);
        require(text(device,"type").matches("ems|emu|bms|bmu|pcs|dcdc|tms")); positiveOrNull(field(device,"id"));
        if(current) require(c.equals(cabinet));
        require(text(n,"code").matches("[0-9A-F]{6}")); boundedOrNull(field(n,"level"),1,3);
        choice(n,"state",current?new String[]{"active"}:new String[]{"active","cleared"}); timestamp(field(n,"ts"),false);
    }
    private static void alarmData(JsonNode n) {
        positiveOrNull(field(n,"sv")); uuid(text(n,"alarmId")); timestamp(field(n,"start"),false);
        require(field(n,"step").isIntegralNumber()&&n.get("step").bigIntegerValue().equals(BigInteger.valueOf(1000)));
        var points=array(n,"points"); require(points.size()>=1&&points.size()<=10);
        for(var p:points) {require(p.isArray()&&p.size()==3); cabinet(p.get(0)); require(p.get(1).isTextual()&&!p.get(1).textValue().isEmpty()); positive(p.get(2));}
        matrix(field(n,"data"),points.size(),false);
    }
    private static void history(JsonNode n) {
        uuid(text(n,"taskId")); cabinet(field(n,"c")); positive(field(n,"part")); positive(field(n,"parts"));
        require(n.get("part").bigIntegerValue().compareTo(n.get("parts").bigIntegerValue())<=0); timestamp(field(n,"ts"),false);
        var points=array(n,"p"); var ids=new HashSet<BigInteger>(); for(var p:points){positive(p);require(ids.add(p.bigIntegerValue()));}
        require(!points.isEmpty()); var data=array(n,"data"); require(!data.isEmpty()&&data.size()<=100);
        for(var row:data) {
            require(row.isArray()&&row.size()==3); unsigned(row.get(0),null); unsigned(row.get(1),null);
            require(row.get(1).bigIntegerValue().compareTo(BigInteger.valueOf(points.size()))<0); value(row.get(2));
        }
    }
    private static void block(JsonNode n) {object(n);quality(n);pairs(field(n,"p"));}
    private static void quality(JsonNode n) {timestamp(field(n,"ts"),true); choice(n,"q","valid","stale","invalid");}
    private static void pairs(JsonNode n) {
        require(n.isArray()); var ids=new HashSet<BigInteger>();
        for(var p:n){ require(p.isArray()&&p.size()==2); positive(p.get(0)); require(ids.add(p.get(0).bigIntegerValue()));value(p.get(1)); }
    }
    private static void value(JsonNode n) {
        require(n.isNull()||n.isNumber()||n.isTextual()||n.isArray());
        if(n.isArray()) for(var v:n) require(v.isNull()||v.isNumber()||v.isTextual());
    }
    private static void matrix(JsonNode n,int columns,boolean nullable) {
        if(n.isNull()){require(nullable);return;} require(n.isArray()&&!n.isEmpty());
        for(var row:n) {require(row.isArray()&&!row.isEmpty());if(columns>=0)require(row.size()==columns);for(var v:row)require(v.isNull()||v.isNumber());}
    }
    private static void version(JsonNode n) {one(field(n,"v"));}
    private static void connection(JsonNode n) {uuid(text(n,"connectionId"));}
    private static void one(JsonNode n) {require(n.isIntegralNumber()&&n.bigIntegerValue().equals(BigInteger.ONE));}
    private static void positive(JsonNode n) {require(n.isIntegralNumber()&&n.bigIntegerValue().signum()>0);}
    private static void positiveOrNull(JsonNode n) {if(!n.isNull())positive(n);}
    private static void unsigned(JsonNode n,BigInteger max) {require(n.isIntegralNumber()&&n.bigIntegerValue().signum()>=0);if(max!=null)require(n.bigIntegerValue().compareTo(max)<=0);}
    private static void unsignedOrNull(JsonNode n,BigInteger max) {if(!n.isNull())unsigned(n,max);}
    private static void timestamp(JsonNode n,boolean nullable) {require(nullable&&n.isNull()||n.isIntegralNumber());}
    private static void cabinet(JsonNode n) {bounded(n,1,30);}
    private static void boundedOrNull(JsonNode n,int low,int high) {if(!n.isNull())bounded(n,low,high);}
    private static void bounded(JsonNode n,int low,int high) {require(n.isIntegralNumber());require(n.bigIntegerValue().compareTo(BigInteger.valueOf(low))>=0&&n.bigIntegerValue().compareTo(BigInteger.valueOf(high))<=0);}
    private static void booleanOrNull(JsonNode n) {require(n.isNull()||n.isBoolean());}
    private static void asciiOrNull(JsonNode n) {if(!n.isNull())require(n.isTextual()&&n.textValue().matches("[\\x20-\\x7e]{1,64}"));}
    private static void vendor(JsonNode n) {if(!n.isNull())require(n.isTextual()&&n.textValue().matches("[a-z0-9_.-]{1,32}"));}
    private static void choice(JsonNode n,String key,String... options) {require(Arrays.asList(options).contains(text(n,key)));}
    private static String text(JsonNode n,String key) {var v=field(n,key);require(v.isTextual());return v.textValue();}
    private static JsonNode obj(JsonNode n,String key) {var v=field(n,key);object(v);return v;}
    private static JsonNode array(JsonNode n,String key) {var v=field(n,key);require(v.isArray());return v;}
    private static JsonNode field(JsonNode n,String key) {object(n);var v=n.get(key);require(v!=null);return v;}
    private static void object(JsonNode n) {require(n!=null&&n.isObject());}
    private static void require(boolean valid) {if(!valid)throw new ProtocolException("Invalid wire envelope");}
}
