package com.enerlution.ems.ingestion;
import java.util.*;
import java.util.function.LongSupplier;
import java.util.concurrent.atomic.*;
import java.time.Duration;
/** Fixed-cardinality counters: callbacks never retain input/errors or write logs. */
public final class TransportDiagnostics {
 public enum Signal { ACCEPTED, PUBLISHED, DECODER_REJECTION, ADMISSION_REJECTION, DATABASE_FAILURE, STATE_PROGRAMMING_FAILURE, QUEUE_OVERFLOW, STALE_FENCE, PRODUCER_FAILURE, PUMP_FAILURE, CLOSED_REJECTION }
 private final LongAdder[] counters=Arrays.stream(Signal.values()).map(s->new LongAdder()).toArray(LongAdder[]::new);
 private final AtomicLong failureVersion=new AtomicLong();
 private final long intervalNanos; private final LongSupplier ticker; private long lastWarning,reportedVersion;
 public TransportDiagnostics(){this(Duration.ofSeconds(30).toNanos(),System::nanoTime);}
 TransportDiagnostics(long intervalNanos,LongSupplier ticker){
  if(intervalNanos<=0)throw new IllegalArgumentException("Positive warning interval required");
  this.intervalNanos=intervalNanos;this.ticker=ticker;lastWarning=ticker.getAsLong()-intervalNanos;
 }
 public void record(Signal signal){counters[signal.ordinal()].increment();if(failure(signal))failureVersion.incrementAndGet();}
 public long count(Signal signal){return counters[signal.ordinal()].sum();}
 public Map<String,Long> snapshot(){var result=new LinkedHashMap<String,Long>();for(var signal:Signal.values())result.put(signal.name(),count(signal));return Map.copyOf(result);}
 /** Called only by pumps; caller logs outside this short lock, at most once per worker per interval. */
 public synchronized Optional<Map<String,Long>> warningIfDue(){
  var version=failureVersion.get();var now=ticker.getAsLong();
  if(version==reportedVersion||now-lastWarning<intervalNanos)return Optional.empty();
  var result=new LinkedHashMap<String,Long>();
  for(var signal:Signal.values())if(failure(signal)&&count(signal)>0)result.put(signal.name(),count(signal));
  reportedVersion=version;lastWarning=now;return Optional.of(Map.copyOf(result));
 }
 private static boolean failure(Signal signal){return signal!=Signal.ACCEPTED&&signal!=Signal.PUBLISHED&&signal!=Signal.CLOSED_REJECTION;}
}
