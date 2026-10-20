"""Reviewed pack detail capture import; preview by default, private evidence never embedded."""
import argparse,hashlib,importlib.util,json,re
from datetime import datetime,timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
HOST='ess-cloud-login.qudeox.com'
def parse(text,serial):
 marker='  - text: 电池包：'+serial+'\n'
 if text.count(marker)!=1:raise ValueError('Unique exact pack heading required')
 section=text.split(marker,1)[1]
 # The verified detail ends with this complete nameplate block. Never consume
 # parent/sibling cards after it, or borrow their terminal block if ours is absent.
 terminal=re.search(r'^  - generic: 铭牌定值\n  - generic: 设备类型\n  - generic: 电池包(?:\n|$)',section,re.M)
 if terminal is None:raise ValueError('Complete pack terminal block required')
 section=section[:terminal.end()]
 for line in section.splitlines():
  if line.startswith('- ') or line.startswith(' - '):raise ValueError('Pack detail container ended before terminal')
  if line.startswith('  - text: ') and line!='  - text: 实时数据历史图表报警信息连接信息':raise ValueError('Ambiguous detail heading before terminal')
 values=[]
 for line in section.splitlines():
  if line.startswith('  - generic: '):
   value=line[len('  - generic: '):]
   if value.startswith('"'):value=json.loads(value)
   values.append(value)
 def field(label):
  if values.count(label)!=1:raise ValueError('Base field missing or ambiguous')
  return values[values.index(label)+1]
 base=field('连接设备SN');count=field('电芯数量');sensor=field('父设备Sensor')
 if base!=serial or not re.fullmatch(r'[1-9][0-9]{0,3}',count) or not re.fullmatch(r'[0-9]{1,5}',sensor):raise ValueError('Invalid base identity')
 times=[v for v in values[:values.index('基础信息')] if re.fullmatch(r'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC[+-]\d\d:\d\d',v)]
 if len(times)!=1:raise ValueError('Unique detail timestamp required')
 stamp=datetime.strptime(times[0],'%Y-%m-%d %H:%M:%S UTC%z')
 energy=None
 if any(label in values for label in ('电池组','今日充电量','今日放电量')):
  if values.count('电池组')!=1:raise ValueError('Unique energy group required')
  start=values.index('电池组')
  if values[start+1:start+2]!=['今日充电量'] or values[start+3:start+4]!=['今日放电量'] or values[start+5:start+6]!=['单体温度']:raise ValueError('Invalid energy group structure')
  energy={}
  for label,key in (('今日充电量','chargeKwh'),('今日放电量','dischargeKwh')):
   raw=field(label)
   if raw in ('--','-'):energy[key]=None
   elif re.fullmatch(r'\d+(?:\.\d+)?kWh',raw):energy[key]=Decimal(raw[:-3])
   else:raise ValueError('Invalid energy value')
 cells=[];seen=set()
 for i,value in enumerate(values):
  m=re.fullmatch(r'单体(电压|温度)([1-9][0-9]{0,4})',value)
  if not m:continue
  kind,index=m[1],int(m[2]);unit='V' if kind=='电压' else '℃';raw=values[i+1]
  if (kind,index) in seen or index>int(count):raise ValueError('Invalid or duplicate cell index')
  seen.add((kind,index))
  if raw in ('--','-'):number=None;quality='missing'
  else:
   if not re.fullmatch(r'[-+]?\d+(?:\.\d+)?'+re.escape(unit),raw):raise ValueError('Invalid cell numeric value')
   number=Decimal(raw[:-len(unit)]);quality='observed'
  cells.append(dict(name=f'电池包 {serial} · {kind} #{index}',index=index,unit=unit,value=number,raw=raw,quality=quality))
 if not cells:raise ValueError('No captured cells')
 return dict(baseSN=base,cellCount=int(count),parentSensor=sensor,sourceTime=stamp,cells=cells,energyGroup=energy)

