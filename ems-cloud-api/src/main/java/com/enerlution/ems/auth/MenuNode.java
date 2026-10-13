package com.enerlution.ems.auth;
import java.util.List;
public record MenuNode(long id,String client,String kind,String nameKey,String path,String permissionCode,List<MenuNode> children) {}
