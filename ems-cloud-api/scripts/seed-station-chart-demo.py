"""Versioned mock chart dataset for isolated UI acceptance; never reference telemetry."""
import argparse,importlib.util,json,math,subprocess
from pathlib import Path
from datetime import date,datetime,timedelta
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[2]
def dataset(day,zone):
 start=datetime.combine(day,datetime.min.time(),ZoneInfo(zone)).timestamp()
 anchors=[(0,0),(480,-2),(540,-5),(570,-32),(595,-28),(600,-52),(610,-41),(655,-42),(680,-9),(730,-16),(780,-11),(820,0),(940,-1),(950,-32),(975,-36),(1000,-31),(1015,-2),(1080,0)]
 def interpolate(minute):
  for (x,a),(y,b) in zip(anchors,anchors[1:]):
   if x<=minute<=y:return a+(b-a)*(minute-x)/(y-x)
  return 0
 power=[]
 for minute in range(0,1081,5):
  battery=interpolate(minute); load=max(0,-battery+1+math.sin(minute/17)*.4)
  pv=max(0,min(51,(minute-500)/5.8)) if 500<minute<800 else max(0,(830-minute)/30*23) if 800<=minute<830 else max(0,-battery) if 950<=minute<=1010 else 0
  soc=94-15*max(0,1-abs(minute-670)/140) if minute<820 else 100
  power.append(dict(dateTime=int(start+minute*60),batteryPower=round(battery*1000,2),usePower=round(load*1000,2),wirePower=round((.8+math.sin(minute/40)*.15)*1000,2),mpptGenerationPower=round(pv*1000,2),batterySoc=round(soc,2)))
 charge=[.3,.2,.6,.5,1.5,.3,.3]; discharge=[145,64,140,225,56,190,26.1]; ratio=[46,25,63,73,40,65,40.38]
 rows=[]
 for i in range(7):
  d=day-timedelta(days=7-i);rows.append(dict(acceptDay=d.strftime('%Y%m%d'),day=d.day,month=d.month,chargeValue=round(charge[i]*1000),dischargeValue=round(discharge[i]*1000),chargeDischargeEfficiency=1,chargeDuration=360000,dischargeDuration=round((ratio[i]*.24-.1)*3600000),chargeDischargeUtilizationRatio=ratio[i]/100))
 def summary(items):return dict(chargeValue=sum(r['chargeValue'] for r in items),dischargeValue=sum(r['dischargeValue'] for r in items),chargeDischargeEfficiency=1,chargeDischargeUtilizationRatio=round(sum(r['chargeDischargeUtilizationRatio'] for r in items)/len(items),8))
 return [('day',day.isoformat(),dict(stationStatisticPowerList=power,stationStatisticDay={})),('week',(day-timedelta(days=1)).isoformat(),dict(stationStatisticDayDtoList=rows,stationStatisticWeekDto=summary(rows)))]
