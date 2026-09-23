"""Real API/new-database regression. Requires explicit prototype credentials in env."""
import os,json,urllib.request,urllib.error,uuid,datetime
from concurrent.futures import ThreadPoolExecutor

base=os.environ.get('EMS_TEST_API','http://127.0.0.1:18090/api')
password=os.environ['EMS_TEST_PASSWORD']
count=0
def request(method,path,data=None,token=None,status=200):
    global count
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=25) as res: actual=res.status; body=json.load(res)
    except urllib.error.HTTPError as error:actual=error.code;body=json.load(error)
    assert actual==status, f'{method} {path}: expected {status}, got {actual}; {body.get("msg")}'
    assert body['code']==status
    count+=1
    return body['data']

request('GET','/stations',status=401)
request('POST','/auth/login',{'account':'owner@prototype.local','password':'invalid'},status=401)
tokens={}
for role in ('owner','operator','integrator'):
    result=request('POST','/auth/login',{'account':role+'@prototype.local','password':password})
    tokens[role]=result['token']
owner,operator,integrator=[tokens[x] for x in ('owner','operator','integrator')]
one=request('GET','/stations',token=owner)
all_stations=request('GET','/stations',token=integrator)
assert len(one)==1 and len(all_stations)==2,'station grants ignored'
station=one[0]['id']; other=next(x['id'] for x in all_stations if x['id']!=station)
request('GET',f'/stations/{other}',token=owner,status=403)
request('POST','/work-orders',{'stationId':station,'title':'No rights','description':'Denied'},owner,403)
name='integration-'+str(uuid.uuid4())[:8]
order=request('POST','/work-orders',{'stationId':station,'title':name,'description':'Integration test'},operator)['id']
request('POST',f'/work-orders/{order}/transition',{'expectedStatus':'pending','status':'completed','note':'illegal skip'},operator,409)
request('POST',f'/work-orders/{order}/transition',{'expectedStatus':'pending','status':'processing','note':'accept'},operator)
request('POST',f'/work-orders/{order}/transition',{'expectedStatus':'pending','status':'cancelled','note':'stale update'},operator,409)
request('POST',f'/work-orders/{order}/transition',{'expectedStatus':'processing','status':'completed','note':'verified'},operator)
assert len(request('GET',f'/work-orders/{order}/events',token=operator))==3
request('POST',f'/work-orders/{order}/notes',{'note':'Persisted follow-up'},operator)
assert request('GET',f'/work-orders/{order}/events',token=operator)[-1]['note']=='Persisted follow-up'
request('POST',f'/work-orders/{order}/transition',{'expectedStatus':'completed','status':'processing','note':'reopen'},operator,409)
alarms=request('GET',f'/stations/{station}/alarms',token=operator)
if alarms:
    request('POST',f'/alarms/{alarms[0]["id"]}/acknowledge',{},operator)
    request('POST',f'/alarms/{alarms[0]["id"]}/notes',{'note':'Persisted alarm follow-up'},operator)
    assert request('GET',f'/alarms/{alarms[0]["id"]}/notes',token=operator)[-1]['body']=='Persisted alarm follow-up'
    request('POST',f'/alarms/{alarms[0]["id"]}/notes',{'note':'No write permission'},owner,403)
    request('POST',f'/alarms/{alarms[0]["id"]}/acknowledge',{},operator)
plan={'stationId':station,'date':'2026-09-23','kind':'dayAhead','periods':[{'startMinute':0,'endMinute':60,'mode':'charge','powerKw':50}]}
pid=request('POST','/plans',plan,operator)['id']
request('GET',f'/stations/{station}/plans',token=operator,status=400)
bad_plan=plan|{'periods':[None]}
request('POST','/plans',bad_plan,operator,400)
with ThreadPoolExecutor(max_workers=2) as executor:
    created=list(executor.map(lambda _:request('POST','/plans',plan,operator),range(2)))
