package com.enerlution.ems.ingestion;
import java.util.*;
import java.math.BigInteger;
public interface LeaseAuthority extends AutoCloseable {
 Optional<BigInteger> acquire(UUID emsId);
 boolean isOwner(UUID emsId, BigInteger fence);
 default void renewOwned() {}
 default void close() {}
}
