"""Import a reviewed cell-history XLSX into existing reference points. Preview by default."""
import argparse,hashlib,importlib.util,json,re,subprocess
from datetime import datetime,timezone,timedelta
from pathlib import Path
import openpyxl,psycopg
ROOT=Path(__file__).resolve().parents[2]
HOST='ess-cloud-login.qudeox.com'
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
samples=load('samples',Path(__file__).with_name('import-reference-device-samples.py'))

def parse_rows(rows,pack,parent,station,day,offset):
 if not re.fullmatch(r'[+-](?:0\d|1[0-4]):[0-5]\d',offset):raise ValueError('Explicit verified UTC offset required')
 hours,minutes=map(int,offset[1:].split(':'))
 if hours==14 and minutes:raise ValueError('Invalid UTC offset')
 tz=timezone((1 if offset[0]=='+' else -1)*timedelta(hours=hours,minutes=minutes))
 if not rows or tuple(rows[0][:5])!=('设备类型','SN','所属父设备','所属子场站','时间'):raise ValueError('Unexpected history headers')
 columns=[]
 for label in rows[0][5:]:
  match=re.fullmatch(r'单体(电压|温度)([1-9][0-9]*)[（(](V|℃)[）)]',str(label))
  if not match or (match[1],match[3]) not in [('电压','V'),('温度','℃')]:raise ValueError('Unreviewed cell header')
  columns.append((f'电池包 {pack} · {match[1]} #{match[2]}',match[3]))
 if not columns or len(set(columns))!=len(columns):raise ValueError('Missing or duplicate cell headers')
 result=[];seen=set()
 for row in rows[1:]:
  if len(row)!=len(rows[0]) or tuple(row[:4])!=('电池',pack,parent,station):raise ValueError('Export identity mismatch')
  stamp=datetime.strptime(str(row[4]),'%Y/%m/%d %H:%M:%S').replace(tzinfo=tz)
  if stamp.date().isoformat()!=day:raise ValueError('Export day mismatch')
  for (name,unit),raw in zip(columns,row[5:]):
   key=(name,unit,stamp)
   if key in seen:raise ValueError('Duplicate point/time in workbook')
   seen.add(key)
   raw='' if raw is None else str(raw)
   value,quality=samples.parse_value(raw,unit)
   if quality=='text':raise ValueError('Non-numeric cell history')
   result.append((name,unit,stamp,value,raw,quality))
 if not result:raise ValueError('Empty history export')
 return result

def main():
 p=argparse.ArgumentParser(description=__doc__)
 for key in ['input','station-source-id','device-serial','pack-serial','parent-serial','station-name','source-date','source-offset','source-url','captured-at']:p.add_argument('--'+key,required=True)
 p.add_argument('--env-file',default=str(ROOT/'ems-cloud-api/.env'));p.add_argument('--apply',action='store_true');a=p.parse_args()
 if subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()!='develop-toyingzhen':raise ValueError('Branch guard failed')
 if a.source_url!='https://'+HOST+'/monitor/device/list' and not re.fullmatch(r'https://'+re.escape(HOST)+r'/monitor/plant/plantDetail/'+re.escape(a.station_source_id)+r'/device\?type=[0-9_]+&childSystemId='+re.escape(a.station_source_id),a.source_url):raise ValueError('Source URL guard failed')
 path=Path(a.input);digest=hashlib.sha256(path.read_bytes()).hexdigest()
 workbook=openpyxl.load_workbook(path,read_only=True,data_only=False)
 try:
  if workbook.sheetnames!=[a.source_date]:raise ValueError('Unexpected worksheets')
  sheet=workbook.active;sheet.reset_dimensions() # exporter incorrectly declares A1
  rows=parse_rows(list(sheet.values),a.pack_serial,a.parent_serial,a.station_name,a.source_date,a.source_offset)
 finally:workbook.close()
 captured=datetime.fromisoformat(a.captured_at.replace('Z','+00:00'))
 if captured.utcoffset() is None or any(r[2]>captured for r in rows):raise ValueError('Invalid capture timestamp')
 guard=load('guard',ROOT/'scripts/migrate-toyingzhen.py');config=guard.settings(Path(a.env_file))
 with psycopg.connect(host='127.0.0.1',port=15435,dbname='ems_cloud_saas_toyingzhen',user='ems_toyingzhen_owner',password=config['EMS_DB_PASSWORD'],connect_timeout=10) as conn:
  with conn.cursor() as cur:
   if not a.apply:cur.execute('SET TRANSACTION READ ONLY')
   cur.execute('SELECT current_database(),current_user')
   if cur.fetchone()!=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner'):raise ValueError('Live identity guard failed')
   cur.execute('SELECT d.id FROM device d JOIN device_reference_import i ON i.device_id=d.id JOIN station_reference_import s ON s.station_id=d.station_id AND s.source_host=i.source_host AND s.source_id=i.station_source_id WHERE d.serial_number=%s AND i.source_host=%s AND i.station_source_id=%s',(a.device_serial,HOST,a.station_source_id))
   devices=cur.fetchall()
   if len(devices)!=1:raise ValueError('Expected unique imported device in source station')
   device=devices[0][0];point_ids={}
   for name,unit in dict.fromkeys((r[0],r[1]) for r in rows):
    cur.execute('SELECT id FROM reference_device_point WHERE device_id=%s AND name=%s AND unit=%s AND source_host=%s',(device,name,unit,HOST));found=cur.fetchall()
    if len(found)!=1:raise ValueError('Cell point not previously verified for device; refuse inferred package ownership')
    point_ids[name,unit]=found[0][0]
   records=[(point_ids[n,u],stamp,captured,value,raw,quality,a.source_url,digest) for n,u,stamp,value,raw,quality in rows]
   if a.apply:
    samples.ensure_stored_bindings(cur,point_ids.values())
    cur.executemany('INSERT INTO reference_device_sample(point_id,source_at,captured_at,value,raw_value,quality,source_url,evidence_sha256) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',records)
 print(json.dumps({'apply':a.apply,'observations':len(rows),'points':len(point_ids),'firstUtc':min(r[2] for r in rows).astimezone(timezone.utc).isoformat(),'lastUtc':max(r[2] for r in rows).astimezone(timezone.utc).isoformat(),'evidenceSha256':digest}))
if __name__=='__main__':main()
