"""Import a verified dashboard observation; no source network calls. Dry-run by default."""
from pathlib import Path
from datetime import datetime,timezone
from decimal import Decimal,InvalidOperation
import argparse,hashlib,importlib.util,json,sys
ROOT=Path(__file__).resolve().parents[1]
HOST='ess-cloud-login.qudeox.com'
COUNTS={'total','PV','BESS','Hybrid','connecting','partial','alarmSites','offline'}
CAPACITIES={'pvCapacity','storagePower','storageCapacity'}
TOTALS={'pvTotal','storageTotalCharged','storageTotalDischarged','storageEfficiency'}
CARDS={'pvPeak7','pvPeakMonth','pvPeakYear','pvPr7','pvPrMonth','pvPrYear','pvCompletionTotalBasic','pvCompletionYearBasic','pvCompletionTotalSuperior','pvCompletionYearSuperior','storageEfficiency7','storageEfficiencyMonth','storageEfficiencyYear','storageUtilization7','storageUtilizationMonth','storageUtilizationYear'}
class ImportError(RuntimeError):pass
def number(value):
 if value is None:return None
 if isinstance(value,bool):raise ImportError('Invalid number.')
 try:result=Decimal(str(value))
 except (InvalidOperation,ValueError):raise ImportError('Invalid number.') from None
 if not result.is_finite() or abs(result)>Decimal('1000000000000000') or result.as_tuple().exponent < -8:raise ImportError('Invalid number.')
 return result
def encode(value):
 if isinstance(value,Decimal):return format(value,'f')
 if isinstance(value,dict):return '{'+','.join(json.dumps(k)+':'+encode(v) for k,v in sorted(value.items()))+'}'
 if isinstance(value,list):return '['+','.join(encode(v) for v in value)+']'
 return json.dumps(value,ensure_ascii=False,allow_nan=False)
def timestamp(value):
 try:
  result=datetime.fromisoformat(value.replace('Z','+00:00'))
  if result.tzinfo is None:raise ValueError()
  return result
 except (ValueError,TypeError,AttributeError):raise ImportError('Invalid timestamp.') from None
def normalize(document):
 if not isinstance(document,dict) or set(document)!={'capturedAt','sourceUpdatedAt','sourceIds','summary','totals','cards'}:raise ImportError('Invalid dashboard document.')
 captured,updated=timestamp(document['capturedAt']),timestamp(document['sourceUpdatedAt'])
 if updated>captured or captured>datetime.now(timezone.utc):raise ImportError('Invalid observation chronology.')
 ids=document['sourceIds']
 if not isinstance(ids,list) or not ids or len(ids)>2000 or any(not isinstance(v,str) or not 1<=len(v)<=160 for v in ids) or len(set(ids))!=len(ids):raise ImportError('Invalid station scope.')
 summary=document['summary']
 if not isinstance(summary,dict) or set(summary)!=COUNTS|CAPACITIES:raise ImportError('Invalid summary keys.')
 values={k:number(v) for k,v in summary.items()}
 if any(values[k] is None or values[k]<0 or values[k]!=int(values[k]) for k in COUNTS):raise ImportError('Invalid station count.')
 if values['total']!=len(ids) or sum(values[k] for k in ['PV','BESS','Hybrid'])!=len(ids) or sum(values[k] for k in ['connecting','partial','offline'])>len(ids) or values['alarmSites']>len(ids):raise ImportError('Inconsistent station scope.')
 if set(document['totals'])!=TOTALS:raise ImportError('Invalid totals.')
 # A fleet report is not evidence that every station supplied each counter.
 values['totals']={k:dict(value=number(v),covered=None,total=len(ids),complete=None,reported=True) for k,v in document['totals'].items()}
 cards=document['cards']
 if not isinstance(cards,dict) or set(cards)-CARDS:raise ImportError('Invalid card keys.')
 output={}
 for key,record in cards.items():
  if not isinstance(record,dict) or set(record)-{'verified','value','ranking','plannedEnergy','actualEnergy','chargeEnergy','dischargeEnergy'} or record.get('verified') is not True:raise ImportError('Unverified card.')
  ranks=record.get('ranking')
  if not isinstance(ranks,list) or len(ranks)>len(ids):raise ImportError('Invalid ranking.')
  ranked=set();normalized=[]
  for row in ranks:
   if not isinstance(row,dict) or set(row)!={'sourceId','value'} or row['sourceId'] not in ids or row['sourceId'] in ranked:raise ImportError('Ranking outside dashboard scope.')
   ranked.add(row['sourceId']);normalized.append(dict(sourceId=row['sourceId'],value=number(row['value'])))
  output[key]=dict(verified=True,value=number(record.get('value')),ranking=normalized)
  for extra in ['plannedEnergy','actualEnergy','chargeEnergy','dischargeEnergy']:
   if extra in record:output[key][extra]=number(record[extra])
 payload=dict(summary=values,cards=output)
 fingerprint=hashlib.sha256((encode(document)+'\n'+encode(payload)).encode('utf8')).hexdigest()
 return dict(capturedAt=captured,sourceUpdatedAt=updated,sourceIds=ids,payload=payload,fingerprint=fingerprint)
