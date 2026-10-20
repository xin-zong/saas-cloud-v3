"""Immutable isolated business-group evidence dataset; no built-in business names.

Input is a private reviewed JSON manifest with tenantId, datasetId, version,
source, evidenceRef, groups and explicit assignments. Names do not imply station
membership. Without verified assignment evidence, pass an empty assignment list.
"""
import argparse,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def validate(data):
 if not isinstance(data,dict):raise ValueError('Manifest must be an object')
 result=dict(data)
 for key in ('tenantId','version'):
  if type(data.get(key)) is not int or data[key]<1:raise ValueError('Positive tenant/version required')
 for key,limit in (('datasetId',100),('evidenceRef',200)):
  if not isinstance(data.get(key),str) or not data[key].strip() or len(data[key])>limit:raise ValueError('Dataset and evidence identity required')
 if data.get('source') not in ('reference-observed','local-config'):raise ValueError('Explicit verified source required')
 if not isinstance(data.get('groups'),list) or not isinstance(data.get('assignments'),list):raise ValueError('Groups and explicit assignments required')
 groups=[];ids=set()
 for index,row in enumerate(data['groups']):
  if not isinstance(row,dict):raise ValueError('Invalid group')
  gid=row.get('id');parent=row.get('parentId');name=row.get('name');kind=row.get('type');order=row.get('sortOrder',index)
  if not isinstance(gid,str) or not gid.strip() or len(gid)>100 or gid in ids:raise ValueError('Unique group identity required')
  if parent is not None and (not isinstance(parent,str) or not parent.strip() or len(parent)>100):raise ValueError('Invalid parent identity')
  if not isinstance(name,str) or not name.strip() or len(name)>160 or kind not in ('group','project') or type(order) is not int:raise ValueError('Explicit group name/type/order required')
  ids.add(gid);groups.append(dict(id=gid,parentId=parent,name=name,type=kind,sortOrder=order))
 parents={g['id']:g['parentId'] for g in groups}
 for gid in ids:
  visited=set();cursor=gid
  while cursor is not None:
   if cursor in visited or cursor not in parents or len(visited)>=50:raise ValueError('Unknown parent, cycle or excessive depth')
   visited.add(cursor);cursor=parents[cursor]
 assignments=[];pairs=set()
 for row in data['assignments']:
  if not isinstance(row,dict) or row.get('groupId') not in ids or type(row.get('stationId')) is not int or row['stationId']<1:raise ValueError('Explicit valid station/group association required')
  pair=(row['groupId'],row['stationId'])
  if pair in pairs:raise ValueError('Duplicate assignment')
  pairs.add(pair);assignments.append(dict(groupId=pair[0],stationId=pair[1]))
 result['groups']=sorted(groups,key=lambda g:g['id']);result['assignments']=sorted(assignments,key=lambda a:(a['groupId'],a['stationId']))
 return result

def run(connection,manifest,apply=False):
 data=validate(manifest)
 if subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()!='develop-toyingzhen':raise RuntimeError('Branch guard failed')
 tenant,dataset,version=data['tenantId'],data['datasetId'],data['version']
 with connection.cursor() as c:
  c.execute('select current_database(),current_user')
  if c.fetchone()!=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner'):raise RuntimeError('Database identity guard failed')
  c.execute('select pg_advisory_xact_lock(78291066)')
  c.execute("select id from tenant where id=%s and kind='enterprise' and enabled",(tenant,))
  if c.fetchone()!=(tenant,):raise RuntimeError('Active enterprise tenant required')
  station_ids=sorted({r['stationId'] for r in data['assignments']})
  if station_ids:
   c.execute('select id from station where tenant_id=%s and archived_at is null and id=any(%s) order by id',(tenant,station_ids))
   if [r[0] for r in c.fetchall()]!=station_ids:raise RuntimeError('Cross-tenant or unavailable station association')
  c.execute('select source,evidence_ref from station_business_group_dataset where tenant_id=%s and dataset_id=%s and dataset_version=%s',(tenant,dataset,version));existing=c.fetchone()
  if existing:
   if existing!=(data['source'],data['evidenceRef']):raise RuntimeError('Immutable dataset identity differs; use a new version')
   c.execute('select id,parent_id,name,kind,sort_order from station_business_group where tenant_id=%s and dataset_id=%s and dataset_version=%s order by id',(tenant,dataset,version));groups=[dict(id=i,parentId=p,name=n,type=k,sortOrder=o) for i,p,n,k,o in c.fetchall()]
   c.execute('select group_id,station_id from station_business_group_station where tenant_id=%s and dataset_id=%s and dataset_version=%s order by group_id,station_id',(tenant,dataset,version));assignments=[dict(groupId=g,stationId=s) for g,s in c.fetchall()]
   if groups!=data['groups'] or assignments!=data['assignments']:raise RuntimeError('Immutable dataset content differs; use a new version')
  elif apply:
   c.execute('insert into station_business_group_dataset(tenant_id,dataset_id,dataset_version,source,evidence_ref) values(%s,%s,%s,%s,%s)',(tenant,dataset,version,data['source'],data['evidenceRef']))
   c.executemany('insert into station_business_group(tenant_id,dataset_id,dataset_version,id,parent_id,name,kind,sort_order) values(%s,%s,%s,%s,%s,%s,%s,%s)',[(tenant,dataset,version,g['id'],g['parentId'],g['name'],g['type'],g['sortOrder']) for g in data['groups']])
   c.executemany('insert into station_business_group_station(tenant_id,dataset_id,dataset_version,group_id,station_id) values(%s,%s,%s,%s,%s)',[(tenant,dataset,version,a['groupId'],a['stationId']) for a in data['assignments']])
  return dict(datasetId=dataset,version=version,tenantId=tenant,mode='apply' if apply else 'preview',groups=len(data['groups']),assignments=len(data['assignments']),alreadyPresent=bool(existing))

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True,type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 data=json.loads(args.input.read_text(encoding='utf-8-sig'));sys.path.insert(0,str(ROOT/'.local-tools/implementation'));from toyingzhen_db import connect
 with connect() as conn:print(json.dumps(run(conn,data,args.apply)))
if __name__=='__main__':main()
