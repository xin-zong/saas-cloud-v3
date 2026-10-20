"""Additive dashboard mock v3; never updates telemetry, reference captures or v1.

All power is W in original rows; energy summary is Wh; dashboardSupplement uses
kW/kWh. Weather is deterministic database-mock, not an external observation.
"""
import argparse,copy,json,math,subprocess,sys
from pathlib import Path
from datetime import date,datetime,timedelta
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[2]
DATASET='station-dashboard-supplement'
VERSION=3
SUMMARY_KEYS={'day':'stationStatisticDay','week':'stationStatisticWeekDto','month':'stationStatisticMonthDto','year':'stationStatisticYearDto','total':'stationStatisticTotalDto'}
ENERGY=('generationValue','useValue','gridValue','buyValue','chargeValue','dischargeValue','selfUseValue','selfSupplyValue')
def energy_summary(rows):
 def integral(key,positive=False,negative=False):
  if not rows or any(r.get(key) is None for r in rows):return None
  values=[float(r[key]) for r in rows]
  return round(sum(max(-v,0) if negative else max(v,0) if positive else v for v in values)/12,6)
 gen=integral('generationPower');use=integral('usePower');buy=integral('wirePower',positive=True);export=integral('wirePower',negative=True)
 return dict(generationValue=gen,useValue=use,gridValue=export,buyValue=buy,chargeValue=integral('batteryPower',positive=True),dischargeValue=integral('batteryPower',negative=True),selfUseValue=round(gen-export,6) if gen is not None and export is not None and gen>=export else None,selfSupplyValue=round(use-buy,6) if use is not None and buy is not None and use>=buy else None)
def flow(rows):
 r=rows[-1] if rows else {}
 def kw(key):return r[key]/1000 if r.get(key) is not None else None
 return dict(gridKw=kw('wirePower'),loadKw=kw('usePower'),pcsKw=kw('pcsPower'),mpptKw=kw('mpptGenerationPower'),batteryKw=kw('batteryPower'),solarKw=kw('generationPower') if r.get('generationPower') is not None else kw('mpptGenerationPower'),batterySoc=r.get('batterySoc'),convention='import-charge-positive')
def aggregate(rows):
 return {k:round(sum(r[k] for r in rows),6) if rows and all(r.get(k) is not None for r in rows) else None for k in ENERGY}
def mock_day(d,station,has_solar):
 start=datetime.combine(d,datetime.min.time(),ZoneInfo(station['timezone'])).timestamp();rated=float(station['rated'] or 0);solar=float(station['solar'] if station['solar'] is not None else rated*.7);variation=.8+((d.toordinal()+station['id'])%9)/50;rows=[]
 for minute in range(0,1440,5):
  h=minute/60;pv=max(0,math.sin((h-6)*math.pi/12))*solar*.75*variation if has_solar and 6<h<18 else 0
  battery=rated*(.22 if 2<=h<5 else -.32 if 9<=h<13 else -.25 if 16<=h<18 else 0)*variation;load=rated*(.18+.08*max(0,math.sin((h-6)*math.pi/12)))*variation
  rows.append(dict(dateTime=int(start+minute*60),batteryPower=round(battery*1000,6),wirePower=round((load+battery-pv)*1000,6),usePower=round(load*1000,6),generationPower=round(pv*1000,6) if has_solar else None,mpptGenerationPower=None,batterySoc=round(60+min(max(h-2,0),3)*8-min(max(h-9,0),4)*9-min(max(h-16,0),2)*8,2)))
 return rows
def iso_day(row):
 return datetime.strptime(str(row['acceptDay']),'%Y%m%d').date().isoformat()