def run(path,apply=False):
 try:record=normalize(json.loads(Path(path).read_text(encoding='utf-8-sig'),parse_float=Decimal))
 except (OSError,ValueError):raise ImportError('Cannot read private observation.') from None
 spec=importlib.util.spec_from_file_location('dashboard_guard',ROOT/'scripts/migrate-toyingzhen.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
 if guard.current_branch(ROOT)!='develop-toyingzhen':raise ImportError('Wrong branch.')
 settings=guard.settings(ROOT/'ems-cloud-api/.env')
 import psycopg
 with psycopg.connect(host='127.0.0.1',port=15435,dbname=guard.TARGET,user=guard.ROLE,password=settings['EMS_DB_PASSWORD'],connect_timeout=10) as connection:
  with connection.cursor() as cur:
   if not apply:cur.execute('set transaction read only')
   cur.execute('select current_database(),current_user')
   if cur.fetchone()!=(guard.TARGET,guard.ROLE):raise ImportError('Database identity mismatch.')
   cur.execute('select max(version) from schema_migration')
   if cur.fetchone()[0]<40:raise ImportError('V40 must be applied first.')
   if apply:cur.execute('select pg_advisory_xact_lock(78291040)')
   mapping={}
   for source in record['sourceIds']:
    cur.execute('select station_id::text from station_reference_import where source_host=%s and source_id=%s',(HOST,source));found=cur.fetchone()
    if not found:raise ImportError('Missing stable station mapping.')
    mapping[source]=found[0]
   for card in record['payload']['cards'].values():
    for row in card['ranking']:row['stationId']=mapping[row.pop('sourceId')]
   cur.execute('select id from monitor_dashboard_capture where source_fingerprint=%s',(record['fingerprint'],));existing=cur.fetchone()
   if apply and not existing:
    cur.execute('insert into monitor_dashboard_capture(source_host,captured_at,source_updated_at,payload,source_fingerprint) values(%s,%s,%s,%s::jsonb,%s) returning id',(HOST,record['capturedAt'],record['sourceUpdatedAt'],encode(record['payload']),record['fingerprint']));identifier=cur.fetchone()[0]
    cur.executemany('insert into monitor_dashboard_capture_station(capture_id,station_id) values(%s,%s)',[(identifier,int(v)) for v in mapping.values()])
   return dict(database=guard.TARGET,mode='apply' if apply else 'dry-run',stations=len(mapping),alreadyPresent=bool(existing),inserted=bool(apply and not existing))
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True,type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 try:print(json.dumps(run(args.input,args.apply)));return 0
 except ImportError as ex:print(str(ex),file=sys.stderr);return 1
 except Exception:print('Dashboard import failed; transaction rolled back. Private driver details withheld.',file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
