"""Opt-in destructive fixture test against the isolated refactor DB/API and local SMTP sink.

Set EMS_TENANT_TEST_SECRETS_FILE to the private bootstrap-password JSON, and
EMS_TENANT_TEST_MAILBOX to the LOCAL SMTP sink's JSON. Never run against a deployment.
No credentials, raw verification codes or activation tokens are printed.
"""
import concurrent.futures,json,os,pathlib,re,time,urllib.request,urllib.error,uuid,threading,datetime
BASE=os.environ.get('EMS_TENANT_TEST_API','http://127.0.0.1:18092/api')
assert BASE=='http://127.0.0.1:18092/api','Only isolated local refactor API is allowed'
PASSWORD=json.loads(pathlib.Path(os.environ['EMS_TENANT_TEST_SECRETS_FILE']).read_text())['password']
MAIL=pathlib.Path(os.environ['EMS_TENANT_TEST_MAILBOX'])
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));checks=0
def call(path,method='GET',body=None,token=None,expected=200):
 global checks
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 request=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
 try:
  response=opener.open(request,timeout=45);status=response.status;payload=response.read()
 except urllib.error.HTTPError as e:status=e.code;payload=e.read()
 try:result=json.loads(payload)
 except Exception:result={}
 if status!=expected:raise AssertionError(f'{method} {path.split("?")[0]}: expected {expected}, got {status}: {result.get("msg")}')
 checks+=1;return result.get('data')
def login(email,password=PASSWORD,client='web'):
 result=call('/auth/login','POST',{'account':email,'password':password,'client':client});assert not result['requiresMfa'];return result['token'],result['user']
def mailbox(email,pattern,after=0):
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  try:items=json.loads(MAIL.read_text(encoding='utf-8'))
  except (ValueError,FileNotFoundError):items=[]
  for item in reversed(items[after:]):
   if email in item['to']:
    match=re.search(pattern,item['body'])
    if match:return match.group(1)
  time.sleep(.25)
 raise AssertionError('Expected email not delivered to LOCAL SMTP sink')
def mail_count():
 try:return len(json.loads(MAIL.read_text(encoding='utf-8')))
 except (ValueError,FileNotFoundError):return 0
def activation(email,after=0):return mailbox(email,r'#activate=([A-Za-z0-9_-]{43})',after)
def check(label):print('PASS',label,flush=True)
platform,puser=login('platform-admin@prototype.local');owner,ouser=login('owner@prototype.local');manager,muser=login('integrator@prototype.local');approver,_=login('platform-approval@prototype.local')
assert ouser['tenant']['administrator'];sites=call('/stations',token=owner);site_ids=[s['id'] for s in sites];assert len(site_ids)>=2
for path in ['/platform/company-applications','/platform/companies','/platform/company-options','/platform/menus','/platform/permission-options','/platform/permission-packages','/platform/role-templates','/company/people','/company/roles','/company/roles/options','/company/member-grants/options','/me/profile']:
 call(path,token=platform)
for path in ['/company/profile','/company/people','/company/roles','/company/roles/options','/company/member-grants/options']:
 call(path,token=owner)
for path in ['/platform/customers','/platform/organizations','/members','/organizations','/roles']:
 call(path,token=owner,expected=410)
