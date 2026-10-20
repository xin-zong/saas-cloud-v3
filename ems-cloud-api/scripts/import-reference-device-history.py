"""Import a reviewed device-history XLSX into existing reference points. Preview by default."""
import argparse,hashlib,importlib.util,json,re,subprocess
from datetime import date,datetime,timezone,timedelta
from pathlib import Path
import openpyxl,psycopg
ROOT=Path(__file__).resolve().parents[2]
HOST='ess-cloud-login.qudeox.com'
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
samples=load('samples',Path(__file__).with_name('import-reference-device-samples.py'))

def source_range(day,end_day=None):
 end_day=day if end_day is None else end_day
 if any(not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',value) for value in (day,end_day)):
  raise ValueError('Source dates must be YYYY-MM-DD')
 start,end=date.fromisoformat(day),date.fromisoformat(end_day)
 if not 0<=(end-start).days<=4:raise ValueError('Source range must contain 1 to 5 inclusive days')
 return start,end


def parse_rows(rows,serial,parent,station,day,offset,device_type,end_day=None):
 start,end=source_range(day,end_day)
 if not re.fullmatch(r'[+-](?:0\d|1[0-4]):[0-5]\d',offset):raise ValueError('Explicit verified UTC offset required')
 hours,minutes=map(int,offset[1:].split(':'))
 if hours==14 and minutes:raise ValueError('Invalid UTC offset')
 tz=timezone((1 if offset[0]=='+' else -1)*timedelta(hours=hours,minutes=minutes))
 if not rows or tuple(rows[0][:5])!=('设备类型','SN','所属父设备','所属子场站','时间'):raise ValueError('Unexpected history headers')
 columns=[]
 for label in rows[0][5:]:
  if not isinstance(label,str) or not label:raise ValueError('Invalid column label')
  match=re.fullmatch(r'(.*?)[（(]([^()（）]+)[）)]',label)
  columns.append((match[1],match[2]) if match else (label,''))
 if not columns or len(set(columns))!=len(columns):raise ValueError('Missing or duplicate headers')
 result=[];seen=set()
 for row in rows[1:]:
  if len(row)!=len(rows[0]) or tuple(row[:4])!=(device_type,serial,parent,station):raise ValueError('Export identity mismatch')
  stamp=datetime.strptime(str(row[4]),'%Y/%m/%d %H:%M:%S').replace(tzinfo=tz)
  if not start<=stamp.date()<=end:raise ValueError('Export date outside source range')
  for (name,unit),raw in zip(columns,row[5:]):
   key=(name,unit,stamp)
   if key in seen:raise ValueError('Duplicate point/time in workbook')
   seen.add(key)
   raw='' if raw is None else str(raw)
   if raw.startswith('='):raise ValueError('Formula in history export')
   result.append((name,unit,stamp,raw))
 if not result:raise ValueError('Empty history export')
 return result


def read_history(path,serial,parent,station,day,offset,device_type,captured_at,end_day=None):
 start,end=source_range(day,end_day)
 expected_sheet=start.isoformat() if start==end else start.isoformat()+'~'+end.isoformat()
 captured=datetime.fromisoformat(captured_at.replace('Z','+00:00'))
 if captured.utcoffset() is None or captured>datetime.now(timezone.utc):raise ValueError('Invalid capture timestamp')
 workbook=openpyxl.load_workbook(path,read_only=True,data_only=False)
 try:
  if workbook.sheetnames!=[expected_sheet]:raise ValueError('Unexpected worksheets')
  sheet=workbook.active;sheet.reset_dimensions() # exporter incorrectly declares A1
  rows=parse_rows(list(sheet.values),serial,parent,station,day,offset,device_type,end_day)
 finally:workbook.close()
 if any(r[2]>captured for r in rows):raise ValueError('Invalid capture timestamp')
 return rows,captured


# Explicit reviewed export labels; detail prefix is created by read_detail(), not a source label.
ALIASES={('电池容量SOC','%'):('SOC','%'),('电池健康度SOH','%'):('SOH','%'),
 ('单体最大电压','V'):('单体最高电压','V'),('单体最小电压','V'):('单体最低电压','V'),
 ('单体电压均值','V'):('详情 · 单体电压平均值','V'),('单体温度均值','℃'):('详情 · 单体温度平均值','℃'),
 ('当前功率','W'):('详情 · 当前功率','kW'),('最大充电功率','W'):('详情 · 最大充电功率','kW'),
 ('最大放电功率','W'):('详情 · 最大放电功率','kW'),('绝缘阻抗','Ω'):('详情 · 绝缘阻抗','MΩ')}

def candidates(name,unit):
 return [(name,unit),ALIASES.get((name,unit),(name,unit)),('详情 · '+name,unit)]

IDENTITY_HEADERS={'设备类型','SN','所属父设备','所属子场站','时间'}

def registerable(name,unit):
 # Unitless codes/status/counts remain literal observations with no assigned purpose.
 return bool(name) and name not in IDENTITY_HEADERS and len(name)<=120 and len(unit)<=30

def select_records(rows,point_ids,mapping=None):
 records=[]
 for name,unit,stamp,raw in rows:
  if (name,unit) not in point_ids:continue
  target_unit=mapping[name,unit][1] if mapping else unit
  typed_raw=raw+(unit if unit!=target_unit and raw not in ('','--','—','-','暂无数据') else '')
  value,quality=samples.parse_value(typed_raw,target_unit)
  records.append((name,unit,stamp,value,raw,quality))
 return records


def main():
 p=argparse.ArgumentParser(description=__doc__)
 for key in ['input','station-source-id','device-serial','device-type','parent-serial','station-name','source-date','source-offset','source-url','captured-at']:p.add_argument('--'+key,required=True)
 p.add_argument('--source-end-date',help='Inclusive YYYY-MM-DD end date; defaults to --source-date; maximum 5 days')
 p.add_argument('--register-export-points',action='store_true',help='Register exact validated export columns with NULL semantics; identity-header collisions remain pending')
 p.add_argument('--env-file',default=str(ROOT/'ems-cloud-api/.env'));p.add_argument('--apply',action='store_true');a=p.parse_args()
 if subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()!='develop-toyingzhen':raise ValueError('Branch guard failed')
 if a.source_url!='https://'+HOST+'/monitor/device/list' and not re.fullmatch(r'https://'+re.escape(HOST)+r'/monitor/plant/plantDetail/'+re.escape(a.station_source_id)+r'/device(?:\?type=[0-9_]+&childSystemId='+re.escape(a.station_source_id)+r')?',a.source_url):raise ValueError('Source URL guard failed')
 path=Path(a.input);digest=hashlib.sha256(path.read_bytes()).hexdigest()
 rows,captured=read_history(path,a.device_serial,a.parent_serial,a.station_name,a.source_date,a.source_offset,a.device_type,a.captured_at,a.source_end_date)
 guard=load('guard',ROOT/'scripts/migrate-toyingzhen.py');config=guard.settings(Path(a.env_file))
 with psycopg.connect(host='127.0.0.1',port=15435,dbname='ems_cloud_saas_toyingzhen',user='ems_toyingzhen_owner',password=config['EMS_DB_PASSWORD'],connect_timeout=10) as conn:
  with conn.cursor() as cur:
   if not a.apply:cur.execute('SET TRANSACTION READ ONLY')
   cur.execute('SELECT current_database(),current_user')
   if cur.fetchone()!=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner'):raise ValueError('Live identity guard failed')
   cur.execute('SELECT d.id FROM device d JOIN device_reference_import i ON i.device_id=d.id JOIN station_reference_import s ON s.station_id=d.station_id AND s.source_host=i.source_host AND s.source_id=i.station_source_id WHERE d.serial_number=%s AND i.source_host=%s AND i.station_source_id=%s',(a.device_serial,HOST,a.station_source_id))
   devices=cur.fetchall()
   if len(devices)!=1:raise ValueError('Expected unique imported device in source station')
   device=devices[0][0];point_ids={};mapping={};mapped=[];registered=[]
   for name,unit in dict.fromkeys((r[0],r[1]) for r in rows):
    for target_name,target_unit in dict.fromkeys(candidates(name,unit)):
     cur.execute('SELECT id FROM reference_device_point WHERE device_id=%s AND name=%s AND unit=%s AND source_host=%s',(device,target_name,target_unit,HOST));found=cur.fetchall()
     if len(found)>1:raise ValueError('Ambiguous point identity')
     if found:
      point_ids[name,unit]=found[0][0];mapping[name,unit]=(target_name,target_unit)
      mapped.append({'sourceName':name,'sourceUnit':unit,'targetName':target_name,'targetUnit':target_unit})
      break
   if a.register_export_points:
    for name,unit in dict.fromkeys((r[0],r[1]) for r in rows):
     if (name,unit) in point_ids or not registerable(name,unit):continue
     if a.apply:
      cur.execute('INSERT INTO reference_device_point(device_id,name,unit,source_host) VALUES(%s,%s,%s,%s) ON CONFLICT(device_id,name,unit) DO NOTHING',(device,name,unit,HOST))
      cur.execute('SELECT id,source_host FROM reference_device_point WHERE device_id=%s AND name=%s AND unit=%s',(device,name,unit))
      found=cur.fetchall()
      if len(found)!=1 or found[0][1]!=HOST:raise ValueError('Registered point source collision')
      point_ids[name,unit]=found[0][0]
     else:point_ids[name,unit]=-len(point_ids)-1
     mapping[name,unit]=(name,unit)
     registered.append({'sourceName':name,'sourceUnit':unit,'targetName':name,'targetUnit':unit})
     mapped.append(registered[-1])
   if len(set(point_ids.values()))!=len(point_ids):raise ValueError('Multiple columns mapped to one point')
   pending=[{'name':n,'unit':u} for n,u in dict.fromkeys((r[0],r[1]) for r in rows) if (n,u) not in point_ids]
   rows=select_records(rows,point_ids,mapping)
   if not rows:raise ValueError('No preverified exact point identities')
   records=[(point_ids[n,u],stamp,captured,value,raw,quality,a.source_url,digest) for n,u,stamp,value,raw,quality in rows]
   if a.apply:
    samples.ensure_stored_bindings(cur,point_ids.values())
    cur.executemany('INSERT INTO reference_device_sample(point_id,source_at,captured_at,value,raw_value,quality,source_url,evidence_sha256) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',records)
 print(json.dumps({'apply':a.apply,'pendingColumns':pending,'mappedColumns':mapped,'registeredColumns':registered,'observations':len(rows),'points':len(point_ids),'firstUtc':min(r[2] for r in rows).astimezone(timezone.utc).isoformat(),'lastUtc':max(r[2] for r in rows).astimezone(timezone.utc).isoformat(),'evidenceSha256':digest}))
if __name__=='__main__':main()
