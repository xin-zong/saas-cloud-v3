"""Import reviewed, read-only UI captures. Dry-run by default; isolated DB only.

Input: JSON containing url, capturedAt and physical DOM tables (header/body/name).
No reference credentials or business data belong in this script or the repository.
"""
import argparse, hashlib, json, re, subprocess
from decimal import Decimal
from datetime import datetime
from pathlib import Path
import psycopg

HOST = 'ess-cloud-login.qudeox.com'
SKIP = {'', '名称/SN', '状态', '所属场站', '所属父设备', '数据更新时间', '操作', '光伏发电趋势'}

def parse_value(raw, unit):
    raw = raw.strip()
    if (raw == unit and bool(unit)) or raw in ('', '--', '—', '-', '暂无数据') or re.fullmatch(r'--(?:MΩ|kΩ|Ω|kWh|MWh|kW|W|V|A|%|℃|Bar|h)',raw):
        return None, 'missing'
    match = re.fullmatch(r'([-+]?\d+(?:\.\d+)?)\s*(MΩ|kΩ|Ω|kWh|MWh|GWh|Wh|kvarh|MVar|kVar|Var|kvar|kVA|VA|kW|MW|W|mV|V|A|%|℃|°C|Hz|Bar|h)?', raw)
    if not match:
        if unit:
            raise ValueError('Unrecognized numeric cell: '+raw)
        return None, 'text'
    value = Decimal(match[1]); actual = match[2] or unit
    factors = {'W':Decimal('1'), 'kW':Decimal('1000'), 'MW':Decimal('1000000'),
               'GWh':Decimal('1000000000'),'Wh':Decimal('1'), 'kWh':Decimal('1000'), 'MWh':Decimal('1000000'),
               'mV':Decimal('.001'), 'V':Decimal('1'), 'Ω':Decimal(1),'kΩ':Decimal(1000),'MΩ':Decimal(1000000),'VA':Decimal(1),'kVA':Decimal(1000),'Var':Decimal(1),'kVar':Decimal(1000),'MVar':Decimal(1000000),'℃':Decimal(1),'°C':Decimal(1)}
    if actual != unit:
        families = [{'W','kW','MW'}, {'Wh','kWh','MWh','GWh'}, {'mV','V'}, {'Ω','kΩ','MΩ'},{'℃','°C'},{'Var','kVar','MVar'},{'VA','kVA'}]
        if not any(actual in f and unit in f for f in families):
            raise ValueError('Unit mismatch')
        value *= factors[actual]/factors[unit]
    return value, 'observed'

def read_capture(path):
    body = path.read_bytes(); doc = json.loads(body)
    if doc['url'] != 'https://'+HOST+'/monitor/device/list':
        raise ValueError('Unexpected source URL')
    captured = datetime.fromisoformat(doc['capturedAt'].replace('Z','+00:00'))
    tables = doc['tables']; headers, rows, names = tables[0][0], tables[1], tables[3]
    if len(rows)!=len(names): raise ValueError('Identity/row count mismatch')
    time_index = headers.index('数据更新时间'); result=[]
    for row, identity in zip(rows,names):
        if len(row)!=len(headers): raise ValueError('Physical column count mismatch')
        serial = identity[0].splitlines()[-1].strip()
        source = datetime.strptime(row[time_index],'%Y-%m-%d %H:%M:%S UTC%z')
        if source>captured: raise ValueError('Future source time')
        for label,raw in zip(headers,row):
            if label in SKIP: continue
            match=re.fullmatch(r'(.*?)[(（]([^()（）]+)[)）]',label)
            name,unit=(match[1],match[2]) if match else (label,'')
            value,quality=parse_value(raw,unit)
            result.append((serial,name,unit,source,captured,value,raw,quality,doc['url'],hashlib.sha256(body).hexdigest()))
    return result