menus=call('/platform/menus',token=platform)
referenced=next(m for m in menus if not m['can_delete'])
call(f'/platform/menus/{referenced["id"]}','DELETE',token=platform,expected=409)
leaf=call('/platform/menus','POST',{'parentId':None,'client':'web','kind':'directory','nameKey':'Fixture empty '+uuid.uuid4().hex,'applicableSide':'enterprise','sortOrder':999,'remarks':'Temporary menu deletion fixture'},platform)['id']
call(f'/platform/menus/{leaf}','DELETE',token=platform)
assert call('/stations',token=approver)==[]
call(f'/stations/{site_ids[0]}',token=approver,expected=403)
call(f'/company/people/{ouser["id"]}/status','PUT',{'enabled':False},owner,409)
call(f'/company/people/{ouser["id"]}','DELETE',{},owner,409)
check('new management endpoints, retired URLs, protected admin and approval-only platform role')
suffix=uuid.uuid4().hex[:10];employee=f'fixture-{suffix}@example.invalid';start=mail_count()
person=call('/company/people','POST',{'email':employee,'name':'Fixture employee','remarks':'Automated acceptance fixture','language':'en'},owner);uid=person['id']
call('/auth/login','POST',{'account':employee,'password':PASSWORD},expected=401)
old=activation(employee,start);start=mail_count();call(f'/company/people/{uid}/reinvite','POST',{'language':'en'},owner);new=activation(employee,start);assert old!=new
call('/public/activations/inspect','POST',{'token':old},expected=400)
call('/public/activations/inspect','POST',{'token':new})
call('/public/activations/inspect','POST',{'token':new}) # inspect never consumes the token
new_password='FixtureActivation7x'
call('/public/activations/accept','POST',{'token':new,'password':new_password})
call('/public/activations/accept','POST',{'token':new,'password':new_password},expected=400)
role=call('/company/roles','POST',{'name':'Fixture '+suffix,'description':'Web and App isolation','permissions':[{'code':'asset.read','client':'app'}]},owner)['id']
grant=call('/company/member-grants','POST',{'userId':uid,'roleId':role,'templateId':None,'stationIds':[site_ids[0]],'validFrom':None,'validUntil':None},owner)['id']
web,_=login(employee,new_password);app,_=login(employee,new_password,'app')
assert call('/stations',token=web)==[]
assert [s['id'] for s in call('/stations',token=app)]==[site_ids[0]]
call(f'/stations/{site_ids[1]}',token=app,expected=403)
call(f'/company/roles/{role}','PUT',{'name':'Fixture '+suffix,'description':'Independent Web scope','permissions':[{'code':'asset.read','client':'web'},{'code':'asset.read','client':'app'}]},owner)
assert [s['id'] for s in call('/stations',token=web)]==[site_ids[0]]
# Recheck long-lived subscriptions and already-generated report URLs on revocation.
permissions=[{'code':code,'client':'web'} for code in ['asset.read','telemetry.read','report.export']]
call(f'/company/roles/{role}','PUT',{'name':'Fixture '+suffix,'description':'Data egress fixture','permissions':permissions},owner)
points=call(f'/stations/{site_ids[0]}/points',token=web)
job=call(f'/stations/{site_ids[0]}/analysis-jobs','POST',{'kind':'telemetry','from':'2026-09-27T00:00:00Z','to':'2026-09-27T01:00:00Z','minutes':5,'pointIds':[str(points[0]['id'])]},web)
assert job['status']=='completed',job.get('error')
call(f'/analysis-jobs/{job["id"]}/download',token=web)
report=f'/stations/{site_ids[0]}/reports/health?from=2026-09-01&to=2026-09-02'
call(report,token=web)
stream_ready=threading.Event();stream_closed=threading.Event();stream_errors=[]
def listen():
 try:
  response=opener.open(urllib.request.Request(BASE+f'/stations/{site_ids[0]}/telemetry/stream',headers={'Authorization':'Bearer '+web}),timeout=30)
  for line in response:
   if line.startswith(b'event:'):stream_ready.set()
 except Exception as error:stream_errors.append(type(error).__name__)
 finally:stream_closed.set()
