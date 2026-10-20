package com.enerlution.ems.business;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.enerlution.ems.auth.AccessControl;
import com.enerlution.ems.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
class DeviceMeterTouControllerTest {
 final JdbcTemplate db=mock(JdbcTemplate.class); final AccessControl access=mock(AccessControl.class);
 DeviceMeterTouController controller(){return new DeviceMeterTouController(new DomainSupport(db,access));}
 @Test void requiresTelemetryBeforeAnyRead(){doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(4,"telemetry.read");assertThrows(BusinessException.class,()->controller().read(4,8,"2026-10","positive",false));verifyNoInteractions(db);}
 @Test void invalidMonthOrDirectionCannotReachDatabase(){assertThrows(BusinessException.class,()->controller().read(4,8,"2026-99","positive",false));assertThrows(BusinessException.class,()->controller().read(4,8,"2026-10","forward",false));verifyNoInteractions(db);}
 @Test void exportRequiresSeparatePermission(){doThrow(new BusinessException(403,"denied")).when(access).requireStationPermission(4,"report.export");assertThrows(BusinessException.class,()->controller().read(4,8,"2026-10","positive",true));verifyNoInteractions(db);}
}
