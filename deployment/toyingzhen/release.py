#!/usr/bin/env python3
"""Dedicated Toyingzhen deployment. Never manages production units or paths."""
import argparse, contextlib, datetime, hashlib, http.client, json, os, pathlib, re, shutil, socket, subprocess, sys, time, urllib.request, base64, tempfile
API=pathlib.Path('/opt/ems-cloud-toyingzhen')
WEB=pathlib.Path('/var/www/ems-cloud-toyingzhen')
ETC=pathlib.Path('/etc/ems-cloud-toyingzhen')
STATE=pathlib.Path('/var/lib/ems-cloud-toyingzhen')
UNIT='ems-cloud-toyingzhen-api.service'
USER='ems-cloud-toyingzhen'
UNITFILE=pathlib.Path('/etc/systemd/system')/UNIT
PUBLIC='http://120.27.23.229:18086'
NGINX=pathlib.Path('/etc/nginx/conf.d/ems-cloud-toyingzhen-18086.conf')
JAVA='/usr/lib/jvm/java-21-openjdk-amd64/bin/java'
ENV_KEYS={'EMS_DATABASE_NAME','EMS_DB_URL','EMS_DB_USERNAME','EMS_DB_PASSWORD','EMS_CH_URL','EMS_CH_DATABASE','EMS_CH_USERNAME','EMS_CH_PASSWORD','EMS_MFA_ENCRYPTION_KEY','EMS_BIND_ADDRESS','EMS_PORT','EMS_CORS_ORIGINS','EMS_TENANT_PUBLIC_URL','EMS_ALARM_ENGINE_ENABLED'}
SMTP_KEYS={'SPRING_MAIL_HOST','SPRING_MAIL_PORT','SPRING_MAIL_USERNAME','SPRING_MAIL_PASSWORD','EMS_TENANT_MAIL_FROM','SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH','SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE','SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED','SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE','SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY'}
SMTP_OPTIONAL_KEYS={'EMS_MAIL_HELO'}
AGENT_KEYS={'EMS_AGENT_URL','EMS_AGENT_API_KEY'}

def release_id(value):
    if not re.fullmatch(r'toyingzhen-[a-z0-9][a-z0-9-]{7,63}',value):raise ValueError('Invalid isolated release ID')
    return value

def run(args, **kwargs):
    # Never echo command stderr: DB errors can contain connection details.
    result=subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs)
    if result.returncode:raise RuntimeError('Command failed: '+pathlib.Path(args[0]).name)
    return result.stdout.strip()

def load_env(path):
    env={}
    for line in pathlib.Path(path).read_text(encoding='utf-8-sig').splitlines():
        if not line or line.startswith('#'):continue
        key,sep,value=line.partition('=')
        if not sep or not re.fullmatch(r'[A-Z][A-Z0-9_]*',key) or key in env:raise ValueError('Invalid private environment syntax')
        if '\x00' in value or '\r' in value or '\n' in value:raise ValueError('Invalid environment value')
        env[key]=value
    return env