thread=threading.Thread(target=listen,daemon=True);thread.start()
assert stream_ready.wait(25),'Telemetry subscription never produced an event'
call(f'/company/member-grants/{grant}','DELETE',token=owner)
assert stream_closed.wait(4),'Revoked telemetry subscription was not closed immediately'
assert not stream_errors,stream_errors
call(report,token=web,expected=403)
call(f'/analysis-jobs/{job["id"]}',token=web,expected=403)
call(f'/analysis-jobs/{job["id"]}/download',token=web,expected=403)
check('real telemetry stream closes on revoke and report URL no longer downloads')
assert call('/stations',token=web)==[]
# Ordinary role administrators cannot exceed their own station/time/operation bounds.
now=datetime.datetime.now(datetime.timezone.utc)
limited_role=call('/company/roles','POST',{'name':'Fixture bounded '+suffix,'description':'Delegation bounds','permissions':[{'code':c,'client':'web'} for c in ['asset.read','company.role.manage','company.grant.manage']]},owner)['id']
limited_grant=call('/company/member-grants','POST',{'userId':uid,'roleId':limited_role,'templateId':None,'stationIds':[site_ids[0]],'validFrom':None,'validUntil':(now+datetime.timedelta(hours=1)).isoformat()},owner)['id']
call('/company/roles','POST',{'name':'Fixture escalation '+suffix,'description':'Must fail','permissions':[{'code':'asset.edit','client':'web'}]},web,403)
assert 'company.role.manage' in call('/auth/me',token=web)['permissions'],'Immediate grant is not active on the next request'
read_role=call('/company/roles','POST',{'name':'Fixture delegated '+suffix,'description':'Own read capability','permissions':[{'code':'asset.read','client':'web'}]},web)['id']
operator=next(p for p in call('/company/people',token=owner)['items'] if p['account']=='operator@prototype.local')['id']
def assign(stations,until,actor=web,expected=200):
 return call('/company/member-grants','POST',{'userId':operator,'roleId':read_role,'templateId':None,'stationIds':stations,'validFrom':None,'validUntil':until},actor,expected)
assign([site_ids[1]],(now+datetime.timedelta(minutes=30)).isoformat(),expected=403)
assign([site_ids[0]],None,expected=403)
assign([site_ids[0]],(now+datetime.timedelta(hours=2)).isoformat(),expected=403)
delegated=assign([site_ids[0]],(now+datetime.timedelta(minutes=30)).isoformat())['id']
other=assign([site_ids[1]],None,actor=owner)['id']
call(f'/company/roles/{read_role}','PUT',{'name':'Fixture delegated '+suffix,'description':'Must check existing grants too','permissions':[{'code':'asset.read','client':'web'}]},web,403)
for key in [delegated,other,limited_grant]:call(f'/company/member-grants/{key}','DELETE',token=owner)
for key in [read_role,limited_role]:call(f'/company/roles/{key}','DELETE',token=owner)
check('ordinary delegation rejects operation escalation, unrelated stations, unbounded/extended expiry and shared-role indirect escalation')
call(f'/company/people/{uid}/status','PUT',{'enabled':False},owner)
call('/auth/me',token=web,expected=401);call('/auth/me',token=app,expected=401)
call(f'/company/people/{uid}','DELETE',{},owner);call(f'/company/roles/{role}','DELETE',token=owner)
check('invite replay, activation atomicity, Web/App separation, role live updates, grant revoke and all-session disable')
email=f'company-{suffix}@example.invalid';start=mail_count();challenge=call('/public/registration/email-challenges','POST',{'email':email,'language':'en'})['challengeId'];code=mailbox(email,r'code: ([0-9]{6})',start)
call('/public/registration/email-challenges/verify','POST',{'challengeId':challenge,'code':'999999' if code!='999999' else '000000'},expected=400)
context=call('/public/registration/email-challenges/verify','POST',{'challengeId':challenge,'code':code})['context']
company={'name':'隔离验收企业 '+suffix,'companyTypes':['operator','installer'],'businessScopes':['commercial'],'country':'Germany','province':'Berlin','city':'Berlin','address':'Acceptance fixture address','latitude':52.52,'longitude':13.405,'systemScale':'100to1000','postcode':'10115','serviceDescription':'Clearly marked simulated test company','registrationNo':'','taxId':'test tax','contactName':'Fixture administrator','phone':'+49 3012345678','website':''}
application=call('/public/company-applications','POST',{'company':company,'email':email,'context':context,'language':'en'})
call('/public/company-applications','POST',{'company':company,'email':email,'context':context},expected=409)
progress=call('/public/company-applications/progress','POST',{'email':email,'context':context});assert progress[0]['status']=='pending'
call('/public/company-applications/progress','POST',{'email':'other@example.invalid','context':context},expected=401)
packages=call('/platform/company-options',token=platform)['packages'];approve={'packageIds':[packages[0]['id']],'companyTypes':company['companyTypes'],'businessScopes':company['businessScopes'],'tagIds':[]}
def race(_):
 try:return call(f'/platform/company-applications/{application["id"]}/approve','POST',approve,approver)
 except AssertionError as e:
  if 'got 409' in str(e):return 'conflict'
  raise