def profile_dataset(day,zone,rated,capacity,solar,has_solar,station_key):
 """Deterministic per-station mock. All periods derive from the same daily model."""
 rated=max(float(rated or 0),0);capacity=max(float(capacity or 0),0)
 solar=float(solar) if solar is not None else rated*.7
 def daily(d):
  start=datetime.combine(d,datetime.min.time(),ZoneInfo(zone)).timestamp();rows=[]
  variation=.8+((d.toordinal()+station_key)%9)/50
  for minute in range(0,1440,5):
   hour=minute/60
   pv=max(0,math.sin((hour-6)*math.pi/12))*solar*.75*variation if has_solar and 6<hour<18 else 0
   battery=rated*(.22 if 2<=hour<5 else -.32 if 9<=hour<13 else -.25 if 16<=hour<18 else 0)*variation
   load=rated*(.18+.08*max(0,math.sin((hour-6)*math.pi/12)))*variation
   grid=load+battery-pv
   soc=60+min(max(hour-2,0),3)*8-min(max(hour-9,0),4)*9-min(max(hour-16,0),2)*8
   rows.append(dict(dateTime=int(start+minute*60),batteryPower=round(battery*1000,6),wirePower=round(grid*1000,6),usePower=round(load*1000,6),generationPower=round(pv*1000,6) if has_solar else None,mpptGenerationPower=None,batterySoc=round(soc,2)))
  charge=sum(max(0,r['batteryPower']) for r in rows)/12;discharge=sum(max(0,-r['batteryPower']) for r in rows)/12
  summary=dict(acceptDay=d.strftime('%Y%m%d'),day=d.day,month=d.month,year=d.year,chargeValue=round(charge,6),dischargeValue=round(discharge,6),generationValue=round(sum(r['generationPower'] or 0 for r in rows)/12,6),useValue=round(sum(r['usePower'] for r in rows)/12,6),chargeDuration=sum(r['batteryPower']>0 for r in rows)*300000,dischargeDuration=sum(r['batteryPower']<0 for r in rows)*300000,chargeDischargeEfficiency=.94,chargeDischargeUtilizationRatio=9/24)
  return rows,summary
 def aggregate(items):
  result={key:round(sum(r[key] for r in items),6) for key in ['chargeValue','dischargeValue','generationValue','useValue','chargeDuration','dischargeDuration']}
  result.update(chargeDischargeEfficiency=.94,chargeDischargeUtilizationRatio=sum(r['chargeDischargeUtilizationRatio'] for r in items)/len(items));return result
 days={};cursor=date(day.year,1,1)
 while cursor<=day:
  rows,summary=daily(cursor);days[cursor]=summary;cursor+=timedelta(days=1)
 result=[]
 for offset in range(8):
  d=day-timedelta(days=offset);rows,summary=daily(d);result.append(('day',d.isoformat(),dict(stationStatisticPowerList=rows,stationStatisticDay=summary)))
 week=[daily(day-timedelta(days=i))[1] for i in range(7,0,-1)]
 result.append(('week',(day-timedelta(days=1)).isoformat(),dict(stationStatisticDayDtoList=week,stationStatisticWeekDto=aggregate(week))))
 months=[]
 for month in range(1,day.month+1):
  items=[v for d,v in days.items() if d.month==month];summary=aggregate(items);summary.update(month=month,year=day.year)
  result.append(('month',f'{day.year}-{month:02}',dict(stationStatisticDayDtoList=items,stationStatisticMonthDto=summary)));months.append(summary)
 result.append(('year',str(day.year),dict(stationStatisticMonthDtoList=months,stationStatisticYearDto=aggregate(months))))
 return result

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--station-id',required=True,type=int);p.add_argument('--date',required=True);p.add_argument('--timezone',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
 assert subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()=='develop-toyingzhen'
 records=dataset(date.fromisoformat(a.date),a.timezone)
 print(json.dumps({'mode':'apply' if a.apply else 'preview','source':'database-mock','station':a.station_id,'dataset':'storage-three-charts','version':1,'periods':[(p,k,len(v.get('stationStatisticPowerList',v.get('stationStatisticDayDtoList',[])))) for p,k,v in records]}))
 if not a.apply:return
 import psycopg
 spec=importlib.util.spec_from_file_location('guard',ROOT/'scripts/migrate-toyingzhen.py');guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard);cfg=guard.settings(ROOT/'ems-cloud-api/.env')
 with psycopg.connect(host='127.0.0.1',port=15435,dbname='ems_cloud_saas_toyingzhen',user='ems_toyingzhen_owner',password=cfg['EMS_DB_PASSWORD']) as conn:
  with conn.cursor() as c:
   c.execute('select current_database(),current_user');assert c.fetchone()==('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner')
   c.execute('select id from station where id=%s and archived_at is null',(a.station_id,));assert c.fetchone()==(a.station_id,)
   for period,key,payload in records:c.execute('insert into station_history_mock_dataset(station_id,dataset_id,dataset_version,period,period_key,timezone,payload) values(%s,%s,1,%s,%s,%s,%s::jsonb) on conflict do nothing',(a.station_id,'storage-three-charts',period,key,a.timezone,json.dumps(payload)))
if __name__=='__main__':main()
