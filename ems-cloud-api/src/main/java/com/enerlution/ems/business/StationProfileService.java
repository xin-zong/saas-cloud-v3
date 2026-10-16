package com.enerlution.ems.business;

import java.util.Map;
import java.util.LinkedHashMap;
import org.springframework.stereotype.Service;

@Service
public class StationProfileService {
  private final DomainSupport s;
  public StationProfileService(DomainSupport s) { this.s = s; }
  public Map<String, Object> read(long station) {
    s.access.requireStationPermission(station, "asset.read");
    var rows = s.db.queryForList("SELECT timezone,solar_capacity_kw,grid_connection_date,commissioned_on,country,province,city,postcode FROM station_profile WHERE station_id=?", station);
    if (rows.isEmpty()) return null;
    var row = rows.getFirst();
    var result = new LinkedHashMap<String, Object>();
    result.put("timezone", row.get("timezone"));
    result.put("solarCapacityKw", row.get("solar_capacity_kw"));
    result.put("gridConnectionDate", date(row.get("grid_connection_date")));
    result.put("commissionedOn", date(row.get("commissioned_on")));
    for (String key : new String[] {"country", "province", "city", "postcode"}) result.put(key, row.get(key));
    return result;
  }
  private static String date(Object value) { return value == null ? null : value.toString(); }
}