def run(args):
 payload=Path(args.input).read_bytes();data=parse(payload.decode('utf-8-sig'),args.pack_serial);digest=hashlib.sha256(payload).hexdigest()
 captured=datetime.fromisoformat(args.captured_at.replace('Z','+00:00'));url=urlsplit(args.source_url)
 if captured.utcoffset() is None or not data['sourceTime']<=captured<=datetime.now(timezone.utc):raise ValueError('Invalid capture time')
 if url.scheme!='https' or url.netloc!=HOST or url.path!='/monitor/plant/plantDetail/'+args.station_source_id+'/device' or url.fragment:raise ValueError('Invalid source URL')
 spec=importlib.util.spec_from_file_location('guard',ROOT/'scripts/migrate-toyingzhen.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
 if guard.current_branch(ROOT)!=guard.BRANCH:raise ValueError('Branch guard failed')
 config=guard.settings(ROOT/'ems-cloud-api/.env')
 import psycopg
 with psycopg.connect(host='127.0.0.1',port=15435,dbname=guard.TARGET,user=guard.ROLE,password=config['EMS_DB_PASSWORD'],connect_timeout=10) as conn:
  with conn.cursor() as cur:
   if not args.apply:cur.execute('SET TRANSACTION READ ONLY')
   cur.execute('SELECT current_database(),current_user')
   if cur.fetchone()!=(guard.TARGET,guard.ROLE):raise ValueError('Database guard failed')
   if args.apply:cur.execute('SELECT pg_advisory_xact_lock(78291060)')
   cur.execute('''SELECT n.id,d.id FROM station_reference_connection_node n
    JOIN station st ON st.id=n.station_id AND st.archived_at IS NULL
    JOIN station_reference_import si ON si.station_id=n.station_id AND si.source_id=n.source_station_id
    JOIN station_reference_connection_node parent ON parent.station_id=n.station_id AND parent.serial_number=n.parent_serial_number AND parent.source_type='电池簇'
    JOIN device d ON d.station_id=n.station_id AND d.serial_number=n.parent_serial_number AND d.archived_at IS NULL
    JOIN device_reference_import di ON di.device_id=d.id AND di.station_source_id=si.source_id AND di.source_host=si.source_host
    WHERE n.station_id=%s AND n.source_station_id=%s AND n.serial_number=%s AND n.parent_serial_number=%s AND n.source_type='电池包' AND si.source_host=%s''',(args.station,args.station_source_id,args.pack_serial,args.parent_serial,HOST))
   mappings=cur.fetchall()
   if len(mappings)!=1:raise ValueError('Unique saved connection and inventory provenance required')
   node,parent=mappings[0]
   cur.execute('''WITH RECURSIVE ancestry AS (
    SELECT n.*,ARRAY[n.id] AS path,false AS cycle FROM station_reference_connection_node n WHERE id=%s
    UNION ALL SELECT p.*,a.path||p.id,p.id=ANY(a.path) FROM ancestry a JOIN station_reference_connection_node p ON p.station_id=a.station_id AND p.serial_number=a.parent_serial_number WHERE NOT a.cycle)
    SELECT count(*) FROM ancestry a WHERE a.cycle OR EXISTS(SELECT 1 FROM device d WHERE d.serial_number=a.serial_number AND (d.archived_at IS NOT NULL OR d.station_id<>a.station_id))''',(node,))
   if cur.fetchone()[0]:raise ValueError('Unavailable ancestry')
   records=[]
   for cell in data['cells']:
    cur.execute('''SELECT p.id FROM reference_device_point p JOIN stored_device_point_binding b ON b.reference_point_id=p.id AND b.station_id=%s JOIN measurement_point mp ON mp.id=b.measurement_point_id AND mp.device_id=p.device_id
     WHERE p.device_id=%s AND p.name=%s AND p.unit=%s AND p.source_host=%s''',(args.station,parent,cell['name'],cell['unit'],HOST))
    ids=cur.fetchall()
    if len(ids)!=1:raise ValueError('Exact verified pack point required; no inferred ownership')
    records.append((ids[0][0],data['sourceTime'],captured,cell['value'],cell['raw'],cell['quality'],args.source_url,digest))
   cur.execute('SELECT EXISTS(SELECT 1 FROM schema_migration WHERE version=62)');ready=cur.fetchone()[0]
   if args.apply and not ready:raise ValueError('Reviewed V62 required')
   if ready:
    cur.execute('SELECT parent_device_id,parent_serial_number,source_at,captured_at FROM reference_battery_pack_capture WHERE connection_node_id=%s',(node,));old=cur.fetchone()
    if old and (old[0]!=parent or old[1]!=args.parent_serial or old[2]>data['sourceTime'] or old[3]>captured):raise ValueError('Conflicting identity or older capture')
   if args.apply:
    cur.execute('''INSERT INTO reference_battery_pack_capture(connection_node_id,parent_device_id,parent_serial_number,base_sn,cell_count,parent_sensor,source_at,captured_at,source_url,evidence_sha256,energy_group_present,charge_kwh,discharge_kwh)
     VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(connection_node_id) DO UPDATE SET base_sn=excluded.base_sn,cell_count=excluded.cell_count,parent_sensor=excluded.parent_sensor,source_at=excluded.source_at,captured_at=excluded.captured_at,source_url=excluded.source_url,evidence_sha256=excluded.evidence_sha256,energy_group_present=excluded.energy_group_present,charge_kwh=excluded.charge_kwh,discharge_kwh=excluded.discharge_kwh''',(node,parent,args.parent_serial,data['baseSN'],data['cellCount'],data['parentSensor'],data['sourceTime'],captured,args.source_url,digest,data['energyGroup'] is not None,(data['energyGroup'] or {}).get('chargeKwh'),(data['energyGroup'] or {}).get('dischargeKwh')))
    cur.executemany('''INSERT INTO reference_device_sample(point_id,source_at,captured_at,value,raw_value,quality,source_url,evidence_sha256) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',records)
   return dict(mode='apply' if args.apply else 'preview',connectionNodeId=node,parentDeviceId=parent,cellCount=data['cellCount'],points=len(records),voltagePoints=sum(c['unit']=='V' for c in data['cells']),temperaturePoints=sum(c['unit']=='℃' for c in data['cells']),sourceTime=data['sourceTime'].isoformat(),migrationReady=ready,evidenceSha256=digest)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__)
 for name in ('input','station-source-id','pack-serial','parent-serial','source-url','captured-at'):p.add_argument('--'+name,required=True)
 p.add_argument('--station',required=True,type=int);p.add_argument('--apply',action='store_true');args=p.parse_args()
 try:print(json.dumps(run(args)))
 except Exception:raise SystemExit('Pack import refused; private source and connection details withheld.') from None