def read_detail(path):
    body=path.read_bytes();doc=json.loads(body)
    if doc['url']!='https://'+HOST+'/monitor/device/list' and not re.fullmatch(r'https://'+re.escape(HOST)+r'/monitor/plant/plantDetail/[0-9]+/device\?type=[0-9_]+&childSystemId=[0-9]+',doc['url']):raise ValueError('Unexpected source URL')
    text=doc['text'];serial=text.splitlines()[0].split('：')[-1].strip()
    timestamp=re.search(r'\d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC[+-]\d\d:\d\d',text)
    if not timestamp:raise ValueError('Detail has no source timestamp')
    source=datetime.strptime(timestamp[0],'%Y-%m-%d %H:%M:%S UTC%z')
    captured=datetime.fromisoformat(doc['capturedAt'].replace('Z','+00:00'))
    if source>captured:raise ValueError('Future source time')
    result=[];seen=set()
    def add(name,unit,raw):
        if (name,unit) in seen:return
        seen.add((name,unit));value,quality=parse_value(raw,unit)
        result.append((serial,name,unit,source,captured,value,raw,quality,doc['url'],hashlib.sha256(body).hexdigest()))
    for pair in doc['cards']+doc['summary']:
        if len(pair)!=2:continue
        name,raw=(s.strip() for s in pair)
        if raw in ('组串电流离散率','组串电流平均值','组串电压离散率','组串电压平均值'):name,raw=raw,name
        match=re.search(r'(MΩ|kΩ|Ω|GWh|MWh|kWh|Wh|kvarh|MVar|kVar|Var|kvar|kVA|VA|kW|MW|W|mV|V|A|%|℃|°C|Hz|Bar|h)$',raw)
        unit=match[0] if match else ''
        # Normalize changing display scales without changing the measured quantity.
        unit={'W':'kW','MW':'kW','Wh':'kWh','MWh':'kWh','GWh':'kWh','Ω':'MΩ','kΩ':'MΩ','MVar':'kVar','Var':'kVar','VA':'kVA'}.get(unit,unit)
        add('详情 · '+name,unit,raw)
    tables=doc.get('tables',[])
    for i,table in enumerate(tables[:-1]):
        if not table or len(table)!=1:continue
        headers=table[0]
        if headers and headers[0]=='交流':
            for row in tables[i+1]:
                if len(row)!=len(headers) and not (headers==['交流','电压','电流','频率','实时功率因数'] and row[0] in ('B','C') and len(row)==3):raise ValueError('Phase column mismatch')
                units={'有功功率':'kW','无功功率':'kVar','视在功率':'kVA','实时功率因数':'','电压':'V','电流':'A','频率':'Hz'}
                for title,raw in zip(headers[1:],row[1:]):add('详情 · '+row[0]+'相 '+title,units[title],raw)
        if headers==['直流','电压','电流','功率','备注']:
            for row in tables[i+1]:
                if len(row)!=5:raise ValueError('String column mismatch')
                for title,raw,unit in zip(headers[1:4],row[1:4],['V','A','kW']):add('详情 · '+row[0]+' '+title,unit,raw)
        if headers[:2]==['类别','作用']:
            for row in tables[i+1]:
                if len(row)!=len(headers):raise ValueError('Energy column mismatch')
                for title,raw in zip(headers[2:],row[2:]):add('详情 · '+row[0]+' · '+title,'kWh',raw)
    selected=[r['label'] for r in doc['radio'] if r['checked']]
    unit='V' if '电压/V' in selected else '℃' if '温度/℃' in selected else None
    for pack in doc['packs']:
        if not pack['cells']:continue
        if unit is None:raise ValueError('Unknown array unit')
        header=pack['header'].splitlines();pack_sn=header[-1]
        # Extremum cells use a different CSS class. Recover their printed index
        # from the same captured DOM text, never from their position in an array.
        segment=text.split(pack_sn+'\n',1)[1]
        printed=re.findall(r'(?:^|\n)([-+]?\d+(?:\.\d+)?|--)\n(#\d+)(?=\n|$)',segment)[:len(pack['cells'])]
        if len(printed)!=len(pack['cells']):raise ValueError('Missing printed cell index')
        for cell,(raw,index) in zip(pack['cells'],printed):
            if cell.get('index') and cell['index']!=index:raise ValueError('Cell index mismatch')
            if cell.get('value')!=raw:raise ValueError('Cell value mismatch')
            add(f"电池包 {pack_sn} · {'电压' if unit=='V' else '温度'} {index}",unit,raw)
    return result

def validate_station_mapping(rows, station_mappings):
    for row in rows:
        if row[0] not in station_mappings:
            raise ValueError('Unknown source device')
        if row[8] == 'https://'+HOST+'/monitor/device/list':
            continue
        match = re.fullmatch(r'https://'+re.escape(HOST)+r'/monitor/plant/plantDetail/([0-9]+)/device\?type=[0-9_]+&childSystemId=([0-9]+)', row[8])
        if not match or any(source_id != station_mappings[row[0]] for source_id in match.groups()):
            raise ValueError('Source station does not match imported device station')

