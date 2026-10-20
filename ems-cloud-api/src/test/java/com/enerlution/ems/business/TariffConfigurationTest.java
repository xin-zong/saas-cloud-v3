package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class TariffConfigurationTest {
 static TariffLibraryService.Request request(String type,String mode,List<TariffTemplateService.Period> periods){return new TariffLibraryService.Request("Separate rate","EUR",mode,periods,new TariffLibraryService.Metadata("HOUSE_ROOF",type,"ES","all",LocalDate.parse("2027-01-01"),LocalDate.parse("2028-01-01"),null,null),null);}
 @Test void knownNonpurchaseFixedAndStaticPricesNormalizeWithoutPublishingPurchaseTemplates(){for(String type:List.of("sell","subsidy","selfUse")){var fixed=TariffConfigurationService.validate(request(type,"fixed",List.of(new TariffTemplateService.Period(0,1440,"flat","0.125"))));assertEquals("0.125000",fixed.periods().getFirst().pricePerKwh());var tou=TariffConfigurationService.validate(request(type,"tou",List.of(new TariffTemplateService.Period(0,600,"deepValley","-0.1"),new TariffTemplateService.Period(600,1440,"peak","0.3"))));assertEquals("deepValley",tou.periods().getFirst().band());}}
 @Test void purchaseAndUnknownExecutionModesCannotEnterIndependentConfiguration(){assertThrows(BusinessException.class,()->TariffConfigurationService.validate(request("purchase","fixed",List.of(new TariffTemplateService.Period(0,1440,"flat","1")))));assertThrows(BusinessException.class,()->TariffConfigurationService.validate(request("selfUse","selfUseTou",List.of(new TariffTemplateService.Period(0,1440,"flat","1")))));assertThrows(BusinessException.class,()->TariffConfigurationService.validate(request("sell","tou",List.of(new TariffTemplateService.Period(0,100,"flat","1")))));}
 @Test void everyEntryPointRequiresPermissionBeforeDatabaseAccess(){var access=mock(AccessControl.class);var db=mock(JdbcTemplate.class);doThrow(new BusinessException(403,"denied")).when(access).requirePermission("tariff.manage");var service=new TariffConfigurationService(new DomainSupport(db,access));assertThrows(BusinessException.class,service::list);assertThrows(BusinessException.class,()->service.save(null,null));assertThrows(BusinessException.class,()->service.archive(UUID.randomUUID(),1L));verifyNoInteractions(db);}
}