def validate_env(env):
    if not ENV_KEYS<=set(env) or set(env)-(ENV_KEYS|SMTP_KEYS|SMTP_OPTIONAL_KEYS|AGENT_KEYS) or any(not v for v in env.values()):raise ValueError('Runtime keys missing or outside the isolated configuration allowlist')
    if set(env)&AGENT_KEYS:
        if not AGENT_KEYS<=set(env):raise ValueError('Agent configuration must include URL and API key')
        if env['EMS_AGENT_URL']!='http://47.99.70.238:18080':raise ValueError('Agent URL must match the dedicated reviewed upstream')
        if any(any(c.isspace() or c in {'\x00','"',"'",'\\'} for c in env[key]) for key in AGENT_KEYS):raise ValueError('Agent values require safe private environment serialization')
    smtp=bool(set(env)&(SMTP_KEYS|SMTP_OPTIONAL_KEYS))
    if smtp:
        if not SMTP_KEYS<=set(env):raise ValueError('SMTP configuration must be complete')
        host=env['SPRING_MAIL_HOST']
        if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?',host) or '..' in host:raise ValueError('SMTP host must be a hostname without URL or credentials')
        if not env['SPRING_MAIL_PORT'].isdigit() or not 1<=int(env['SPRING_MAIL_PORT'])<=65535:raise ValueError('SMTP port invalid')
        if not re.fullmatch(r'[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+',env['EMS_TENANT_MAIL_FROM']):raise ValueError('SMTP sender must be an email address')
        if env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH']!='true' or env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY']!='true':raise ValueError('Authenticated SMTP and server identity verification required')
        mode=(env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE'],env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED'],env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE'])
        if mode not in {('true','true','false'),('false','false','true')}:raise ValueError('SMTP requires mandatory STARTTLS or implicit TLS')
        if any(value!=value.strip() or any(c in value for c in ['\x00','\r','\n','"',"'",'\\']) for key,value in env.items() if key in SMTP_KEYS|SMTP_OPTIONAL_KEYS):raise ValueError('SMTP values require safe private environment serialization')
        if 'EMS_MAIL_HELO' in env and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*',env['EMS_MAIL_HELO']):raise ValueError('SMTP HELO hostname invalid')
    required={'EMS_DATABASE_NAME':'ems_cloud_saas_toyingzhen','EMS_DB_URL':'jdbc:postgresql://127.0.0.1:5432/ems_cloud_saas_toyingzhen','EMS_DB_USERNAME':'ems_toyingzhen_owner','EMS_CH_URL':'http://127.0.0.1:18123','EMS_BIND_ADDRESS':'127.0.0.1','EMS_PORT':'18091','EMS_CORS_ORIGINS':PUBLIC,'EMS_TENANT_PUBLIC_URL':PUBLIC,'EMS_ALARM_ENGINE_ENABLED':'false'}
    if any(env.get(k)!=v for k,v in required.items()):raise ValueError('Runtime does not match isolated database/address/ports')
    if env['EMS_CH_USERNAME'].lower() in {'default','admin','root'}:raise ValueError('A dedicated read-only ClickHouse identity is required')
    if not re.fullmatch('[A-Za-z0-9_]+',env['EMS_CH_DATABASE']):raise ValueError('Invalid ClickHouse database')
    return env

def assert_baseline(before,after):
    if before!=after:raise RuntimeError('Production current/PID/start time changed; investigate, never alter production automatically')

def baseline():
    for path in ['/opt/ems-cloud-v3/current','/var/www/ems-cloud-v3/current']:
        if not pathlib.Path(path).is_symlink() or not pathlib.Path(path).is_dir():raise RuntimeError('Production current baseline unavailable')
    service=run(['systemctl','show','ems-cloud-v3-api.service','ems-cloud-v3-ingestion.service','-p','Id','-p','MainPID','-p','ExecMainStartTimestamp','-p','ActiveState'])
    if service.count('ActiveState=active')!=2 or 'MainPID=0' in service:raise RuntimeError('Production services are not active; baseline refused')
    return {'api':os.path.realpath('/opt/ems-cloud-v3/current'),'web':os.path.realpath('/var/www/ems-cloud-v3/current'),
       'services':service}

def verify_bundle(folder):
    folder=pathlib.Path(folder)
    if folder.is_symlink():raise ValueError('Bundle cannot be a symlink')
    hashes=json.loads((folder/'SHA256SUMS.json').read_text())
    if not isinstance(hashes,dict) or not {'ems-cloud-api.jar','web/index.html','release.json'}<=hashes.keys():raise ValueError('Incomplete bundle manifest')
    for name,digest in hashes.items():
        parts=pathlib.PurePosixPath(name)
        if parts.is_absolute() or '..' in parts.parts or '\\' in name or not re.fullmatch('[0-9a-f]{64}',str(digest)):raise ValueError('Invalid manifest entry')
        if name not in {'ems-cloud-api.jar','release.json'} and not name.startswith(('web/','deploy/')):raise ValueError('Unexpected bundle artifact')
        path=folder/name
        if path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Bundle hash mismatch')
    actual=set()
    for path in folder.rglob('*'):
        if path.is_symlink():raise ValueError('Symlink in bundle')
        if path.is_file():actual.add(path.relative_to(folder).as_posix())
    if actual!=set(hashes)|{'SHA256SUMS.json'}:raise ValueError('Unmanifested bundle files')
    return json.loads((folder/'release.json').read_text())

def root_only():
    if os.geteuid()!=0:raise RuntimeError('Run on the target Linux server as root')
    if API!=pathlib.Path('/opt/ems-cloud-toyingzhen') or WEB!=pathlib.Path('/var/www/ems-cloud-toyingzhen'):raise RuntimeError('Unexpected managed roots')
    for root in [API,WEB,ETC,STATE]:
        if root.is_symlink() or root.resolve()!=root:raise RuntimeError('Managed root must not be redirected')
    for path in [API/'releases',WEB/'releases',STATE/'rollback',NGINX,UNITFILE]:
        if path.is_symlink() or path.resolve()!=path:raise RuntimeError('Managed directory/config must not be redirected')

