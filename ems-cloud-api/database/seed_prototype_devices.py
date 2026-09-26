"""Explicit simulated device data for PROTO-001/002 only. Run on the DB host as root.

No schema changes, credentials, access grants or actual equipment commands.
Existing prototype PCS records are reused; SIM-prefixed records are repeatable.
"""
import datetime as dt
import json
import math
import os
import pathlib
import subprocess
import tempfile

DB = 'ems_cloud_v2_proto'
CH = 'ems_cloud_v2_proto_telemetry.measurement_sample'
CONFIG = '/etc/chuneng-cloud-v2/clickhouse-client.xml'
MANUFACTURER = '模拟设备（非实物）'
DEVICES = [
    ('PCS-01', 'PCS', '储能变流器01'), ('SIM-PCS-02', 'PCS', '储能变流器02'),
    ('SIM-BMS-01', 'BMS', '电池管理系统'),
    ('SIM-RACK-01', 'BESS', '电池簇01'), ('SIM-RACK-02', 'BESS', '电池簇02'),
    ('SIM-MTR-01', 'MTR', '并网电表'), ('SIM-MTR-02', 'MTR', '负荷电表'),
    ('SIM-FSS-01', 'FSS', '消防控制器'), ('SIM-HVAC-01', 'HVAC', '温控系统'),
    ('SIM-PV-01', 'PV', '光伏逆变器'), ('SIM-DCDC-01', 'OTHER', '光伏DC/DC'),
    ('SIM-GRID-01', 'OTHER', '电网接入'), ('SIM-LOAD-01', 'OTHER', '园区负载'),
]

def sql_text(value):
    return "'" + str(value).replace("'", "''") + "'"

