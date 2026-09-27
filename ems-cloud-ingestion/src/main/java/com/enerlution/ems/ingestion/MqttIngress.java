package com.enerlution.ems.ingestion;
import java.time.Clock;
import java.util.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import com.enerlution.ems.protocol.WireDecoder;
import com.enerlution.ems.protocol.WireMessage;
import static com.enerlution.ems.ingestion.TransportDiagnostics.Signal.*;
public final class MqttIngress implements AutoCloseable {
 private final LeaseAuthority lease; private final Clock clock;
 private final TransportDiagnostics diagnostics;
 private final WireDecoder decoder=new WireDecoder(); private final UUID epoch=UUID.randomUUID();
 private final EnumMap<IngressEnvelope.Lane,ArrayBlockingQueue<IngressEnvelope>> queues=new EnumMap<>(IngressEnvelope.Lane.class);
 private BigInteger sequence=BigInteger.ZERO; private boolean closed;
 public MqttIngress(LeaseAuthority lease,int capacity,Clock clock){
  this(lease,capacity,clock,new TransportDiagnostics());
 }
 public MqttIngress(LeaseAuthority lease,int capacity,Clock clock,TransportDiagnostics diagnostics){
  this.lease=lease;this.clock=clock;this.diagnostics=diagnostics;for(var lane:IngressEnvelope.Lane.values())queues.put(lane,new ArrayBlockingQueue<>(capacity));
 }
 public synchronized boolean accept(String topic,byte[] payload){
  if(closed){diagnostics.record(CLOSED_REJECTION);return false;}
  var receivedAt=clock.instant(); sequence=sequence.add(BigInteger.ONE);
  WireMessage message;
  try {message=decoder.decode(topic,payload);}catch(RuntimeException invalid){diagnostics.record(DECODER_REJECTION);return false;}
  Optional<BigInteger> token;
  try {
   token=lease.acquire(message.emsId());
   if(token.isEmpty()){diagnostics.record(ADMISSION_REJECTION);return false;}
   if(!lease.isOwner(message.emsId(),token.get())){diagnostics.record(STALE_FENCE);return false;}
  }catch(RuntimeException failed){diagnostics.record(DATABASE_FAILURE);return false;}
  var envelope=new IngressEnvelope(message.emsId(),message.channel(),message.type(),message.canonicalHash(),
    new String(payload,StandardCharsets.UTF_8),topic,receivedAt,epoch,sequence,token.get());
  var accepted=queues.get(envelope.lane()).offer(envelope);
  diagnostics.record(accepted?ACCEPTED:QUEUE_OVERFLOW);return accepted;
 }
 public int queued(){return queues.values().stream().mapToInt(Collection::size).sum();}
 public IngressEnvelope poll(IngressEnvelope.Lane lane){return queues.get(lane).poll();}
 public synchronized void close(){closed=true;queues.values().forEach(Collection::clear);}
}
