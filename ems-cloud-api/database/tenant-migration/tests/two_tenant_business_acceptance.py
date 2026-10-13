"""Read/write-denial acceptance after preparing a future station for fixture enterprise B.
Only the isolated local refactor API is permitted. The fixture report contains no secrets.
"""
import json,os,pathlib,urllib.request,urllib.error
BASE='http://127.0.0.1:18092/api';report=json.loads(pathlib.Path(os.environ['EMS_TENANT_TEST_REPORT']).read_text());password=json.loads(pathlib.Path(os.environ['EMS_TENANT_TEST_SECRETS_FILE']).read_text())['password'];opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));checks=0
def call(path,token=None,body=None,method=None,expected=200):
 global checks
 req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})},method=method)
 try:r=opener.open(req,timeout=45);status=r.status;raw=r.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 payload=json.loads(raw);assert status==expected,f'{path.split("?")[0]}: expected {expected}, got {status}: {payload.get("msg")}';checks+=1;return payload.get('data')
def login(account,pw=password):return call('/auth/login',body={'account':account,'password':pw,'client':'web'})['token']
a=login('owner@prototype.local');b=login(report['account'],'FixtureChanged8y');platform=login('platform-admin@prototype.local');site=report['fixtureStationId'];original=report['siteIds'][0]
assert [r['id'] for r in call('/stations',b)]==[site],'Protected administrator must cover a future station without an explicit grant'
assert site not in [r['id'] for r in call('/stations',a)]
call(f'/stations/{site}',b);call(f'/stations/{site}',a,expected=403)
for path in [f'/stations/{site}/devices',f'/stations/{site}/points',f'/stations/{site}/topology',f'/stations/{site}/telemetry/snapshot',f'/stations/{site}/analysis-jobs']:
 call(path,b);call(path,a,expected=403)
for path in ['/work-orders','/approvals']:
 assert all(int(row.get('station_id',site))==site for row in call(path,b))
points=call(f'/stations/{original}/points',a);point=points[0]['id']
call(f'/points/{point}/history?from=2026-09-27T00:00:00Z&to=2026-09-27T01:00:00Z&minutes=5',b,expected=403)
role=call('/company/roles',platform,{'name':'Fixture cross read '+str(report['tenantId']),'description':'Business write without cross-tenant write must fail','permissions':[{'code':c,'client':'web'} for c in ['asset.read','asset.edit','tenant.data.read']]})['id']
approver=next(p for p in call('/company/people',platform)['items'] if p['account']=='platform-approval@prototype.local')['id']
grant=call('/company/member-grants',platform,{'userId':approver,'roleId':role,'templateId':None,'stationIds':[],'validFrom':None,'validUntil':None})['id']
reader=login('platform-approval@prototype.local')
station=call(f'/stations/{original}',reader)
body={'name':station['name'],'ratedPowerKw':station['rated_power_kw'],'capacityKwh':station['capacity_kwh'],'region':station.get('region'),'address':station.get('address'),'longitude':station.get('longitude'),'latitude':station.get('latitude')}
call(f'/stations/{original}',reader,body,'PUT',403)
call(f'/company/member-grants/{grant}',platform,method='DELETE')
call(f'/company/roles/{role}',platform,method='DELETE')
assert [r['id'] for r in call(f'/platform/companies/{report["tenantId"]}/stations',platform)]==[site]
call(f'/platform/companies/{report["tenantId"]}/stations',b,expected=403)
assert call(f'/platform/companies/{report["tenantId"]}/people',platform)
print(f'PASS {checks} business HTTP assertions: future-station coverage, positive B reads, bidirectional isolation, cross-tenant read without write')