def pg(sql):
    p = subprocess.run(['sudo', '-u', 'postgres', 'psql', '-X', '-At', '-v',
                        'ON_ERROR_STOP=1', '-d', DB], input=sql, text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout.strip()

def ch(query, **kwargs):
    return subprocess.run(['clickhouse-client', '--config-file=' + CONFIG, '--query', query],
                          check=True, **kwargs)

def fields(code):
    if 'PCS' in code:
        return [('power','交流有功功率','kW'),('reactive','无功功率','kvar'),
                ('voltage','交流电压','V'),('current','交流电流','A'),
                ('frequency','频率','Hz'),('dcVoltage','直流电压','V'),
                ('temperature','模块温度','°C'),('efficiency','效率','%'),
                ('dcCurrent','直流电流','A'),('voltageA','A相电压','V'),
                ('voltageB','B相电压','V'),('voltageC','C相电压','V'),
                ('insulation','绝缘阻抗','kΩ'),('powerFactor','功率因数','')]
    if 'BMS' in code or 'RACK' in code:
        return [('soc','荷电状态','%'),('soh','健康状态','%'),('dcVoltage','总电压','V'),
                ('current','电池电流','A'),('temperature','最高单体温度','°C'),
                ('cellVoltage','单体电压','V'),('insulation','绝缘电阻','kΩ'),
                ('dcCurrent','直流电流','A'),('tempDelta','电芯温差','°C'),
                ('power','充放电功率','kW'),('cycles','循环次数','次')]
    if 'MTR' in code:
        return [('power','有功功率','kW'),('reactive','无功功率','kvar'),('voltage','电压','V'),
                ('current','电流','A'),('frequency','频率','Hz'),('powerFactor','功率因数',''),
                ('energy','累计有功电量','kWh'),('voltageA','A相电压','V'),
                ('voltageB','B相电压','V'),('voltageC','C相电压','V'),('currentA','A相电流','A')]
    if 'FSS' in code:
        return [('temperature','环境温度','°C'),('humidity','相对湿度','%'),
                ('smoke','烟雾浓度','%/m'),('pressure','气瓶压力','MPa'),('loop','回路电阻','Ω'),
                ('co','CO浓度','ppm'),('h2','H2浓度','ppm'),('voltage','供电电压','V')]
    if 'HVAC' in code:
        return [('temperature','送风温度','°C'),('returnTemperature','回风温度','°C'),
                ('humidity','相对湿度','%'),('pressure','制冷剂压力','MPa'),
                ('speed','风机转速','rpm'),('power','输入功率','kW'),
                ('current','输入电流','A'),('voltage','供电电压','V')]
    return [('power','有功功率','kW'),('voltage','电压','V'),('current','电流','A'),
            ('temperature','工作温度','°C'),('energy','累计电量','kWh')]

def powers(hour, rated):
    pv = max(0, math.sin(math.pi * (hour - 6) / 12)) * rated * .6 if 6 < hour < 18 else 0
    load = rated * (.52 + .12 * math.sin((hour - 7) * math.pi / 12))
    # +/- 40% of a 2-hour battery's capacity daily, with bounded SOC and power.
    storage = -rated * .2 if hour < 4 else rated * .2 if 17 <= hour < 21 else 0
    soc = 30 + 10 * hour if hour < 4 else 70 if hour < 17 else 70 - 10 * (hour - 17) if hour < 21 else 30
    return pv, load, storage, soc

def value_for(device, field, timestamp, rated):
    local = dt.datetime.fromtimestamp(timestamp, dt.timezone(dt.timedelta(hours=8)))
    hour = local.hour + local.minute / 60
    pv, load, storage, soc = powers(hour, rated)
    wave = math.sin(timestamp / 3600)
    if field in ('storageTotal','pcsTotal'): return storage
    if field == 'socTotal': return soc
    if field == 'gridTotal': return load - pv - storage
    if field == 'pvTotal': return pv
    if field == 'loadTotal': return load
    if field == 'gridVoltage': return 400 + wave * 2
    if field == 'dcTotal': return 790 + soc * .4
    if field == 'maxTemperature': return 29 + abs(storage) / rated * 8 + wave
    power = (storage / 2 if 'PCS' in device else storage if 'BMS' in device else
             storage / 2 if 'RACK' in device else pv if 'PV' in device or 'DCDC' in device else
             load - pv - storage if 'GRID' in device or device == 'SIM-MTR-01' else
             4.2 + wave * .1 if 'HVAC' in device else load)
    if field == 'power': return power
    if field == 'reactive': return abs(power) * .08
    if field == 'soc': return soc
    if field == 'soh': return 98.2
    if field == 'voltage': return 24.1 if 'FSS' in device else 400 + wave * 2
    if field in ('voltageA','voltageB','voltageC'): return 400 + wave * 2 + {'voltageA':.8,'voltageB':-.2,'voltageC':.2}[field]
    if field == 'dcVoltage': return 790 + soc * .4
    if field == 'dcCurrent' or field == 'current' and ('BMS' in device or 'RACK' in device): return power * 1000 / (790 + soc * .4)
    if field in ('current','currentA'): return power * 1000 / (math.sqrt(3) * 400)
    if field == 'frequency': return 50 + wave * .015
    if field == 'temperature': return (22 if 'HVAC' in device else 29) + wave
    if field == 'returnTemperature': return 27 + wave
    if field == 'efficiency': return 97.6
    if field == 'cellVoltage': return 3.22 + soc * .001
    if field == 'insulation': return 1500 + wave * 20
    if field == 'humidity': return 46 + wave * 2
    if field == 'pressure': return 5.6 if 'FSS' in device else 1.25 + wave * .01
    if field == 'tempDelta': return (6.8 if 'RACK-02' in device else 2.4) + wave * .1
    if field == 'cycles': return 386 + math.floor((timestamp-1767225600)/86400)
    if field == 'co': return 2.1 + wave * .2
    if field == 'h2': return 1.2
    if field == 'smoke': return .01
    if field == 'loop': return 2.3
    if field == 'speed': return 1450 + wave * 15
    if field == 'powerFactor': return .9968
    if field == 'energy': return rated * (100 + (timestamp - 1767225600) / 86400 * 2)
    raise ValueError(field)

def main():
    os.umask(0o077)
    now = dt.datetime.now(dt.timezone.utc)
    end = int(now.timestamp()) // 300 * 300
    start = end - 30 * 86400
    backup = pathlib.Path('/var/backups/ems-cloud-v2-proto') / ('sim-devices-' + now.strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(parents=True)
    stations = json.loads(pg("SELECT json_agg(x) FROM (SELECT id,code,name,rated_power_kw FROM station WHERE code IN ('PROTO-001','PROTO-002') ORDER BY code) x"))
    assert len(stations) == 2 and all('原型' in s['name'] for s in stations), 'Unexpected target stations'
    # Before any mutation, save a complete relational backup and the target telemetry.
    with (backup / 'postgres.dump').open('wb') as output:
        subprocess.run(['sudo','-u','postgres','pg_dump','-Fc','-d',DB],stdout=output,check=True)
    ids = pg("SELECT coalesce(string_agg(p.id::text,','),'0') FROM measurement_point p JOIN device d ON d.id=p.device_id JOIN station s ON s.id=d.station_id WHERE s.code IN ('PROTO-001','PROTO-002')")
    with (backup / 'telemetry.native').open('wb') as output:
        ch(f'SELECT * FROM {CH} FINAL WHERE point_id IN ({ids}) FORMAT Native', stdout=output)
    script = ['BEGIN;', "SELECT pg_advisory_xact_lock(78291026);"]
    inventory = []
    for station in stations:
        sid = int(station['id'])
        for code, category, name in DEVICES:
            model = 'SIM-' + category + '-' + code.removeprefix('SIM-')
            manufacturer = sql_text(MANUFACTURER)
            # Never adopt a device from an unrelated manufacturer on code collision.
            script.append(f"DO $$ BEGIN IF EXISTS(SELECT 1 FROM device d LEFT JOIN device_model m ON m.id=d.model_id WHERE d.station_id={sid} AND d.code={sql_text(code)} AND (m.manufacturer IS NULL OR m.manufacturer NOT IN ({manufacturer},'原型设备'))) THEN RAISE EXCEPTION 'Unowned device code collision'; END IF; END $$;")
            script.append(f"INSERT INTO device_model(manufacturer,name,category) VALUES({manufacturer},{sql_text(model)},{sql_text(category)}) ON CONFLICT(manufacturer,name) DO NOTHING;")
            script.append(f"INSERT INTO device(station_id,model_id,code,name,serial_number) SELECT {sid},id,{sql_text(code)},{sql_text('[模拟]'+name)},{sql_text('SIM-'+station['code']+'-'+code)} FROM device_model WHERE manufacturer={manufacturer} AND name={sql_text(model)} ON CONFLICT(station_id,code) DO UPDATE SET model_id=excluded.model_id,name=excluded.name,serial_number=excluded.serial_number;")
            device_sql = f"(SELECT id FROM device WHERE station_id={sid} AND code={sql_text(code)})"
            script.append(f"INSERT INTO device_observation(device_id,observed_at,communication_status,health_score,firmware_version) VALUES({device_sql},now(),'online',98.2,'SIM-1.0.0') ON CONFLICT(device_id) DO UPDATE SET observed_at=excluded.observed_at,communication_status=excluded.communication_status,health_score=excluded.health_score,firmware_version=excluded.firmware_version;")
            script.append(f"INSERT INTO firmware_task(device_id,target_version,status,updated_at) SELECT {device_sql},'SIM-1.0.0','succeeded',now()-interval '7 days' WHERE NOT EXISTS(SELECT 1 FROM firmware_task WHERE device_id={device_sql} AND target_version='SIM-1.0.0');")
            spec = fields(code)
            if code == 'SIM-BMS-01':
                spec += [('storageTotal','储能功率','kW'),('pcsTotal','PCS功率','kW'),('socTotal','SOC','%'),('maxTemperature','最高单体温度','°C'),('dcTotal','直流母线电压','V')]
            if code == 'SIM-MTR-01': spec += [('gridTotal','电网功率','kW'),('gridVoltage','并网电压','V')]
            if code == 'SIM-MTR-02': spec += [('loadTotal','负荷功率','kW')]
            if code == 'SIM-PV-01': spec += [('pvTotal','光伏功率','kW')]
            for field, label, unit in spec:
                kind = 'sim_' + code.replace('-','_').lower() + '_' + field
                label = label if field.endswith('Total') or field in ('maxTemperature','gridVoltage') else name + '·' + label
                script.append(f"INSERT INTO measurement_kind(code,name,unit) VALUES({sql_text(kind)},{sql_text(label)},{sql_text(unit)}) ON CONFLICT(code) DO UPDATE SET name=excluded.name,unit=excluded.unit;")
                script.append(f"INSERT INTO measurement_point(device_id,kind_code,code) VALUES({device_sql},{sql_text(kind)},{sql_text('sim_'+field)}) ON CONFLICT(device_id,code) DO NOTHING;")
                inventory.append((sid, code, 'sim_'+field, field, float(station['rated_power_kw'])))
            # Explicitly labelled historical simulation, one record per device and day.
            script.append(f"INSERT INTO alarm(device_id,code,title,severity,occurred_at,recovered_at) VALUES({device_sql},'SIM-COMM-RECOVERED','[模拟]通信中断后恢复','info',date_trunc('day',now())-interval '1 day'+interval '2 hours',date_trunc('day',now())-interval '1 day'+interval '2 hours 5 minutes') ON CONFLICT(device_id,code,occurred_at) DO NOTHING;")
        for code, title, severity in [('SIM-RACK-02','电池簇温差偏高','warning'),('SIM-HVAC-01','温控维护提醒','info')]:
            script.append(f"INSERT INTO alarm(device_id,code,title,severity,occurred_at) SELECT id,'SIM-ACTIVE',{sql_text('[模拟]'+title)},{sql_text(severity)},date_trunc('day',now()) FROM device WHERE station_id={sid} AND code={sql_text(code)} AND NOT EXISTS(SELECT 1 FROM alarm WHERE device_id=device.id AND code='SIM-ACTIVE' AND recovered_at IS NULL) ON CONFLICT DO NOTHING;")
        edges = [('SIM-GRID-01','SIM-MTR-01'),('SIM-MTR-01','PCS-01'),('SIM-MTR-01','SIM-PCS-02'),('PCS-01','SIM-BMS-01'),('SIM-PCS-02','SIM-BMS-01'),('SIM-BMS-01','SIM-RACK-01'),('SIM-BMS-01','SIM-RACK-02'),('SIM-PV-01','SIM-DCDC-01'),('SIM-DCDC-01','SIM-MTR-01'),('SIM-MTR-01','SIM-MTR-02'),('SIM-MTR-02','SIM-LOAD-01'),('SIM-MTR-02','SIM-HVAC-01'),('SIM-MTR-02','SIM-FSS-01')]
        for source,target in edges:
            script.append(f"INSERT INTO topology_connection SELECT a.id,b.id FROM device a CROSS JOIN device b WHERE a.station_id={sid} AND b.station_id={sid} AND a.code={sql_text(source)} AND b.code={sql_text(target)} ON CONFLICT DO NOTHING;")
    script.append("INSERT INTO audit_event(action,detail) VALUES('simulation.seed','Explicit user-requested simulated device data: PROTO-001/002, SIM prefixes, 30-day history; no equipment dispatch');")
    script.append('COMMIT;')
    pg('\n'.join(script))
    points = json.loads(pg("SELECT json_agg(x) FROM (SELECT p.id,d.station_id,d.code device_code,p.code FROM measurement_point p JOIN device d ON d.id=p.device_id JOIN station s ON s.id=d.station_id WHERE s.code IN ('PROTO-001','PROTO-002')) x"))
    lookup = {(p['station_id'],p['device_code'],p['code']):p['id'] for p in points}
    for station in stations:
        if (station['id'],'PCS-01','power') in lookup:
            inventory.append((station['id'],'PCS-01','power','power',float(station['rated_power_kw'])))
    # Stage one bulk insert locally; replacing keys make repeats logically idempotent.
    count = 0
    revision = int(now.timestamp()*1000)
    with tempfile.TemporaryFile(mode='w+b') as samples:
        for sid, device, code, field, rated in inventory:
            point = lookup[(sid,device,code)]
            for timestamp in range(start,end+1,300):
                value = value_for(device,field,timestamp,rated)
                assert math.isfinite(value)
                stamp = dt.datetime.fromtimestamp(timestamp,dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S.000')
                samples.write(f'{point}\t{stamp}\t{value:.6f}\t{revision}\n'.encode())
                count += 1
        samples.seek(0)
        ch(f'INSERT INTO {CH} (point_id,sampled_at,value,revision) FORMAT TabSeparated',stdin=samples)
    report = {'database':DB,'telemetry_table':CH,'stations':stations,'devices_per_station':len(DEVICES),
              'seeded_points':len(inventory),'inserted_samples':count,'step_minutes':5,
              'from_utc':dt.datetime.fromtimestamp(start,dt.timezone.utc).isoformat(),
              'to_utc':dt.datetime.fromtimestamp(end,dt.timezone.utc).isoformat(),'backup':str(backup)}
    (backup/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    summary=pg("SELECT json_agg(x) FROM (SELECT s.code,count(DISTINCT d.id) devices,count(DISTINCT p.id) points,count(DISTINCT m.category) categories FROM station s JOIN device d ON d.station_id=s.id JOIN device_model m ON m.id=d.model_id LEFT JOIN measurement_point p ON p.device_id=d.id WHERE s.code IN ('PROTO-001','PROTO-002') GROUP BY s.code) x")
    print(summary)
    expected = ','.join(str(lookup[(sid,device,code)]) for sid,device,code,_,_ in inventory)
    ch(f'SELECT count() samples,uniqExact(point_id) points,min(sampled_at),max(sampled_at),countIf(NOT isFinite(value)) invalid FROM {CH} FINAL WHERE point_id IN ({expected}) FORMAT JSONEachRow')

if __name__ == '__main__':
    main()
