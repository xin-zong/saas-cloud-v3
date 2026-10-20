"""Idempotent, isolated dashboard fixture. Run with --apply or --rollback.

Uses the local guarded connection helper; never connects to an original database.
Rollback deletes only this immutable dataset, and leaves structure/canonical data intact.
"""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.local-tools/implementation'))
DATASET = 'station-dashboard-xinjiang261-v1'
VERSION = 1

def metric(key, label, unit, value=None, period='instant'):
    return dict(key=key, label=label, unit=unit, period=period, value=value,
                status='missing' if value is None else 'mocked')

def payload():
    panels = [dict(key='pcs',label='PCS',metrics=[metric('power','功率','kW',0.8)]),
              dict(key='mppt',label='MPPT',metrics=[metric('power','功率','kW',0)]),
              dict(key='battery',label='电池',metrics=[
                  metric('soc','SOC','%',93),metric('soh','SOH','%',97.5),metric('power','功率','kW',1.4),
                  metric('dailyCharge','日充电量','kWh',34,'day'),metric('dailyDischarge','日放电量','kWh',35,'day'),
                  metric('capacity','额定容量','kWh',261,'rated'),metric('availableCharge','可充电量','kWh',18.7),
                  metric('availableDischarge','可放电量','kWh',242.5)]),
              dict(key='load',label='用电',metrics=[metric('power','功率','kW',1.3),metric('dailyEnergy','日用电量','kWh',None,'day')]),
              dict(key='grid',label='电网',metrics=[metric('power','功率','kW',0.5),metric('dailyImport','日购电量','kWh',None,'day'),metric('dailyExport','日上网电量','kWh',None,'day')])]
    return dict(sourceTime='2026-10-18T23:30:00+08:00',timezone='Asia/Shanghai',name='新疆261机柜',address='新疆',
                commissionedOn='2026-10-07',ratedPowerKw=100,capacityKwh=261,
                modules=['dashboard','substations','devices','alarms','energy','analysis','wiring','logs','settings'],
                scenes=['storage','grid'],communicationState='online',operatingState=None,alarmState='normal',batteryState='discharging',
                panels=panels,flow=dict(gridKw=0.5,loadKw=1.3,pcsKw=0.8,mpptKw=0,batteryKw=1.4))

def run(connection, rollback=False):
    with connection.cursor() as cur:
        cur.execute('select current_database(),current_user')
        if cur.fetchone()!=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner'):
            raise RuntimeError('Database identity guard failed')
        cur.execute('select pg_advisory_xact_lock(78291051)')
        cur.execute('select id from station where name=%s and archived_at is null',('新疆261机柜',))
        matches=cur.fetchall()
        if len(matches)!=1: raise RuntimeError('Fixture station must resolve uniquely')
        station=matches[0][0]
        if rollback:
            cur.execute('delete from station_dashboard_read_model where station_id=%s and dataset_id=%s and dataset_version=%s', (station,DATASET,VERSION))
        else:
            cur.execute('''insert into station_dashboard_read_model(station_id,dataset_id,dataset_version,source_time,payload)
                values(%s,%s,%s,%s,%s::jsonb) on conflict(station_id,dataset_id,dataset_version) do nothing''',
                (station,DATASET,VERSION,payload()['sourceTime'],json.dumps(payload(),ensure_ascii=False)))
            cur.execute('select payload from station_dashboard_read_model where station_id=%s and dataset_id=%s and dataset_version=%s',(station,DATASET,VERSION))
            if cur.fetchone()[0]!=payload(): raise RuntimeError('Dataset conflict: existing version differs; create a new reviewed version')
        return dict(stationId=station,datasetId=DATASET,version=VERSION,action='rollback' if rollback else 'seed')

if __name__=='__main__':
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--apply',action='store_true');group.add_argument('--rollback',action='store_true')
    args=parser.parse_args()
    from toyingzhen_db import connect
    with connect() as connection: print(json.dumps(run(connection,args.rollback)))
