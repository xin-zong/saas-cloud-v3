"""Import private reference device inventory into the isolated development database.

Default is a read-only preview. No source network, observations, bindings or commands.
Unknown model/manufacturer data stays in the private profile; no catalog is invented.
"""
import argparse
from datetime import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
HOST='ess-cloud-login.qudeox.com'
TARGET='ems_cloud_saas_toyingzhen'
ROLE='ems_toyingzhen_owner'
BRANCH='develop-toyingzhen'

class ImportError(RuntimeError):
    """Fixed safe diagnostics; never include source records or driver text."""

def helpers(filename):
    spec=importlib.util.spec_from_file_location(filename.replace('-','_'),ROOT/'scripts'/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def normalize(document):
    shared=helpers('import-reference-stations.py')
    try:
        if not isinstance(document,dict) or document.get('sourceHost')!=HOST:
            raise ImportError('Source host must be the approved reference host.')
        stamp=datetime.fromisoformat(document['capturedAt'].replace('Z','+00:00'))
        if stamp.utcoffset() is None: raise ValueError()
        shared.canonical(document)
        devices=document.get('devices')
        if not isinstance(devices,list): raise ImportError('Export must contain a device list.')
        rows=[]; seen=set(); serials=set()
        for source in devices:
            if not isinstance(source,dict): raise ImportError('Each device must be an object.')
            source_id=shared.text(source.get('sourceId'),200)
            serial=shared.text(source.get('serialNumber'),120)
            kind=shared.text(source.get('type'),100,True)
            if source_id is None and serial is None:
                raise ImportError('Device requires a visible source ID or stable type and serial number.')
            identity=['id',source_id] if source_id is not None else ['type-sn',kind,serial]
            source_key=hashlib.sha256(shared.canonical(identity).encode()).hexdigest()
            if source_key in seen or (serial is not None and serial in serials):
                raise ImportError('Duplicate device identity or serial number in export.')
            seen.add(source_key)
            if serial is not None: serials.add(serial)
            category=source.get('category','OTHER')
            if category not in ('BMS','BESS','PCS','HVAC','MTR','FSS','PV','OTHER'):
                raise ImportError('Invalid device category.')
            row={'sourceKey':source_key,'sourceId':source_id,'type':kind,
                 'stationSourceId':shared.text(source.get('stationSourceId'),200,True),
                 'serialNumber':serial,'name':shared.text(source.get('name'),120,True),
                 'category':category,'manufacturer':shared.text(source.get('manufacturer'),120),
                 'model':shared.text(source.get('model'),120),
                 'ratedPowerKw':shared.number(source.get('ratedPowerKw'),0,99999999999.999),
                 'capacityKwh':shared.number(source.get('capacityKwh'),0,99999999999.999)}
            row['code']='REF-'+source_key[:60]
            row['contentHash']=hashlib.sha256(shared.canonical(source).encode()).hexdigest()
            row['provenance']={'sourceHost':HOST,'capturedAt':document['capturedAt'],'device':source,
                               'exportMetadata':{k:v for k,v in document.items() if k!='devices'}}
            rows.append(row)
        return rows
    except ImportError: raise
    except Exception:
        raise ImportError('Invalid private export fields or timestamp; values withheld.') from None

def run(root,env_file,document,tenant_id,manager_id,apply=False,connect=None,branch_reader=None):
    connection=None
    try:
        rows=normalize(document)
        if type(tenant_id) is not int or tenant_id<=0 or type(manager_id) is not int or manager_id<=0:
            raise ImportError('Explicit positive tenant and manager IDs are required.')
        guard=helpers('migrate-toyingzhen.py')
        config=guard.settings(env_file)
        branch_reader=branch_reader or guard.current_branch
        if branch_reader(root)!=BRANCH: raise ImportError('Git branch must be develop-toyingzhen.')
        if connect is None:
            import psycopg
            connect=psycopg.connect
        connection=connect(host='127.0.0.1',port=15435,dbname=TARGET,user=ROLE,
                           password=config['EMS_DB_PASSWORD'],connect_timeout=10,
                           autocommit=True,options='-c search_path=public')
        report={'database':TARGET,'role':ROLE,'mode':'apply' if apply else 'dry-run',
                'tenantId':tenant_id,'managerId':manager_id,'devices':[]}
        with connection.transaction():
            with connection.cursor() as cur:
                if not apply: cur.execute('SET TRANSACTION READ ONLY')
                cur.execute('SELECT current_database(),current_user')
                if cur.fetchone()!=(TARGET,ROLE): raise ImportError('Live database identity guard failed.')
                if apply:
                    cur.execute('SELECT pg_advisory_xact_lock(78291032)')
                    cur.execute('SELECT pg_advisory_xact_lock(78291002)')
                cur.execute('SELECT count(*)=2 FROM public.schema_migration WHERE version IN (32,33)')
                if not cur.fetchone()[0]: raise ImportError('Apply reviewed V32 and V33 migrations before device import.')
                cur.execute("SELECT EXISTS(SELECT 1 FROM public.saas_active_user u WHERE u.user_id=%s AND u.tenant_id=%s AND u.kind='enterprise' AND u.administrator AND EXISTS(SELECT 1 FROM public.saas_member_capability c WHERE c.user_id=u.user_id AND c.client='web' AND c.permission_code='asset.read'))",(manager_id,tenant_id))
                if not cur.fetchone()[0]: raise ImportError('Manager must be an active enterprise administrator with web asset.read capability.')
                plans=[]
                for row in rows:
                    cur.execute('SELECT s.id,s.tenant_id,s.manager_id FROM public.station_reference_import i JOIN public.station s ON s.id=i.station_id WHERE i.source_host=%s AND i.source_id=%s'+(' FOR UPDATE OF s,i' if apply else ''),(HOST,row['stationSourceId']))
                    station=cur.fetchone()
                    if not station or station[1:]!=(tenant_id,manager_id):
                        raise ImportError('Device station mapping is missing or belongs to a different tenant or manager.')
                    cur.execute('SELECT i.device_id,i.content_hash,d.station_id,d.code,d.serial_number FROM public.device_reference_import i JOIN public.device d ON d.id=i.device_id WHERE i.source_host=%s AND i.source_key=%s'+(' FOR UPDATE OF d,i' if apply else ''),(HOST,row['sourceKey']))
                    existing=cur.fetchone()
                    if existing and (existing[2]!=station[0] or existing[3]!=row['code']):
                        raise ImportError('Mapped device changed station or code; refusing reassignment.')
                    cur.execute('SELECT id FROM public.device WHERE (station_id=%s AND code=%s) OR serial_number=%s',(station[0],row['code'],row['serialNumber']))
                    if any(item[0]!=(existing[0] if existing else None) for item in cur.fetchall()):
                        raise ImportError('Unmapped device code or serial collision; refusing adoption.')
                    status='unchanged' if existing and existing[1]==row['contentHash'] else ('update' if existing else 'insert')
                    plans.append((row,station[0],existing,status))
                if branch_reader(root)!=BRANCH: raise ImportError('Git branch changed; import stopped.')
                for row,station_id,existing,status in plans:
                    device_id=existing[0] if existing else None
                    if apply and status!='unchanged':
                        if existing:
                            cur.execute('UPDATE public.device SET name=%s,serial_number=%s WHERE id=%s AND station_id=%s',(row['name'],row['serialNumber'],device_id,station_id))
                        else:
                            cur.execute('INSERT INTO public.device(station_id,code,name,serial_number) VALUES(%s,%s,%s,%s) RETURNING id',(station_id,row['code'],row['name'],row['serialNumber']))
                            device_id=cur.fetchone()[0]
                        cur.execute('INSERT INTO public.device_reference_profile(device_id,source_type,category,manufacturer,model,rated_power_kw,capacity_kwh) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(device_id) DO UPDATE SET source_type=excluded.source_type,category=excluded.category,manufacturer=excluded.manufacturer,model=excluded.model,rated_power_kw=excluded.rated_power_kw,capacity_kwh=excluded.capacity_kwh,updated_at=now()',
                                    (device_id,)+(tuple(row[k] for k in ('type','category','manufacturer','model','ratedPowerKw','capacityKwh'))))
                        cur.execute('INSERT INTO public.device_reference_import(source_host,source_key,device_id,station_source_id,content_hash,provenance) VALUES(%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT(source_host,source_key) DO UPDATE SET content_hash=excluded.content_hash,provenance=excluded.provenance,imported_at=now()',
                                    (HOST,row['sourceKey'],device_id,row['stationSourceId'],row['contentHash'],json.dumps(row['provenance'],ensure_ascii=False,sort_keys=True,allow_nan=False)))
                    report['devices'].append({'deviceId':device_id,'stationId':station_id,'code':row['code'],'contentHash':row['contentHash'],'status':status})
        return report
    except ImportError: raise
    except Exception:
        raise ImportError('Import failed; transaction rolled back. Configuration and driver details withheld.') from None
    finally:
        if connection is not None:
            try: connection.close()
            except Exception: pass

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True,type=Path,help='Private JSON inventory; never commit business data.')
    parser.add_argument('--env',type=Path,default=ROOT/'ems-cloud-api/.env')
    parser.add_argument('--tenant-id',required=True,type=int)
    parser.add_argument('--manager-id',required=True,type=int)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args(argv)
    try:
        try: document=json.loads(args.input.read_text(encoding='utf-8-sig'))
        except (OSError,UnicodeError,ValueError): raise ImportError('Cannot read private input JSON.') from None
        print(json.dumps(run(ROOT,args.env,document,args.tenant_id,args.manager_id,args.apply),ensure_ascii=True,indent=2))
        return 0
    except ImportError as error:
        print(str(error),file=sys.stderr); return 1

if __name__=='__main__': sys.exit(main())
