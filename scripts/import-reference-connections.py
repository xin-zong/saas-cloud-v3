"""Import verified private connection evidence. Defaults to read-only preview; no inventory creation."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
def normalize(document,source_station):
 try:
  url=urlsplit(document['sourceUrl'])
  if url.scheme!='https' or url.netloc!='ess-cloud-login.qudeox.com' or url.fragment or not re.fullmatch(r'/monitor/plant/plantDetail/'+re.escape(source_station)+r'/device',url.path):raise ValueError()
  captured=datetime.fromisoformat(document['capturedAt'].replace('Z','+00:00'))
  if captured.utcoffset() is None or captured>datetime.now(timezone.utc):raise ValueError()
  source=document['rows']
  if not isinstance(source,list) or not 1<=len(source)<=2000:raise ValueError()
  result=[];stack=[];seen=set()
  for order,row in enumerate(source):
   depth=row['depth'];parts=row['label'].split('\n')
   if type(depth) is not int or depth<0 or depth>len(stack) or len(parts)!=2:raise ValueError()
   kind,serial=(p.strip() for p in parts)
   if not serial or len(serial)>120 or serial in seen or len(kind)>100:raise ValueError()
   cells=row['cells']
   if len(cells)!=3 or cells[0]!=row['label']:raise ValueError()
   status={'在线':'online','离线':'offline','未知':'unknown'}.get(cells[1].strip())
   if status is None:raise ValueError()
   raw=cells[2].strip()
   observed=None if raw in ('','--','-') else datetime.strptime(raw,'%Y-%m-%d %H:%M:%S UTC%z')
   if observed and observed>captured:raise ValueError()
   parent=stack[depth-1] if depth else None
   stack=stack[:depth]+[serial];seen.add(serial)
   result.append(dict(serial=serial,type=kind,parent=parent,order=order,status=status,observed=observed,captured=captured,url=document['sourceUrl']))
  return result
 except (KeyError,TypeError,ValueError,AttributeError):raise ValueError('Invalid connection tree source, hierarchy, identity or timestamp; values withheld.') from None

def run(document,source_station,station,apply=False):
 rows=normalize(document,source_station)
 if type(station) is not int or station<=0:raise ValueError('Explicit positive station mapping required.')
 spec=importlib.util.spec_from_file_location('guard',ROOT/'scripts/migrate-toyingzhen.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
 if guard.current_branch(ROOT)!=guard.BRANCH:raise ValueError('Wrong branch.')
 config=guard.settings(ROOT/'ems-cloud-api/.env')
 import psycopg
 with psycopg.connect(host='127.0.0.1',port=15435,dbname=guard.TARGET,user=guard.ROLE,password=config['EMS_DB_PASSWORD'],connect_timeout=10,autocommit=True) as conn:
  with conn.transaction():
   with conn.cursor() as cur:
    if not apply:cur.execute('SET TRANSACTION READ ONLY')
    cur.execute('SELECT current_database(),current_user')
    if cur.fetchone()!=(guard.TARGET,guard.ROLE):raise ValueError('Database guard failed.')
    if apply:cur.execute('SELECT pg_advisory_xact_lock(78291060)')
    cur.execute('SELECT id FROM station WHERE id=%s AND archived_at IS NULL',(station,))
    if not cur.fetchone():raise ValueError('Mapped station missing.')
    cur.execute('SELECT source_id FROM station_reference_import WHERE station_id=%s AND source_host=%s',(station,'ess-cloud-login.qudeox.com'))
    mapping=cur.fetchone()
    if not mapping or mapping[0]!=source_station:raise ValueError('Explicit mapping conflicts with saved station provenance.')
    cur.execute('SELECT serial_number FROM device WHERE station_id=%s AND archived_at IS NULL GROUP BY serial_number HAVING count(*)>1',(station,))
    if cur.fetchone():raise ValueError('Ambiguous inventory serials.')
    cur.execute('SELECT EXISTS(SELECT 1 FROM schema_migration WHERE version=60)');ready=cur.fetchone()[0]
    if apply and not ready:raise ValueError('Reviewed V60 migration required before apply.')
    if ready:
     cur.execute('SELECT source_station_id,captured_at FROM station_reference_connection_node WHERE station_id=%s',(station,))
     existing=cur.fetchall()
     if any(source!=source_station or captured>rows[0]['captured'] for source,captured in existing):raise ValueError('Conflicting source or older capture refused.')
    if apply:
     # Replace only this source snapshot; inventory and observation tables are untouched.
     cur.execute('DELETE FROM station_reference_connection_node WHERE station_id=%s AND serial_number<>ALL(%s)',(station,[r['serial'] for r in rows]))
     for r in rows:
      cur.execute('''INSERT INTO station_reference_connection_node(station_id,source_station_id,serial_number,source_type,parent_serial_number,sort_order,source_url,captured_at,observed_at,observed_status)
       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(station_id,serial_number) DO UPDATE SET
       source_type=excluded.source_type,parent_serial_number=excluded.parent_serial_number,sort_order=excluded.sort_order,source_url=excluded.source_url,captured_at=excluded.captured_at,observed_at=excluded.observed_at,observed_status=excluded.observed_status''',
       (station,source_station,r['serial'],r['type'],r['parent'],r['order'],r['url'],r['captured'],r['observed'],r['status']))
    return dict(mode='apply' if apply else 'preview',nodes=len(rows),edges=sum(r['parent'] is not None for r in rows),stationId=station,migrationReady=ready)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source-tree',required=True,type=Path);parser.add_argument('--source-station',required=True);parser.add_argument('--station',required=True,type=int);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 try:print(json.dumps(run(json.loads(args.source_tree.read_text(encoding='utf-8-sig')),args.source_station,args.station,args.apply)))
 except Exception:raise SystemExit('Connection import failed; source/configuration/driver details withheld.') from None