assert len({item['version'] for item in created})==2,'concurrent plan versions collided'
plan['periods'].append({'startMinute':30,'endMinute':90,'mode':'charge','powerKw':40})
request('POST','/plans',plan,operator,400)
approval=request('POST',f'/plans/{pid}/submit',{},operator)['approvalId']
request('POST',f'/approvals/{approval}/decision',{'decision':'approved','note':'self approval'},operator,403)
request('PUT','/settings',{'key':'integration.preference','value':name},owner)
assert request('GET','/settings',token=owner)['integration.preference']==name
inspection=request('POST','/inspections',{'stationId':station,'title':name,'dueAt':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1)).isoformat()},operator)['id']
request('POST',f'/inspections/{inspection}/complete',{'note':'verified'},operator)
request('POST',f'/inspections/{inspection}/complete',{'note':'repeat'},operator,409)
cancelled=request('POST','/inspections',{'stationId':station,'title':name+' cancellation','dueAt':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1)).isoformat()},operator)['id']
request('POST',f'/inspections/{cancelled}/cancel',{'note':'Cancelled test visit'},operator)
cancelled_row=next(row for row in request('GET',f'/stations/{station}/inspections',token=operator) if row['id']==cancelled)
assert cancelled_row['status']=='cancelled' and cancelled_row['result']=='Cancelled test visit' and cancelled_row['completed_at'] is None
request('POST',f'/inspections/{cancelled}/complete',{'note':'Cannot complete cancelled visit'},operator,409)
request('POST',f'/inspections/{cancelled}/cancel',{'note':'Cannot cancel twice'},operator,409)
integrator_id=int(request('GET','/auth/me',token=integrator)['id'])
assigned=request('POST','/inspections',{'stationId':station,'title':name+' assignment','dueAt':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1)).isoformat(),'assignedTo':integrator_id},operator)['id']
request('POST',f'/inspections/{assigned}/cancel',{'note':'Wrong assignee'},operator,403)
assert next(row for row in request('GET',f'/stations/{station}/inspections',token=operator) if row['id']==assigned)['status']=='pending'
request('POST',f'/inspections/{assigned}/cancel',{'note':'Assigned user cancellation'},integrator)
first_page=request('GET',f'/stations/{station}/inspections?limit=1&offset=0',token=operator)
second_page=request('GET',f'/stations/{station}/inspections?limit=1&offset=1',token=operator)
assert len(first_page)==len(second_page)==1 and first_page[0]['id']!=second_page[0]['id']
request('GET',f'/stations/{station}/inspections?limit=0',token=operator,status=400)
tariffs=request('GET',f'/stations/{station}/tariffs',token=integrator)
valid_from=max([datetime.date.fromisoformat(x['valid_until']) for x in tariffs]+[datetime.date.today()])+datetime.timedelta(days=1)
tariff={'stationId':station,'name':name,'currency':'CNY','validFrom':valid_from.isoformat(),'validUntil':(valid_from+datetime.timedelta(days=1)).isoformat(),'periods':[{'startMinute':0,'endMinute':1440,'band':'flat','pricePerKwh':0.5}]}
request('POST','/tariffs',tariff|{'periods':[None]},integrator,400)
request('POST','/tariffs',tariff,integrator)
request('POST','/tariffs',tariff,integrator,409)
role=request('GET','/roles',token=integrator)[0]['id']
member=request('POST','/members',{'account':name+'@prototype.local','name':name,'password':str(uuid.uuid4()),'roleIds':[role],'stationIds':[station]},integrator)['id']
request('PUT',f'/members/{member}',{'name':name,'enabled':False},integrator)
request('PUT',f'/members/{member}/grants',{'roleIds':[role],'stationIds':[-1]},integrator,403)
organizations=request('GET','/platform/organizations',token=integrator)
root_org=request('GET','/auth/me',token=integrator)
own_org=next(x['organization_id'] for x in request('GET','/members',token=integrator) if str(x['id'])==str(root_org['id']))
child=request('POST','/platform/organizations',{'name':name+' child','parentId':own_org},integrator)['id']
request('POST','/platform/organizations',{'name':name+' forbidden','parentId':-1},integrator,403)
request('PUT',f'/members/{member}',{'name':name,'enabled':False,'organizationId':child},integrator)
assert next(x['organization_id'] for x in request('GET','/members',token=integrator) if x['id']==member)==child
request('PUT',f'/members/{member}',{'name':name,'enabled':False,'organizationId':-1},integrator,403)
request('PUT',f'/members/{member}',{'name':name,'enabled':False,'organizationId':own_org},integrator)
request('GET','/platform/member-grants',token=integrator)
request('GET','/platform/role-permissions',token=integrator)
request('GET','/platform/customers',token=owner)
request('GET','/platform/organizations',token=owner,status=403)
request('GET',f'/stations/{station}/settlements?from=2026-01-01&to=2026-09-23',token=owner)
request('GET',f'/stations/{station}/reports/operations?from=2026-01-01&to=2026-09-23',token=owner,status=403)
report=urllib.request.Request(base+f'/stations/{station}/reports/revenue?from=2026-01-01&to=2026-09-23',headers={'Authorization':'Bearer '+owner})
with urllib.request.urlopen(report,timeout=25) as response:
    assert response.status==200 and 'text/csv' in response.headers['Content-Type']; count+=1
points=request('GET',f'/stations/{station}/points',token=owner)
now=datetime.datetime.now(datetime.timezone.utc)
query=urllib.parse.urlencode({'from':(now-datetime.timedelta(days=1)).isoformat(),'to':now.isoformat()})
assert request('GET',f'/points/{points[0]["id"]}/history?{query}',token=owner)==[],'empty telemetry fabricated'
request('POST','/auth/logout',{},owner)
request('GET','/auth/me',token=owner,status=401)
print(f'PASS: {count} real API checks; authorization, PostgreSQL persistence/transitions and ClickHouse empty data verified')