def atomic_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(obj,indent=2)+'\n');os.chmod(temp,0o600);os.replace(temp,path)

def check_prod():
    path=STATE/'production-baseline.json'
    if not path.exists():raise RuntimeError('Missing production baseline; capture it before staging')
    saved=json.loads(path.read_text());assert_baseline(saved,baseline());return saved

def managed_release(root,rid):
    path=root/'releases'/release_id(rid)
    if not path.is_dir() or path.is_symlink() or path.resolve()!=path:raise ValueError('Managed release missing or redirected')
    return path

def env_file():
    path=ETC/'runtime.env'
    st=path.stat()
    if path.is_symlink() or st.st_uid!=0 or st.st_mode&0o777!=0o600:raise ValueError('runtime.env must be root-owned 0600 regular file')
    return validate_env(load_env(path))

def readonly_grants(grants):
    allowed={'SELECT','SHOW','SHOW DATABASES','SHOW TABLES','SHOW COLUMNS','SHOW DICTIONARIES','USAGE'}
    return bool(grants) and all((match:=re.fullmatch(r'GRANT (.+?) ON .+? TO .+',line)) and set(p.strip() for p in match[1].split(','))<=allowed and 'WITH GRANT OPTION' not in line for line in grants)

def clickhouse_query(env,sql):
    token=base64.b64encode((env['EMS_CH_USERNAME']+':'+env['EMS_CH_PASSWORD']).encode()).decode()
    connection=http.client.HTTPConnection('127.0.0.1',18123,timeout=10)
    try:
        connection.request('POST','/',body=sql.encode(),headers={'Authorization':'Basic '+token,'Content-Type':'text/plain; charset=utf-8'})
        response=connection.getresponse()
        if response.status!=200:raise RuntimeError('Read-only ClickHouse verification failed')
        result=response.read(65537)
        if len(result)>65536:raise RuntimeError('ClickHouse grant response exceeds limit')
        return result.decode().strip()
    finally:connection.close()

def database_checks(env,expected):
    pg=dict(os.environ,PGPASSWORD=env['EMS_DB_PASSWORD'],PGCONNECT_TIMEOUT='8',PGOPTIONS='-c default_transaction_read_only=on')
    result=run(['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U',env['EMS_DB_USERNAME'],'-d',env['EMS_DATABASE_NAME'],'-c',"SELECT current_database()||'|'||current_user; SELECT string_agg(version::text,',' ORDER BY version) FROM public.schema_migration;"],env=pg).splitlines()
    if len(result)!=2 or result[0]!='ems_cloud_saas_toyingzhen|ems_toyingzhen_owner':raise RuntimeError('Database identity mismatch')
    if result[1]!=','.join(str(i) for i in range(1,expected+1)):raise RuntimeError('Migration sequence differs from frozen release; do not run migrations implicitly')
    try:
        # Existing production reader is SELECT-only through grants; readonly setting may be 0.
        if not readonly_grants(clickhouse_query(env,'SHOW GRANTS FORMAT TabSeparated').splitlines()):raise RuntimeError('ClickHouse identity has non-read grants or unresolved role grants')
        if clickhouse_query(env,'SELECT 1 FORMAT TabSeparated')!='1':raise RuntimeError('ClickHouse select failed')
    except Exception:raise RuntimeError('Read-only ClickHouse verification failed') from None

def port_free(port):
    output=run(['ss','-H','-ltn','sport = :'+str(port)])
    return not output

def check_nginx_candidate(candidate):
    path=None
    try:
        # Nginx requires a seekable regular file; /dev/stdin may parse as empty.
        # NamedTemporaryFile creates a private 0600 file inside this environment.
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=STATE,prefix='nginx-preflight-',suffix='.conf',delete=False) as file:
            path=pathlib.Path(file.name)
            file.write(candidate)
        run(['nginx','-t','-c',str(path)])
    finally:
        if path is not None:path.unlink(missing_ok=True)

