package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import com.enerlution.ems.common.BusinessException;
class TariffLibraryServiceTest {
 @Test void newLibraryBindingsCannotIgnoreDeclaredCountryOrSiteType(){
  assertThrows(BusinessException.class,()->TariffLibraryService.checkProfile("HOUSE_ROOF","commercial","ES"));
  assertThrows(BusinessException.class,()->TariffLibraryService.checkProfile("COMMERCIAL_INDUSTRIAL_ROOF","commercial","中国"));
  assertThrows(BusinessException.class,()->TariffLibraryService.checkProfile("HOUSE_ROOF",null,null));
  assertDoesNotThrow(()->TariffLibraryService.checkProfile("COMMERCIAL_INDUSTRIAL_ROOF","commercial","Spain"));
  assertDoesNotThrow(()->TariffLibraryService.checkProfile("HOUSE_ROOF","residential","西班牙"));
 }
 @Test void metadataRejectsUnknownCountrySourceAndInvalidDatesWithoutCoercingAnnualFees(){
  assertThrows(BusinessException.class,()->TariffLibraryService.validateMetadata("COMMERCIAL_INDUSTRIAL_ROOF","purchase","CN","all",LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),"0","0"));
  assertThrows(BusinessException.class,()->TariffLibraryService.validateMetadata("COMMERCIAL_INDUSTRIAL_ROOF","sell","ES","all",LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),"0","0"));
  assertThrows(BusinessException.class,()->TariffLibraryService.validateMetadata("COMMERCIAL_INDUSTRIAL_ROOF","purchase","ES","all",LocalDate.parse("2027-01-01"),LocalDate.parse("2027-01-01"),"0","0"));
  assertThrows(BusinessException.class,()->TariffLibraryService.validateMetadata("COMMERCIAL_INDUSTRIAL_ROOF","purchase","ES","all",LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),"NaN",null));
  assertDoesNotThrow(()->TariffLibraryService.validateMetadata("HOUSE_ROOF","purchase","ES","all",LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),null,"12.345600"));
 }
 @Test void bindingMustRemainInsidePublishedLibraryValidity(){
  assertThrows(BusinessException.class,()->TariffLibraryService.checkDates(LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),LocalDate.parse("2026-12-31"),LocalDate.parse("2027-02-01")));
  assertThrows(BusinessException.class,()->TariffLibraryService.checkDates(LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),LocalDate.parse("2027-02-01"),LocalDate.parse("2028-01-02")));
  assertDoesNotThrow(()->TariffLibraryService.checkDates(LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01")));
 }
}
