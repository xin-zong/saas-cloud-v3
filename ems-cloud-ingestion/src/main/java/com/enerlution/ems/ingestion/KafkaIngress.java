package com.enerlution.ems.ingestion;
import java.util.concurrent.*;
import static com.enerlution.ems.ingestion.TransportDiagnostics.Signal.*;
public final class KafkaIngress implements AutoCloseable {
 @FunctionalInterface public interface Sender { CompletionStage<Void> send(IngressEnvelope envelope); }
 private final LeaseAuthority lease; private final Sender sender; private volatile boolean closed;
 private final java.util.Set<CompletableFuture<Boolean>> pending=ConcurrentHashMap.newKeySet();
 private final TransportDiagnostics diagnostics;
 public KafkaIngress(LeaseAuthority lease,Sender sender){this(lease,sender,new TransportDiagnostics());}
 public KafkaIngress(LeaseAuthority lease,Sender sender,TransportDiagnostics diagnostics){this.lease=lease;this.sender=sender;this.diagnostics=diagnostics;}
 public synchronized CompletionStage<Boolean> publish(IngressEnvelope envelope){
  if(closed){diagnostics.record(CLOSED_REJECTION);return CompletableFuture.completedFuture(false);}
  if(pending.size()>=3){diagnostics.record(QUEUE_OVERFLOW);return CompletableFuture.completedFuture(false);}
  try {
   if(!lease.isOwner(envelope.emsId(),envelope.fencingToken())){diagnostics.record(STALE_FENCE);return CompletableFuture.completedFuture(false);}
  }catch(RuntimeException error){diagnostics.record(DATABASE_FAILURE);return CompletableFuture.completedFuture(false);}
  var result=new CompletableFuture<Boolean>();pending.add(result);
  try {sender.send(envelope).whenComplete((ignored,error)->{
   pending.remove(result);if(!closed)diagnostics.record(error==null?PUBLISHED:PRODUCER_FAILURE);result.complete(!closed&&error==null);
  });}
  catch(RuntimeException failure){pending.remove(result);diagnostics.record(PRODUCER_FAILURE);result.complete(false);}
  return result;
 }
 public synchronized void close(){closed=true;pending.forEach(f->f.complete(false));pending.clear();}
}