def ensure_stored_bindings(cur, reference_ids):
    """Bind only this batch's points, preserving immutable ownership and existing semantics."""
    reference_ids=sorted(set(reference_ids))
    if not reference_ids:return
    # Lock and verify complete existing batches in one round trip. Missing or
    # conflicting identities fall through to the same strict per-point guards.
    cur.execute("""SELECT p.id FROM reference_device_point p
        JOIN device d ON d.id=p.device_id
        JOIN stored_device_point_binding b ON b.reference_point_id=p.id
        JOIN measurement_point mp ON mp.id=b.measurement_point_id
        JOIN measurement_kind k ON k.code='stored_device_'||p.id
        WHERE p.id=ANY(%s) AND p.source_host=%s
        AND length(p.name)<=120 AND length(p.unit)<=30
        AND k.name=p.name AND k.unit=p.unit
        AND mp.device_id=p.device_id AND b.station_id=d.station_id
        AND mp.code='stored_device_'||p.id AND mp.kind_code=k.code
        ORDER BY p.id FOR UPDATE OF p,d,b,mp,k""",(reference_ids,HOST))
    if {row[0] for row in cur.fetchall()}==set(reference_ids):return
    for reference_id in reference_ids:
        cur.execute('SELECT p.device_id,p.name,p.unit,d.station_id,p.source_host FROM reference_device_point p JOIN device d ON d.id=p.device_id WHERE p.id=%s FOR UPDATE OF p,d',(reference_id,))
        source=cur.fetchone()
        if not source or source[4]!=HOST or len(source[1])>120 or len(source[2])>30:
            raise ValueError('Invalid canonical source point')
        device_id,name,unit,station_id,_=source
        code='stored_device_'+str(reference_id)
        cur.execute('SELECT name,unit FROM measurement_kind WHERE code=%s FOR UPDATE',(code,))
        kind=cur.fetchone()
        if kind is not None and kind!=(name,unit):raise ValueError('Canonical stored kind collision')
        if kind is None:
            cur.execute('INSERT INTO measurement_kind(code,name,unit) VALUES(%s,%s,%s)',(code,name,unit))
        cur.execute('SELECT id,kind_code FROM measurement_point WHERE device_id=%s AND code=%s FOR UPDATE',(device_id,code))
        point=cur.fetchone()
        if point is not None and point[1]!=code:raise ValueError('Canonical stored point collision')
        if point is None:
            cur.execute('INSERT INTO measurement_point(device_id,kind_code,code) VALUES(%s,%s,%s)',(device_id,code,code))
        cur.execute('SELECT id FROM measurement_point WHERE device_id=%s AND code=%s',(device_id,code))
        measurement_id=cur.fetchone()[0]
        cur.execute('SELECT measurement_point_id,station_id FROM stored_device_point_binding WHERE reference_point_id=%s FOR UPDATE',(reference_id,))
        binding=cur.fetchone()
        if binding is not None and binding!=(measurement_id,station_id):raise ValueError('Canonical stored binding ownership collision')
        if binding is None:
            cur.execute('INSERT INTO stored_device_point_binding(measurement_point_id,reference_point_id,station_id,semantic_key) VALUES(%s,%s,%s,NULL)',(measurement_id,reference_id,station_id))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--env-file',required=True);parser.add_argument('--input-dir',required=True);parser.add_argument('--apply',action='store_true')
    args=parser.parse_args();config={}
    branch=subprocess.check_output(['git','-C',str(Path(__file__).resolve().parents[2]),'branch','--show-current'],text=True).strip()
    if branch!='develop-toyingzhen':raise ValueError('Branch guard failed')
    for line in Path(args.env_file).read_text(encoding='utf-8-sig').splitlines():
        key,sep,value=line.partition('=')
        if sep and not key.startswith('#'):config[key]=value
    if config.get('EMS_DB_URL')!='jdbc:postgresql://127.0.0.1:15435/ems_cloud_saas_toyingzhen' or config.get('EMS_DB_USERNAME')!='ems_toyingzhen_owner':raise ValueError('Database guard failed')
    files=sorted(Path(args.input_dir).glob('*-current*.json'))
    details=sorted(Path(args.input_dir).glob('*-detail.json'))
    rows=[r for p in files for r in read_capture(p)]+[r for p in details for r in read_detail(p)]
    with psycopg.connect(host='127.0.0.1',port=15435,dbname='ems_cloud_saas_toyingzhen',user='ems_toyingzhen_owner',password=config['EMS_DB_PASSWORD']) as conn:
        with conn.cursor() as cur:
            cur.execute('select current_database(),current_user')
            assert cur.fetchone()==('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner')
            cur.execute('select d.serial_number,d.id,r.station_source_id from device d join device_reference_import r on r.device_id=d.id where r.source_host=%s',(HOST,))
            mappings={};station_mappings={}
            for serial,device,station_source_id in cur.fetchall():
                if serial in mappings:raise ValueError('Ambiguous device serial')
                mappings[serial]=device
                station_mappings[serial]=station_source_id
            validate_station_mapping(rows,station_mappings)
            if args.apply:
                points=list(dict.fromkeys((mappings[r[0]],r[1],r[2],HOST) for r in rows))
                cur.executemany('INSERT INTO reference_device_point(device_id,name,unit,source_host) VALUES(%s,%s,%s,%s) ON CONFLICT(device_id,name,unit) DO NOTHING',points)
                cur.execute('SELECT device_id,name,unit,id FROM reference_device_point')
                point_ids={(d,n,u):i for d,n,u,i in cur.fetchall()}
                ensure_stored_bindings(cur,[point_ids[(device,name,unit)] for device,name,unit,_ in points])
                samples=[(point_ids[(mappings[serial],name,unit)],source,captured,value,raw,quality,url,sha) for serial,name,unit,source,captured,value,raw,quality,url,sha in rows]
                cur.executemany('INSERT INTO reference_device_sample(point_id,source_at,captured_at,value,raw_value,quality,source_url,evidence_sha256) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING',samples)
    print(json.dumps({'apply':args.apply,'files':len(files),'devicesWithFields':len({r[0] for r in rows}),'observations':len(rows),'numeric':sum(r[7]=='observed' for r in rows),'missing':sum(r[7]=='missing' for r in rows),'text':sum(r[7]=='text' for r in rows)}))

if __name__=='__main__':main()
