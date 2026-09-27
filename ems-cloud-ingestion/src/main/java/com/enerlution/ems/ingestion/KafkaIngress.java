package com.enerlution.ems.ingestion;
import java.util.concurrent.*;
public final class KafkaIngress implements AutoCloseable {
 @FunctionalInterface public interface Sender { CompletionStage<Void> send(IngressEnvelope envelope); }
 private final LeaseAuthority lease; private final Sender sender; private volatile boolean closed;
 private final java.util.Set<CompletableFuture<Boolean>> pending=ConcurrentHashMap.newKeySet();
 public KafkaIngress(LeaseAuthority lease,Sender sender){this.lease=lease;this.sender=sender;}
 public synchronized CompletionStage<Boolean> publish(IngressEnvelope envelope){
  try {
   if(closed||pending.size()>=3||!lease.isOwner(envelope.emsId(),envelope.fencingToken()))return CompletableFuture.completedFuture(false);
   var result=new CompletableFuture<Boolean>();pending.add(result);
   try {sender.send(envelope).whenComplete((ignored,error)->{pending.remove(result);result.complete(!closed&&error==null);});}
   catch(RuntimeException failure){pending.remove(result);result.complete(false);}
   return result;
  }catch(RuntimeException error){return CompletableFuture.completedFuture(false);}
 }
 public synchronized void close(){closed=true;pending.forEach(f->f.complete(false));pending.clear();}
}
