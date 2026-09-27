package com.enerlution.ems.ingestion;
import java.util.*;
import java.math.BigInteger;
public interface LeaseAuthority {
 Optional<BigInteger> acquire(UUID emsId);
 boolean isOwner(UUID emsId, BigInteger fence);
}
