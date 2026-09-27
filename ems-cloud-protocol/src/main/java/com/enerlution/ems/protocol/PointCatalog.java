package com.enerlution.ems.protocol;

import com.fasterxml.jackson.databind.*;
import java.util.*;

/** Frozen evidence profile. SQL encoding fields are preserved evidence, never wire rules. */
public final class PointCatalog {
    public enum WireType { NUMBER, TEXT, U16_WORDS, SCALAR, UNKNOWN }
    public record Definition(String namespace, int sourcePointId, String sourceName, WireType wireType,
                             String verifiedUnit, String subsystem, String sourceType,
                             List<String> provenance, Map<String,String> sourceMetadata) {
        public Definition { provenance=List.copyOf(provenance); sourceMetadata=Map.copyOf(sourceMetadata); }
    }
    private final String version, sourceHash;
    private final List<Definition> definitions;
    private final Map<String,Definition> index;
    private PointCatalog(String version, String sourceHash, List<Definition> definitions) {
        this.version=version; this.sourceHash=sourceHash; this.definitions=List.copyOf(definitions);
        var map=new HashMap<String,Definition>();
        for(var d:definitions) if(map.put(key(d.namespace(),d.sourcePointId()),d)!=null)
            throw new ProtocolException("Duplicate catalog definition");
        index=Map.copyOf(map);
    }
    public static PointCatalog loadDefault() {
        try(var in=PointCatalog.class.getResourceAsStream("/ems-v1-point-catalog.json")) {
            if(in==null) throw new ProtocolException("Catalog resource unavailable");
            var root=new ObjectMapper().readTree(in); var items=new ArrayList<Definition>();
            for(var n:root.path("definitions")) {
                var provenance=new ArrayList<String>(); n.path("provenance").forEach(p->provenance.add(p.asText()));
                var metadata=new HashMap<String,String>(); n.path("sourceMetadata").fields().forEachRemaining(e->metadata.put(e.getKey(),e.getValue().asText()));
                items.add(new Definition(n.path("namespace").asText(),n.path("sourcePointId").intValue(),nullable(n,"sourceName"),
                    WireType.valueOf(n.path("wireType").asText()),nullable(n,"verifiedUnit"),nullable(n,"subsystem"),nullable(n,"sourceType"),provenance,metadata));
            }
            return new PointCatalog(root.path("version").asText(),root.path("sourceHash").asText(),items);
        } catch(ProtocolException e){throw e;} catch(Exception e){throw new ProtocolException("Invalid catalog resource");}
    }
    private static String nullable(JsonNode n,String key){return n.path(key).isNull()?null:n.path(key).asText();}
    private static String key(String namespace,int id){return namespace+":"+id;}
    public Optional<Definition> find(String namespace,int id){return Optional.ofNullable(index.get(key(namespace,id)));}
    public List<Definition> definitions(){return definitions;}
    public String version(){return version;}
    public String sourceHash(){return sourceHash;}
}
