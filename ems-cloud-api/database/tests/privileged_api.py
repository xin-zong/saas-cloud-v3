"""Run only with temporary reviewer/market grants prepared in the new prototype database."""
import os,json,urllib.request,urllib.error,uuid,datetime
base=os.environ.get('EMS_TEST_API','http://127.0.0.1:18090/api');password=os.environ['EMS_TEST_PASSWORD'];area=int(os.environ['EMS_TEST_MARKET_AREA'])
def req(method,path,data=None,token=None,status=200):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    request=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=25) as response: actual=response.status; result=json.load(response)
    except urllib.error.HTTPError as error: actual=error.code;result=json.load(error)
    assert actual==status,(path,actual,result.get('msg'))
    return result['data']
operator=req('POST','/auth/login',{'account':'operator@prototype.local','password':password})['token']
integrator=req('POST','/auth/login',{'account':'integrator@prototype.local','password':password})['token']
station=req('GET','/stations',token=operator)[0];sid=station['id'];rating=float(station['rated_power_kw'])
plan=req('POST','/plans',{'stationId':sid,'date':'2026-09-23','kind':'dayAhead','periods':[{'startMinute':0,'endMinute':60,'mode':'charge','powerKw':10}]},operator)['id']
approval=req('POST',f'/plans/{plan}/submit',{},operator)['approvalId']
before=next(row for row in req('GET','/approvals',token=integrator) if row['id']==approval)
assert before['station_id']==sid and before['station_name']==station['name'] and before['requester_name']
req('POST',f'/approvals/{approval}/decision',{'decision':'approved','note':'must not self approve'},operator,403)
req('POST',f'/approvals/{approval}/decision',{'decision':'approved','note':'independent test review'},integrator)
after=next(row for row in req('GET','/approvals',token=integrator) if row['id']==approval)
assert after['status']=='approved' and after['decider_name'] and after['note']=='independent test review'
first=req('GET','/approvals?limit=1&offset=0',token=integrator)
second=req('GET','/approvals?limit=1&offset=1',token=integrator)
assert len(first)==len(second)==1 and first[0]['id']!=second[0]['id']
req('POST',f'/approvals/{approval}/decision',{'decision':'rejected','note':'already reviewed'},integrator,409)
start=datetime.datetime.now(datetime.timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)+datetime.timedelta(days=1)
created=[]
def draft(a,b,capacity,status=200):
    result=req('POST','/market-drafts',{'stationId':sid,'areaId':area,'eventCode':'integration-'+uuid.uuid4().hex,'name':'Integration capacity test','kind':'response','startsAt':(start+datetime.timedelta(hours=a)).isoformat(),'endsAt':(start+datetime.timedelta(hours=b)).isoformat(),'capacityKw':capacity},integrator,status)
    if status==200:created.append(result['id'])
    return result
try:
    draft(0,1,rating*0.6);draft(1,2,rating*0.6);draft(0,2,rating*0.4)
    a=req('GET',f'/stations/{sid}/market-services?limit=1&offset=0',token=integrator)
    b=req('GET',f'/stations/{sid}/market-services?limit=1&offset=1',token=integrator)
    assert len(a)==len(b)==1 and a[0]['id']!=b[0]['id']
    draft(0,2,1,409)
    edit={'name':station['name'],'ratedPowerKw':rating-1,'capacityKwh':station['capacity_kwh'],'region':station['region'],'address':station['address'],'longitude':station['longitude'],'latitude':station['latitude']}
    req('PUT',f'/stations/{sid}',edit,integrator,409)
finally:
    for service in created:req('POST',f'/market-drafts/{service}/cancel',{},integrator)
print('PASS: actual reviewer self-approval denial, independent review, adjacent market capacity and committed power reduction guard')
