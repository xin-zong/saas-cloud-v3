"""Idempotent, insert-only tag dataset from audit-station-tags.txt; isolated branch/database only."""
from pathlib import Path
import json
import subprocess
import sys
import uuid

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.local-tools/implementation'))
from toyingzhen_db import connect

DATASET='qudeox-station-tags-v1'
NAMES=['原金龙工业园电站','西班牙蘑菇厂电站','西班牙电站','瓦伦西亚电站']

def main():
    branch=subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()
    if branch!='develop-toyingzhen': raise RuntimeError('Wrong branch')
    result=[]
    with connect() as conn:
        conn.execute('select pg_advisory_xact_lock(78291026)')
        actor=conn.execute("select id,tenant_id from app_user where account='owner@prototype.local'").fetchone()
        if not actor or conn.execute('select tenant_id from station where id=21').fetchone()!=(actor[1],):
            raise RuntimeError('Wrong target tenant')
        for name in NAMES:
            existing=conn.execute('select id from station_tag where tenant_id=%s and lower(name)=lower(%s)',(actor[1],name)).fetchone()
            if existing:
                result.append({'name':name,'status':'existing-preserved'})
                continue
            tag_id=uuid.uuid5(uuid.NAMESPACE_URL,f'{DATASET}/{actor[1]}/{name}')
            if conn.execute('select exists(select 1 from station_tag where id=%s)',(tag_id,)).fetchone()[0]:
                result.append({'name':name,'status':'renamed-record-preserved'})
                continue
            conn.execute('insert into station_tag(id,tenant_id,created_by,name,description) values(%s,%s,%s,%s,%s)',(tag_id,actor[1],actor[0],name,''))
            result.append({'name':name,'status':'inserted','id':str(tag_id)})
    print(json.dumps({'dataset':DATASET,'version':1,'database':'ems_cloud_saas_toyingzhen','rows':result},ensure_ascii=False))
if __name__=='__main__':main()
