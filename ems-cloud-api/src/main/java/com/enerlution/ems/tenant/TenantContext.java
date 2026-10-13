package com.enerlution.ems.tenant;
public record TenantContext(long actorId,long tenantId,String kind,boolean administrator) {}
