package com.enerlution.ems.ingestion;
import java.time.Clock;
import java.util.*;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import com.enerlution.ems.protocol.WireDecoder;
public final class MqttIngress implements AutoCloseable {
 private final LeaseAuthority lease; private final Clock clock;
 private final WireDecoder decoder=new WireDecoder(); private final UUID epoch=UUID.randomUUID();
 private final EnumMap<IngressEnvelope.Lane,ArrayBlockingQueue<IngressEnvelope>> queues=new EnumMap<>(IngressEnvelope.Lane.class);
 private BigInteger sequence=BigInteger.ZERO; private boolean closed;
 public MqttIngress(LeaseAuthority lease,int capacity,Clock clock){
  this.lease=lease;this.clock=clock; for(var lane:IngressEnvelope.Lane.values())queues.put(lane,new ArrayBlockingQueue<>(capacity));
 }
 public synchronized boolean accept(String topic,byte[] payload){
  if(closed)return false;
  var receivedAt=clock.instant(); sequence=sequence.add(BigInteger.ONE);
  try {
   var message=decoder.decode(topic,payload); var token=lease.acquire(message.emsId());
   if(token.isEmpty()||!lease.isOwner(message.emsId(),token.get()))return false;
   var envelope=new IngressEnvelope(message.emsId(),message.channel(),message.type(),message.canonicalHash(),
    new String(payload,StandardCharsets.UTF_8),topic,receivedAt,epoch,sequence,token.get());
   return queues.get(envelope.lane()).offer(envelope);
  }catch(RuntimeException rejected){return false;}
 }
 public int queued(){return queues.values().stream().mapToInt(Collection::size).sum();}
 public IngressEnvelope poll(IngressEnvelope.Lane lane){return queues.get(lane).poll();}
 public synchronized void close(){closed=true;queues.values().forEach(Collection::clear);}
}