start=mail_count()
with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(race,range(2)))
assert results.count('conflict')==1;approved=next(r for r in results if isinstance(r,dict));tenant=approved['tenantId']
old_admin_token=activation(email,start);start=mail_count();call(f'/platform/companies/{tenant}/reinvite-administrator','POST',{'language':'en'},platform);token=activation(email,start)
call('/public/activations/inspect','POST',{'token':old_admin_token},expected=400)
call('/auth/login','POST',{'account':email,'password':PASSWORD},expected=401)
call('/public/activations/accept','POST',{'token':token,'password':new_password});b,buser=login(email,new_password)
assert buser['tenant']['administrator'] and buser['tenant']['tenantId']==tenant
assert call('/stations',token=b)==[]
for path in [f'/stations/{site_ids[0]}',f'/stations/{site_ids[0]}/devices',f'/stations/{site_ids[0]}/points',f'/stations/{site_ids[0]}/telemetry/snapshot',f'/stations/{site_ids[0]}/provision-design',f'/stations/{site_ids[0]}/analysis-jobs',f'/stations/{site_ids[0]}/topology',f'/stations/{site_ids[0]}/alarms',f'/stations/{site_ids[0]}/plans?date=2026-09-27',f'/stations/{site_ids[0]}/tariffs',f'/stations/{site_ids[0]}/inspections',f'/stations/{site_ids[0]}/firmware-tasks',f'/stations/{site_ids[0]}/settlements?from=2026-09-01&to=2026-09-30',f'/stations/{site_ids[0]}/market-services',f'/stations/{site_ids[0]}/qualifications',f'/stations/{site_ids[0]}/ems']:
 call(path,token=b,expected=403)
call(f'/company/people/{ouser["id"]}',token=b,expected=404)
call('/platform/companies',token=b,expected=403)
call(f'/platform/companies/{tenant}/status','PUT',{'enabled':False,'confirmed':True},platform)
call('/auth/me',token=b,expected=401)
call(f'/platform/companies/{tenant}/status','PUT',{'enabled':True,'confirmed':True},platform)
b,_=login(email,new_password);call('/me/profile',token=b)
check('verified progress isolation, concurrent approval, protected administrator creation and cross-tenant resource denial')
pack=packages[0]
try:
 call(f'/platform/permission-packages/{pack["id"]}/status','PUT',{'enabled':False,'confirmed':True},platform)
 assert call('/stations',token=b)==[]
 call('/me/profile',token=b)
finally:call(f'/platform/permission-packages/{pack["id"]}/status','PUT',{'enabled':True,'confirmed':True},platform)
call('/me/password','PUT',{'currentPassword':new_password,'newPassword':'FixtureChanged8y'},b)
call('/auth/me',token=b,expected=401);b,_=login(email,'FixtureChanged8y')
check('package disable retains personal center and password change invalidates sessions')
fixture={'tenantId':tenant,'account':email,'administratorId':buser['id'],'siteIds':site_ids,'checks':checks}
path=os.environ.get('EMS_TENANT_TEST_REPORT')
if path:pathlib.Path(path).write_text(json.dumps(fixture),encoding='utf-8')
print(f'PASS {checks} HTTP assertions; local SMTP delivery tested, no external mail sent',flush=True)
