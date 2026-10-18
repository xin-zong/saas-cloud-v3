"""Import private read-only observations into the isolated new DB; default is dry-run.

No reference network access. Never matches stations by name or changes source/master data.
"""
from pathlib import Path
from datetime import datetime,timezone
from decimal import Decimal,InvalidOperation
import argparse,hashlib,importlib.util,json,sys

ROOT=Path(__file__).resolve().parents[1]
HOST='ess-cloud-login.qudeox.com'
METRICS=set('pvCapacity pvPower pvNormalization pvDaily pvMonthly pvTotal pvPeak7 pvPeakMonth pvPeakYear pvPrYesterday pvPr7 pvPrMonth pvPrYear pvCompletionMonthBasic pvCompletionMonthSuperior pvCompletionYearBasic pvCompletionYearSuperior storagePower storageCapacity storageSoc storageSoh storageActivePower storageDailyCharged storageDailyDischarged storageMonthlyCharged storageMonthlyDischarged storageTotalCharged storageTotalDischarged storageEfficiency storageEfficiency7 storageEfficiencyMonth storageEfficiencyYear storageUtilization7 storageUtilizationMonth storageUtilizationYear'.split())
class CaptureError(RuntimeError):pass
def timestamp(value):
 try:
  result=datetime.fromisoformat(value.replace('Z','+00:00'))
  if result.tzinfo is None:raise ValueError()
  return result
 except (ValueError,TypeError,AttributeError):raise CaptureError('Invalid observation timestamp.') from None
def normalize(document):
 if not isinstance(document,dict) or document.get('sourceHost')!=HOST or not isinstance(document.get('rows'),list) or not 1<=len(document['rows'])<=2000:raise CaptureError('Invalid capture envelope.')
 captured=timestamp(document.get('capturedAt'));result=[];seen=set()
 if captured>datetime.now(timezone.utc):raise CaptureError('Capture cannot be in the future.')
 for row in document['rows']:
  if not isinstance(row,dict):raise CaptureError('Invalid observation row.')
  source=row.get('stationSourceId')
  if not isinstance(source,str) or not source.strip() or len(source)>200 or source in seen:raise CaptureError('Invalid or duplicate station source identity.')
  seen.add(source);updated=timestamp(row['sourceUpdatedAt']) if row.get('sourceUpdatedAt') else None
  if updated and updated>captured:raise CaptureError('Source timestamp is after capture.')
  state=row.get('communication','unknown');charge=row.get('chargeStatus','unknown')
  if state not in ['online','offline','partial','connecting','unknown'] or charge not in ['charging','discharging','idle','unknown']:raise CaptureError('Invalid observation status.')
  metrics=row.get('metrics')
  if not isinstance(metrics,dict) or set(metrics)-METRICS:raise CaptureError('Invalid metric names.')
  values=[]
  for key,value in sorted(metrics.items()):
   if value is None:text='null'
   else:
    if isinstance(value,bool) or not isinstance(value,(str,int,float,Decimal)):raise CaptureError('Invalid numeric metric.')
    try:number=Decimal(str(value))
    except InvalidOperation:raise CaptureError('Invalid numeric metric.') from None
    if not number.is_finite() or abs(number)>Decimal('1000000000000000') or number.as_tuple().exponent < -8:raise CaptureError('Invalid numeric metric.')
    text=format(number,'f')
   values.append(json.dumps(key)+':'+text)
  payload='{'+','.join(values)+'}'
  fingerprint=hashlib.sha256((source+'\n'+captured.isoformat()+'\n'+str(updated)+'\n'+state+'\n'+charge+'\n'+payload).encode()).hexdigest()
  result.append(dict(sourceId=source,capturedAt=captured,updatedAt=updated,communication=state,chargeStatus=charge,metricsJson=payload,fingerprint=fingerprint))
 return result
def run(input_file,apply=False):
 try:document=json.loads(Path(input_file).read_text(encoding='utf-8-sig'),parse_float=Decimal)
 except (OSError,ValueError):raise CaptureError('Cannot read private capture file.') from None
 rows=normalize(document)
 spec=importlib.util.spec_from_file_location('monitor_migration_guard',ROOT/'scripts/migrate-toyingzhen.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
 config=guard.settings(ROOT/'ems-cloud-api/.env')
 if guard.current_branch(ROOT)!='develop-toyingzhen':raise CaptureError('Import requires develop-toyingzhen.')
 import psycopg
 with psycopg.connect(host='127.0.0.1',port=15435,dbname=guard.TARGET,user=guard.ROLE,password=config['EMS_DB_PASSWORD'],connect_timeout=10) as connection:
  with connection.cursor() as cursor:
   if not apply:cursor.execute('set transaction read only')
   cursor.execute('select current_database(),current_user')
   if cursor.fetchone()!=(guard.TARGET,guard.ROLE):raise CaptureError('Database identity guard failed.')
   cursor.execute('select max(version) from schema_migration')
   if cursor.fetchone()[0]<39:raise CaptureError('Reviewed monitor migrations must be applied first.')
   if apply:cursor.execute('select pg_advisory_xact_lock(78291038)')
   inserted=0;existing=0
   for row in rows:
    cursor.execute('select station_id from station_reference_import where source_host=%s and source_id=%s',(HOST,row['sourceId']));mapping=cursor.fetchone()
    if not mapping:raise CaptureError('Missing stable station import mapping; no names are matched.')
    cursor.execute('select exists(select 1 from monitor_station_capture where station_id=%s and source_fingerprint=%s)',(mapping[0],row['fingerprint']))
    if cursor.fetchone()[0]:existing+=1;continue
    if apply:
     cursor.execute('INSERT INTO monitor_station_capture(station_id,captured_at,source_updated_at,communication,charge_status,metrics,source_host,source_fingerprint) VALUES(%s,%s,%s,%s,%s,%s::jsonb,%s,%s)',(mapping[0],row['capturedAt'],row['updatedAt'],row['communication'],row['chargeStatus'],row['metricsJson'],HOST,row['fingerprint']))
    inserted+=1
   return dict(database=guard.TARGET,mode='apply' if apply else 'dry-run',observations=len(rows),inserted=inserted,alreadyPresent=existing)
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True,type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 try:print(json.dumps(run(args.input,args.apply)));return 0
 except CaptureError as e:print(str(e),file=sys.stderr);return 1
 except Exception:print('Capture import failed; transaction rolled back. Private driver details withheld.',file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