def kwh(value):return value/1000 if value is not None else None
def build_records(station,baseline):
 records={(p,k):copy.deepcopy(v) for p,k,v,ds in baseline};legacy={(p,k) for p,k,v,ds in baseline if ds=='storage-three-charts'}
 daykeys=sorted(k for p,k in records if p=='day')
 if not daykeys:return []
 latest=date.fromisoformat(daykeys[-1]);has_solar=any(r.get('generationPower') is not None for p,k in records if p=='day' for r in records[p,k].get('stationStatisticPowerList',[]));daily={}
 for (p,k),v in records.items():
  if p=='month':
   for r in v.get('stationStatisticDayDtoList',[]):
    d=iso_day(r);power=records.get(('day',d),{}).get('stationStatisticPowerList')
    power=power if power is not None else mock_day(date.fromisoformat(d),station,has_solar)
    daily[d]={**r,**energy_summary(power)}
 for (p,k),v in records.items():
  if p=='day':
   if (p,k) not in legacy:v['stationStatisticDay']={**v.get('stationStatisticDay',{}),**energy_summary(v.get('stationStatisticPowerList',[]))}
   daily[k]={**v.get('stationStatisticDay',{}),**energy_summary(v.get('stationStatisticPowerList',[]))}
 for (p,k),v in records.items():
  if (p,k) in legacy or p=='day':continue
  if p in ('week','month'):
   old=v.get('stationStatisticDayDtoList',[]);v['stationStatisticDayDtoList']=[{**r,**daily.get(iso_day(r),{})} for r in old]
   v[SUMMARY_KEYS[p]]={**v.get(SUMMARY_KEYS[p],{}),**aggregate(v['stationStatisticDayDtoList'])}
 for (p,k),v in records.items():
  if p=='year':
   months=[{**mv[SUMMARY_KEYS['month']],'month':int(mk[-2:]),'year':int(mk[:4])} for (mp,mk),mv in sorted(records.items()) if mp=='month' and mk.startswith(k)]
   v['stationStatisticMonthDtoList']=months;v[SUMMARY_KEYS[p]]={**v.get(SUMMARY_KEYS[p],{}),**aggregate(months)}
 years=[{**v[SUMMARY_KEYS['year']],'year':int(k)} for (p,k),v in sorted(records.items()) if p=='year']
 if years:records['total',f"{min(r['year'] for r in years)}:{max(r['year'] for r in years)}"]=dict(stationStatisticYearDtoList=years,stationStatisticTotalDto=aggregate(years))
 def full(period,day):
  selected=[(d,r) for d,r in sorted(daily.items()) if d<=day and (d>=str(date.fromisoformat(day)-timedelta(days=6)) if period=='week' else d.startswith(day[:7] if period=='month' else day[:4]))]
  cap=station['solar'];rows=[dict(date=d,value=kwh(r.get('generationValue'))/cap if cap and r.get('generationValue') is not None else None,weather='clear') for d,r in selected]
  vals=[r['value'] for r in rows];return dict(rows=rows,total=sum(vals) if vals and all(v is not None for v in vals) else None,ranking=[])
 def grid_rows(period,key):
  value=records.get((period,key),{});field={'day':'stationStatisticPowerList','month':'stationStatisticDayDtoList','year':'stationStatisticMonthDtoList','total':'stationStatisticYearDtoList'}[period]
  out=[]
  for r in value.get(field,[]):
   label=str(r.get('dateTime')) if period=='day' else iso_day(r) if period=='month' else f"{r.get('year',key)}-{int(r['month']):02}" if period=='year' else str(r['year'])
   out.append(dict(date=label,powerFactor=None,activeKw=r.get('wirePower')/1000 if r.get('wirePower') is not None else None,reactiveKvar=None,buyKwh=kwh(r.get('buyValue')),exportKwh=kwh(r.get('gridValue')),positiveReactiveKvarh=None,negativeReactiveKvarh=None))
  return out
 for (p,k),v in records.items():
  if p!='day':continue
  power=v.get('stationStatisticPowerList',[]);f=flow(power);d=date.fromisoformat(k);last=power[-1].get('dateTime') if power else None;updated=datetime.fromtimestamp(last,ZoneInfo(station['timezone'])).isoformat() if last else None
  month=records.get(('month',k[:7]),{}).get(SUMMARY_KEYS['month'],{});year=records.get(('year',k[:4]),{}).get(SUMMARY_KEYS['year'],{});summary=daily.get(k,{});cap=station['solar']
  # A card read from an older day still contains the whole saved month aggregate.
  # Its coverage and freshness must follow those contributing rows, not the day.
  monthly_payload=records.get(('month',k[:7]),{})
  monthly_dates=sorted(iso_day(row) for row in monthly_payload.get('stationStatisticDayDtoList',[]))
  month_from=monthly_dates[0] if monthly_dates else None
  month_to=monthly_dates[-1] if monthly_dates else None
  month_updated=None
  if month_to:
   end_day=records.get(('day',month_to))
   end_power=end_day.get('stationStatisticPowerList',[]) if end_day is not None else mock_day(date.fromisoformat(month_to),station,has_solar)
   end_time=end_power[-1].get('dateTime') if end_power else None
   if end_time is not None:month_updated=datetime.fromtimestamp(end_time,ZoneInfo(station['timezone'])).isoformat()
  weather=dict(location=station['name'],updatedAt=updated,temperatureC=18,condition='clear',sunrise='06:30',sunset='18:30',daylightHours=12,windSpeedMs=2.4,forecast=[dict(date=str(d+timedelta(days=i)),lowC=12+i%3,highC=22+i%4,condition='clear' if i%3 else 'cloudy') for i in range(7)])
  total=next((value for (period,key),value in records.items() if period=='total'),{});total_summary=total.get(SUMMARY_KEYS['total'],{})
  plans={period:dict(rows=[dict(date=str(r.get('year',k[:4])) if period=='total' else f"{k[:4]}-{int(r['month']):02}",actualKwh=kwh(r.get('generationValue')),plannedKwh=None,completionPercent=None) for r in (total.get('stationStatisticYearDtoList',[]) if period=='total' else records.get(('year',k[:4]),{}).get('stationStatisticMonthDtoList',[]))],actualKwh=kwh((total_summary if period=='total' else year).get('generationValue')),plannedKwh=None) for period in ('year','total')}
  v['dashboardSupplement']=dict(source='database-mock',datasetId=DATASET,datasetVersion=VERSION,updatedAt=updated,timezone=station['timezone'],provenance='Derived mock; not measured. Legacy accepted chart rows and summaries preserved; missing energy remains null.',summary=energy_summary(power),flow=f,weather=weather,solar=dict(normalizationPercent=f['solarKw']/cap*100 if cap and f['solarKw'] is not None else None,powerKw=f['solarKw'],fullHoursDay=kwh(summary.get('generationValue'))/cap if cap and summary.get('generationValue') is not None else None,capacityKw=cap,dailyKwh=kwh(summary.get('generationValue')),totalKwh=kwh(total_summary.get('generationValue'))),fullHours={period:full(period,k) for period in ('week','month','year')},pr={period:dict(rows=[],value=None) for period in ('week','month','year')},generationPlan=plans,grid=dict(instant=dict(powerFactor=None,activeKw=f['gridKw'],reactiveKvar=None,direction='import' if f['gridKw']>0 else 'export' if f['gridKw']<0 else 'idle') if f['gridKw'] is not None else dict(powerFactor=None,activeKw=None,reactiveKvar=None,direction=None),month=dict(fromDate=month_from,toDate=month_to,updatedAt=month_updated,powerFactor=None,buyKwh=kwh(month.get('buyValue')),exportKwh=kwh(month.get('gridValue')),positiveReactiveKvarh=None,negativeReactiveKvarh=None),history={period:grid_rows(period,{'day':k,'month':k[:7],'year':k[:4],'total':next((key for per,key in records if per=='total'),k[:4]+':'+k[:4])}[period]) for period in ('day','month','year','total')}))
  v['dashboardSupplement']['grid']['month']['from']=v['dashboardSupplement']['grid']['month'].pop('fromDate');v['dashboardSupplement']['grid']['month']['to']=v['dashboardSupplement']['grid']['month'].pop('toDate')
 return [(p,k,v) for (p,k),v in sorted(records.items())]