def preflight(rid):
    root_only();before=check_prod();env=env_file();release=managed_release(API,rid);meta=verify_bundle(release)
    if meta.get('release')!=rid or meta.get('branch')!='develop-toyingzhen' or meta.get('apiBase')!='/api' or meta.get('dataMode')!='api' or type(meta.get('migration')) is not int or meta['migration']<25:raise ValueError('Release metadata mismatch')
    web=managed_release(WEB,rid)
    hashes=json.loads((release/'SHA256SUMS.json').read_text())
    expected={name[4:]:digest for name,digest in hashes.items() if name.startswith('web/')}
    actual={p.relative_to(web).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in web.rglob('*') if p.is_file() and not p.is_symlink()}
    if expected!=actual or any(p.is_symlink() for p in web.rglob('*')):raise ValueError('Staged web release hash mismatch')
    if not pathlib.Path(JAVA).is_file():raise RuntimeError('Java21 missing')
    if not re.search(r'version "21\.',subprocess.run([JAVA,'-version'],capture_output=True,text=True).stderr):raise RuntimeError('Explicit Java21 required')
    database_checks(env,int(meta['migration']))
    run(['systemd-analyze','verify',str(release/'deploy/api.service')])
    candidate='events {}\nhttp { include /etc/nginx/mime.types;\n'+(release/'deploy/nginx.conf').read_text()+'\n}\n'
    check_nginx_candidate(candidate)
    active=subprocess.run(['systemctl','is-active',UNIT],capture_output=True,text=True).stdout.strip()
    if active!='active' and not port_free(18091):raise RuntimeError('API port occupied')
    if active=='active':
        installed=UNITFILE
        if not installed.is_file() or installed.read_text()!=(release/'deploy/api.service').read_text():raise RuntimeError('Active independent unit differs from reviewed template')
        if current_target(API) is None:raise RuntimeError('Active independent service has no managed current')
    if NGINX.exists():
        assert_nginx_upgrade_compatible(release)
    elif not port_free(18086):raise RuntimeError('Web port occupied')
    assert_baseline(before,baseline());print('PASS isolated runtime, database identity/migrations, readonly ClickHouse, hashes and production baseline')

def symlink(root,target):
    current=root/'current'
    if current.exists() and not current.is_symlink():raise ValueError('Current must be a managed symlink')
    if target is not None:
        resolved=pathlib.Path(target)
        if resolved.parent!=root/'releases' or not resolved.is_dir() or resolved.is_symlink():raise ValueError('Invalid independent current target')
        tmp=root/'current.new'
        if tmp.exists() or tmp.is_symlink():tmp.unlink()
        tmp.symlink_to(resolved);os.replace(tmp,current)
    elif current.is_symlink():current.unlink()

def current_target(root):
    current=root/'current'
    if not current.exists() and not current.is_symlink():return None
    if not current.is_symlink():raise ValueError('Current is not a symlink')
    resolved=current.resolve()
    if resolved.parent!=root/'releases' or not resolved.is_dir() or resolved.is_symlink():raise ValueError('Current outside independent releases')
    return str(resolved)

def assert_nginx_upgrade_compatible(candidate):
    """Accept only the reviewed candidate or the fully verified active managed release."""
    if NGINX.is_symlink() or not NGINX.is_file():raise RuntimeError('Existing independent Nginx config is not a regular file')
    installed=NGINX.read_text()
    if installed==(pathlib.Path(candidate)/'deploy/nginx.conf').read_text():return
    target=current_target(API)
    if target is None:raise RuntimeError('Existing independent Nginx config differs')
    current=managed_release(API,pathlib.Path(target).name)
    if str(current)!=target:raise ValueError('Current independent release identity differs')
    meta=verify_bundle(current)
    if meta.get('release')!=current.name or meta.get('branch')!='develop-toyingzhen' or meta.get('apiBase')!='/api' or meta.get('dataMode')!='api' or type(meta.get('migration')) is not int or meta['migration']<25:raise ValueError('Current release metadata mismatch')
    if installed!=(current/'deploy/nginx.conf').read_text():raise RuntimeError('Existing independent Nginx config differs')

def health(url):
    for attempt in range(45):
        try:
            with urllib.request.urlopen(url,timeout=3) as response:
                body=json.load(response)
                if response.status==200 and body.get('code')==200 and body.get('data',{}).get('status')=='UP':return
        except Exception:pass
        time.sleep(2)
    raise RuntimeError('Independent API health did not become UP')

def restore(record):
    for root,key in [(API,'api'),(WEB,'web')]:symlink(root,record[key])
    config=UNITFILE
    if record['unit'] is None:
        run(['systemctl','disable','--now',UNIT]);config.unlink(missing_ok=True)
    else:config.write_text(record['unit'])
    if record['nginx'] is None:NGINX.unlink(missing_ok=True)
    else:NGINX.write_text(record['nginx'])
    run(['systemctl','daemon-reload'])
    if record['api'] is not None:
        run(['systemctl','restart',UNIT]);health('http://127.0.0.1:18091/api/health')
    run(['nginx','-t']);run(['systemctl','reload','nginx'])

