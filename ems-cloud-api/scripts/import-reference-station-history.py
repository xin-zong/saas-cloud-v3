"""Preview/import private verified station history JSON. Never contacts the reference host.
Envelope: identityVerified=true, timezoneVerified=true, stationId (local integer),
sourceId, period, date, timezone (verified IANA name), capturedAt (offset ISO),
sourceUrl (exact source endpoint), payload (unmodified response data object).
No unit conversion, interpolation, or device-to-station substitution is performed.
"""
import argparse,hashlib,importlib.util,json,re,subprocess
from datetime import date,datetime,timezone,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
ROOT=Path(__file__).resolve().parents[2]
HOST='ess-cloud-login.qudeox.com'
SHAPES={'day':('stationStatisticPowerList','stationStatisticDay'),'month':('stationStatisticDayDtoList','stationStatisticMonthDto'),'year':('stationStatisticMonthDtoList','stationStatisticYearDto'),'total':('stationStatisticYearDtoList','stationStatisticTotalDto')}
SHAPES['week']=('stationStatisticDayDtoList','stationStatisticWeekDto')
def bounds(period,key):
 try:
  patterns={'day':r'\d{4}-\d{2}-\d{2}','month':r'\d{4}-\d{2}','year':r'\d{4}','total':r'\d{4}:\d{4}'}
  patterns['week']=patterns['day']
  if period not in patterns or not isinstance(key,str) or not re.fullmatch(patterns[period],key):raise ValueError('Invalid period/date')
  if period in ('day','week'):end=date.fromisoformat(key)+timedelta(days=1);start=end-timedelta(days=7 if period=='week' else 1)
  elif period=='month':
   start=date.fromisoformat(key+'-01');end=date(start.year+(start.month==12),1 if start.month==12 else start.month+1,1)
  elif period=='year':start=date(int(key),1,1);end=date(int(key)+1,1,1)
  else:
   a,b=map(int,key.split(':'));start=date(a,1,1);end=date(b+1,1,1)
   if not 0<=b-a<=30:raise ValueError('Total range must contain 1 to 31 years')
  if start.year<1970:raise ValueError('Unsupported date')
  return start,end
 except (TypeError,OverflowError) as ex:raise ValueError('Invalid period/date') from ex

def unique_object(pairs):
 result={}
 for key,value in pairs:
  if key in result:raise ValueError('Duplicate JSON key')
  result[key]=value
 return result

def validate(raw):
 if len(raw)>20_000_000:raise ValueError('Capture exceeds 20 MB')
 data=json.loads(raw,object_pairs_hook=unique_object,parse_constant=lambda x:(_ for _ in ()).throw(ValueError('Non-finite JSON')))
 if not isinstance(data,dict) or data.get('identityVerified') is not True or data.get('timezoneVerified') is not True:raise ValueError('Explicit reviewed identity/timezone required')
 if type(data.get('stationId')) is not int or data['stationId']<=0 or not isinstance(data.get('sourceId'),str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}',data['sourceId']):raise ValueError('Invalid station identity')
 period,key=data.get('period'),data.get('date');start,end=bounds(period,key)
 try:zone=ZoneInfo(data['timezone']);captured=datetime.fromisoformat(data['capturedAt'].replace('Z','+00:00'))
 except (KeyError,TypeError,ZoneInfoNotFoundError) as ex:raise ValueError('Invalid timezone/capture timestamp') from ex
 if captured.utcoffset() is None or captured>datetime.now(timezone.utc) or start>captured.astimezone(zone).date() or end.year-1>captured.astimezone(zone).year:raise ValueError('Future capture/range')
 expected=f'https://{HOST}/station-s/station/statistic/history/{period}/{data["sourceId"]}'
 if data.get('sourceUrl')!=expected:raise ValueError('Source URL mismatch')
 payload=data.get('payload');list_key,summary_key=SHAPES[period]
 if not isinstance(payload,dict) or not isinstance(payload.get(list_key),list) or not isinstance(payload.get(summary_key),dict):raise ValueError('Unexpected response data shape')
 if period=='total' and 'stationTotalActual' not in payload:raise ValueError('Missing total actual response')
 rows=payload[list_key]
 if len(rows)>100000:raise ValueError('Too many history rows')
 seen=set()
 for row in rows:
  if not isinstance(row,dict):raise ValueError('History row must be object')
  if period=='day':
   stamp=row.get('dateTime')
   if type(stamp) not in (int,float):raise ValueError('Expected epoch seconds')
   try:instant=datetime.fromtimestamp(stamp,timezone.utc)
   except (OverflowError,OSError) as ex:raise ValueError('Invalid epoch seconds') from ex
   if not start<=instant.astimezone(zone).date()<end or instant>captured or stamp in seen:raise ValueError('Out-of-range, future, or duplicate point')
   seen.add(stamp)
 return data,hashlib.sha256(raw).hexdigest()

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True);p.add_argument('--apply',action='store_true');p.add_argument('--env-file',default=str(ROOT/'ems-cloud-api/.env'));a=p.parse_args()
 data,digest=validate(Path(a.input).read_bytes())
 if subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()!='develop-toyingzhen':raise ValueError('Branch guard failed')
 print(json.dumps({'mode':'apply' if a.apply else 'preview','stationId':data['stationId'],'period':data['period'],'date':data['date'],'evidenceSha256':digest}))
 if not a.apply:return
 import psycopg
 spec=importlib.util.spec_from_file_location('guard',ROOT/'scripts/migrate-toyingzhen.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard);config=guard.settings(Path(a.env_file))
 with psycopg.connect(host='127.0.0.1',port=15435,dbname='ems_cloud_saas_toyingzhen',user='ems_toyingzhen_owner',password=config['EMS_DB_PASSWORD'],connect_timeout=10) as conn:
  with conn.cursor() as cur:
   cur.execute('SELECT current_database(),current_user')
   if cur.fetchone()!=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner'):raise ValueError('Database guard failed')
   cur.execute('SELECT s.id FROM station s JOIN station_reference_import i ON i.station_id=s.id WHERE s.id=%s AND s.archived_at IS NULL AND i.source_host=%s AND i.source_id=%s',(data['stationId'],HOST,data['sourceId']))
   if cur.fetchall()!=[(data['stationId'],)]:raise ValueError('Station source mapping mismatch')
   cur.execute('INSERT INTO station_reference_history_capture(station_id,source_host,source_id,period,period_key,timezone,captured_at,payload,evidence_sha256,source_url) VALUES(%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s) ON CONFLICT(station_id,period,period_key,evidence_sha256) DO NOTHING',(data['stationId'],HOST,data['sourceId'],data['period'],data['date'],data['timezone'],data['capturedAt'],json.dumps(data['payload'],ensure_ascii=False),digest,data['sourceUrl']))
if __name__=='__main__':main()

