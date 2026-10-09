"""Generate a repeatable, explicit Shanghai simulation seed from the supplied topology export."""
import json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
source=json.loads((pathlib.Path(__file__).parent/'shanghai-source.json').read_text(encoding='utf-8-sig'))
nodes=source['nodes'];edges=source['edges'];links=source['commLinks']
assert len(nodes)==11 and len(edges)==9 and len(links)==8
ids={n['id'] for n in nodes}
assert len(ids)==len(nodes) and all(e['from'] in ids and e['to'] in ids for e in edges)
assert sum(float(n.get('rating',0)) for n in nodes if n['type']=='pcs')==250
assert sum(float(n.get('rating',0)) for n in nodes if n['type']=='battery')==522
types={'grid':('电网','OTHER'),'meter':('电表','MTR'),'transformer':('变压器','OTHER'),'bus':('交流母线','OTHER'),'pv':('光伏','PV'),'pcs':('PCS','PCS'),'load':('负载','OTHER'),'battery':('电池 / BMS','BMS'),'ems':('EMS','OTHER')}
def q(v):return 'NULL' if v is None else "'"+str(v).replace("'","''")+"'"
def device(code):return f"(SELECT id FROM device WHERE station_id=(SELECT id FROM station WHERE code='SIM-SH-001') AND code={q(code)})"
sql=["BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s';",
"DO $$ BEGIN IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;",
"SELECT pg_advisory_xact_lock(hashtextextended('SIM-SH-001',0));",
"INSERT INTO station(code,name,organization_id,rated_power_kw,capacity_kwh,asset_type,region,address,longitude,latitude) SELECT 'SIM-SH-001','上海站',organization_id,250,522,'Hybrid','上海','上海市（模拟站点，非现场地址）',121.4737,31.2304 FROM station WHERE code='PROTO-001' ON CONFLICT(code) DO NOTHING;",
"INSERT INTO station_design SELECT id,'光储协同','并网运行','全站监测 · 储能可控' FROM station WHERE code='SIM-SH-001' ON CONFLICT DO NOTHING;"]
for n in nodes:
 typ,category=types[n['type']];model=f"模拟 {typ} {n.get('rating','')} {n.get('unit','')}".strip()
 sql.append(f"INSERT INTO device_model(manufacturer,name,category) VALUES('模拟设备（非实物）',{q(model)},{q(category)}) ON CONFLICT(manufacturer,name) DO NOTHING;")
 sql.append(f"INSERT INTO device(station_id,model_id,code,name) SELECT s.id,m.id,{q(n['id'])},{q('[模拟] '+n['name'])} FROM station s JOIN device_model m ON m.manufacturer='模拟设备（非实物）' AND m.name={q(model)} WHERE s.code='SIM-SH-001' ON CONFLICT(station_id,code) DO NOTHING;")
 sql.append(f"INSERT INTO station_design_node(device_id,node_type,x,y,rating,rating_unit,voltage,metering_role) VALUES({device(n['id'])},{q(typ)},{n['x']},{n['y']},{q(n.get('rating'))},{q(n.get('unit'))},{q(n.get('voltage'))},{q('并网计量' if n['type']=='meter' else None)}) ON CONFLICT DO NOTHING;")
 for p in n.get('commPorts',[]):
  proto={'tcp':'Modbus TCP','rtu':'Modbus RTU','can':'CAN'}[p['protocol']]
  interface=p['actual'].replace('RS485-','COM-').replace('ETH-','LAN-')
  host=p.get('host') or None
  if n['type']=='ems' and p['protocol']=='tcp':host=next(c['ip'] for c in n['channels'] if c['id']==p['actual'])
  if p['protocol']!='tcp':host=None
  sql.append(f"INSERT INTO station_design_port VALUES({device(n['id'])},{q(p['id'])},{q(interface)},{q(proto)},{q(p['role'])},{q(host)},{q(p.get('tcpPort') if p['protocol']=='tcp' else None)},{q(p.get('address'))},{q(p.get('baud') if p['protocol']=='rtu' else None)},{q(p.get('parity') if p['protocol']=='rtu' else None)},{q(p.get('bitrate') if p['protocol']=='can' else None)}) ON CONFLICT DO NOTHING;")
sql.append(f"UPDATE station_design_node SET grid_device_id={device('GRID-01')} WHERE device_id={device('M-01')} AND grid_device_id IS NULL;")
for e in edges:
 sql.append(f"INSERT INTO topology_connection VALUES({device(e['from'])},{device(e['to'])}) ON CONFLICT DO NOTHING;")
 sql.append(f"INSERT INTO station_design_electrical VALUES({device(e['from'])},{device(e['to'])},{q(e['fromPort'])},{q(e['toPort'])},{q(e['kind'].upper())}) ON CONFLICT DO NOTHING;")
for l in links:
 sql.append(f"INSERT INTO station_design_communication VALUES({device(l['a']['node'])},{q(l['a']['port'])},{device(l['b']['node'])},{q(l['b']['port'])}) ON CONFLICT DO NOTHING;")
# Extend only the existing two test-station role assignments in this test organization.
sql.append("INSERT INTO member_grant_station(grant_id,station_id) SELECT DISTINCT g.id,s.id FROM member_grant g JOIN member_grant_station old ON old.grant_id=g.id JOIN station h ON h.id=old.station_id AND h.code='PROTO-001' JOIN app_role r ON r.id=g.role_id JOIN station s ON s.code='SIM-SH-001' AND s.organization_id=r.organization_id WHERE g.valid_until IS NULL ON CONFLICT DO NOTHING;")
sql.append("INSERT INTO audit_event(action,detail) SELECT 'simulation.station.create','SIM-SH-001: supplied topology export; no physical hardware connected' WHERE NOT EXISTS(SELECT 1 FROM audit_event WHERE action='simulation.station.create' AND detail LIKE 'SIM-SH-001:%');")
sql.append("COMMIT;")
out=pathlib.Path(__file__).parent/'shanghai-seed.sql';out.write_text('\n'.join(sql)+'\n',encoding='utf-8')
print(json.dumps({'nodes':len(nodes),'electricalEdges':len(edges),'communicationLinks':len(links),'ratedPowerKw':250,'capacityKwh':522,'output':str(out)}))
