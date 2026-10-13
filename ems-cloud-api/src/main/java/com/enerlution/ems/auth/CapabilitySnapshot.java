package com.enerlution.ems.auth;
import com.enerlution.ems.tenant.TenantContext;
import java.util.*;
public record CapabilitySnapshot(TenantContext tenant,List<MenuNode> menus,Set<String> permissions,Map<Long,Set<String>> stationPermissions) {}