def run(conn,apply=False):
 if subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()!='develop-toyingzhen':raise RuntimeError('Branch guard failed')
 with conn.cursor() as c:
  c.execute('select current_database(),current_user')
  if c.fetchone()!=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner'):raise RuntimeError('Database identity guard failed')
  c.execute('select pg_advisory_xact_lock(78291066)');reports=[]
  c.execute('select distinct on(station_id,period,period_key) station_id,period,period_key,payload,dataset_id,timezone from station_history_mock_dataset where station_id between 16 and 22 and dataset_version<2 order by station_id,period,period_key,dataset_version desc,created_at desc');baseline=c.fetchall()
  c.execute('select st.id,st.name,sp.timezone,st.rated_power_kw,st.capacity_kwh,sp.solar_capacity_kw from station st join station_profile sp on sp.station_id=st.id where st.id between 16 and 22 and st.archived_at is null');stations=c.fetchall()
  if len(stations)!=7:raise RuntimeError('Expected seven active stations')
  for sid,name,zone,rated,capacity,solar in stations:
   base=[(p,k,v,ds) for station,p,k,v,ds,z in baseline if station==sid];records=build_records(dict(id=sid,name=name,timezone=zone,rated=rated,capacity=float(capacity) if capacity is not None else None,solar=float(solar) if solar is not None else None),base)
   for period,key,payload in records:
    if apply:
     c.execute('insert into station_history_mock_dataset(station_id,dataset_id,dataset_version,period,period_key,timezone,payload) values(%s,%s,%s,%s,%s,%s,%s::jsonb) on conflict do nothing',(sid,DATASET,VERSION,period,key,zone,json.dumps(payload,ensure_ascii=False)))
     c.execute('select payload from station_history_mock_dataset where station_id=%s and dataset_id=%s and dataset_version=%s and period=%s and period_key=%s',(sid,DATASET,VERSION,period,key))
     if c.fetchone()[0]!=payload:raise RuntimeError('Immutable dataset conflict; create new version')
   reports.append(dict(stationId=sid,records=len(records),days=sum(p=='day' for p,k,v in records),latest=max(k for p,k,v in records if p=='day')))
 return dict(source='database-mock',datasetId=DATASET,version=VERSION,mode='apply' if apply else 'preview',stations=reports)
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');args=parser.parse_args();sys.path.insert(0,str(ROOT/'.local-tools/implementation'));from toyingzhen_db import connect
 with connect() as conn:
  result=run(conn,args.apply)
  if args.apply:(ROOT/f'.local-tools/implementation/dashboard-supplement-seed-v{VERSION}-private.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
  print(json.dumps(result))
if __name__=='__main__':main()




