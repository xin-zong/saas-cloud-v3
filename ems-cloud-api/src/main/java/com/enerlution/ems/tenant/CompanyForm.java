package com.enerlution.ems.tenant;

import jakarta.validation.constraints.*;
import java.util.List;

public record CompanyForm(
    @NotBlank @Size(max = 160) String name,
    @NotEmpty @Size(max = 4) List<@NotBlank String> companyTypes,
    @NotEmpty @Size(max = 4) List<@NotBlank String> businessScopes,
    @NotBlank @Size(max = 100) String country,
    @NotBlank @Size(max = 120) String province,
    @NotBlank @Size(max = 120) String city,
    @NotBlank @Size(max = 400) String address,
    @DecimalMin("-90") @DecimalMax("90") Double latitude,
    @DecimalMin("-180") @DecimalMax("180") Double longitude,
    @Pattern(regexp = "lt100|100to1000|1000to10000|gt10000") String systemScale,
    @NotBlank @Size(max = 100) String postcode,
    @Size(max = 2000) String serviceDescription,
    @Size(max = 120) String registrationNo,
    @Size(max = 120) String taxId,
    @NotBlank @Size(max = 120) String contactName,
    @NotBlank @Pattern(regexp = "\\+[0-9][0-9 -]{5,30}") String phone,
    @Size(max = 300) String website) {}