def activate(rid):
    preflight(rid);before=check_prod();unit=UNITFILE
    record={'api':current_target(API),'web':current_target(WEB),'unit':unit.read_text() if unit.exists() else None,'nginx':NGINX.read_text() if NGINX.exists() else None,'production':before,'release':rid}
    if (STATE/'rollback'/f'{rid}.json').exists():raise RuntimeError('Activation already recorded; use a new release ID')
    atomic_json(STATE/'rollback'/f'{rid}.json',record)
    try:
        if not run(['getent','passwd',USER]):raise RuntimeError('Missing dedicated service account')
    except RuntimeError:
        run(['useradd','--system','--home-dir',str(STATE),'--shell','/usr/sbin/nologin',USER])
    try:
        unit.write_text((managed_release(API,rid)/'deploy/api.service').read_text());os.chmod(unit,0o644)
        symlink(API,str(managed_release(API,rid)));symlink(WEB,str(managed_release(WEB,rid)))
        run(['systemctl','daemon-reload']);run(['systemd-analyze','verify',str(unit)])
        run(['systemctl','start' if record['api'] is None else 'restart',UNIT]);health('http://127.0.0.1:18091/api/health')
        NGINX.write_text((managed_release(API,rid)/'deploy/nginx.conf').read_text());os.chmod(NGINX,0o644)
        run(['nginx','-t']);run(['systemctl','reload','nginx']);health(PUBLIC+'/api/health')
        with urllib.request.urlopen(PUBLIC+'/',timeout=10) as response:body=response.read()
        if hashlib.sha256(body).hexdigest()!=hashlib.sha256((WEB/'current/index.html').read_bytes()).hexdigest():raise RuntimeError('Published frontend hash mismatch')
        assert_baseline(before,baseline());run(['systemctl','enable',UNIT]);print('Activated isolated release '+rid)
    except Exception:
        # Restore only dedicated environment. Never repair production.
        restore(record);assert_baseline(before,baseline());raise

def stage(rid,source):
    before=check_prod();source=pathlib.Path(source).resolve(strict=True);meta=verify_bundle(source)
    if meta.get('release')!=rid:raise ValueError('Release ID mismatch')
    api=API/'releases'/rid;web=WEB/'releases'/rid
    if api.exists() or web.exists():raise ValueError('Refusing release overwrite')
    api.parent.mkdir(parents=True,exist_ok=True);web.parent.mkdir(parents=True,exist_ok=True)
    shutil.copytree(source,api);shutil.copytree(source/'web',web)
    for root in [API,WEB,api.parent,web.parent,api,web]:os.chmod(root,0o755)
    for root in [api,web]:
        for p in root.rglob('*'):
            if not p.is_symlink():os.chmod(p,0o755 if p.is_dir() else 0o644)
    assert_baseline(before,baseline());print('Staged '+rid+'; no current/unit/Nginx changes')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['baseline','stage','preflight','activate','rollback'])
    parser.add_argument('release',nargs='?');parser.add_argument('--bundle')
    args=parser.parse_args();root_only()
    # Serialize baseline/staging/activation/rollback against parallel operators.
    import fcntl
    with open('/run/lock/ems-cloud-toyingzhen-deploy.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.action=='baseline':
            if (STATE/'production-baseline.json').exists():check_prod();print('Existing production baseline matches; retained');return
            atomic_json(STATE/'production-baseline.json',baseline());print('Production baseline captured; no production modifications');return
        rid=release_id(args.release or '')
        if args.action=='stage':stage(rid,args.bundle or '')
        elif args.action=='preflight':preflight(rid)
        elif args.action=='activate':activate(rid)
        else:
            before=check_prod();record=json.loads((STATE/'rollback'/f'{rid}.json').read_text());assert_baseline(record['production'],before)
            if current_target(API)!=str(API/'releases'/rid) or current_target(WEB)!=str(WEB/'releases'/rid):raise RuntimeError('Rollback does not own current release')
            restore(record);assert_baseline(before,baseline());print('Rolled back isolated release '+rid+'; database unchanged')
if __name__=='__main__':
    try:main()
    except Exception as error:
        # No traceback/environment/HTTP body with credentials.
        print('FAIL: '+(str(error) if isinstance(error,(ValueError,RuntimeError)) else type(error).__name__),file=sys.stderr);sys.exit(1)
