package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import com.enerlution.ems.common.BusinessException;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
class StationMetricCalculatorTest {
 @Test void integratesOnlyCompleteNonnegativePowerWithExactBoundaries(){
  var samples=new ArrayList<StationMetricCalculator.Sample>();
  for(long t=0;t<=3600000;t+=300000)samples.add(new StationMetricCalculator.Sample(t,new BigDecimal("2"),true));
  assertEquals(new BigDecimal("2.00"),StationMetricCalculator.integrate(samples,0,3600000,"kW").value());
  assertEquals(new BigDecimal("0.00"),StationMetricCalculator.integrate(samples,0,3600000,"W").value());
  samples.remove(1);assertNull(StationMetricCalculator.integrate(samples,0,3600000,"kW").value());
 }
 @Test void missingBoundariesInvalidSamplesAndNegativeDirectionNeverInventEnergy(){
  assertNull(StationMetricCalculator.integrate(List.of(),0,300000,"kW").value());
  assertNull(StationMetricCalculator.integrate(List.of(new StationMetricCalculator.Sample(1,BigDecimal.ONE,true),new StationMetricCalculator.Sample(300000,BigDecimal.ONE,true)),0,300000,"kW").value());
  assertNull(StationMetricCalculator.integrate(List.of(new StationMetricCalculator.Sample(0,BigDecimal.ONE,false),new StationMetricCalculator.Sample(300000,BigDecimal.ONE,true)),0,300000,"kW").value());
  assertNull(StationMetricCalculator.integrate(List.of(new StationMetricCalculator.Sample(0,BigDecimal.ONE.negate(),true),new StationMetricCalculator.Sample(300000,BigDecimal.ONE,true)),0,300000,"kW").value());
 }
 @Test void offsetValidationAcceptsZeroAndSignedRangeWithoutRoundingOrCoercion(){
  for(String v:List.of("0","-0","99999999.99","-99999999.99","2.10"))assertDoesNotThrow(()->StationMetricCalculator.offset(v));
  for(String v:List.of("01","1e2","1.001","100000000","NaN"," 1","+1"))assertThrows(BusinessException.class,()->StationMetricCalculator.offset(v));
 }
}
