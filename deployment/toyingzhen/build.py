#!/usr/bin/env python3
"""Freeze tracked + nonignored source at call time; never uploads or activates."""
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, sys, datetime, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]

MAVEN_SHA512='03e2d65d4483a3396980629f260e25cac0d8b6f7f2791e4dc20bc83f9514db8d0f05b0479e699a5f34679250c49c8e52e961262ded468a20de0be254d8207076'
RUNTIME=pathlib.Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies'
UI_REGRESSION_TESTS=('ems-agent-proxy.test.cjs','ems-agent-transport.test.cjs','ems-agent-bridge.test.cjs','auth-restore.test.cjs','public-api-session-isolation.test.cjs','reference-workspace-integration.test.cjs')

def verify_maven_distribution(home,expected=MAVEN_SHA512):
    home=pathlib.Path(home).resolve(strict=True)
    archive=home.parent/'apache-maven-3.9.11-bin.zip'
    if hashlib.sha512(archive.read_bytes()).hexdigest()!=expected:raise ValueError('Installed Maven archive SHA512 mismatch')
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            if member.is_dir():continue
            parts=pathlib.PurePosixPath(member.filename)
            if parts.parts[0]!='apache-maven-3.9.11' or '..' in parts.parts:raise ValueError('Invalid Maven archive path')
            target=home.joinpath(*parts.parts[1:])
            if target.is_symlink() or not target.is_file() or hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256(bundle.read(member)).digest():raise ValueError('Installed Maven files differ from verified distribution')
    return hashlib.sha512(archive.read_bytes()).hexdigest()

def maven_command(java,home,source,args):
    home=pathlib.Path(home)
    jars=list((home/'boot').glob('plexus-classworlds-*.jar'))
    if len(jars)!=1:raise ValueError('Maven classworlds launcher missing or ambiguous')
    return [str(java),'-classpath',str(jars[0]),'-Dclassworlds.conf='+str(home/'bin/m2.conf'),'-Dmaven.home='+str(home),'-Dlibrary.jansi.path='+str(home/'lib/jansi-native'),'-Dmaven.multiModuleProjectDirectory='+str(source),'org.codehaus.plexus.classworlds.launcher.Launcher',*args]

def runtime_environment(node,java_home,maven_home,inherited=None):
    env=dict(os.environ if inherited is None else inherited)
    for name in ['JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','MAVEN_OPTS','MAVEN_ARGS','NODE_OPTIONS']:env.pop(name,None)
    # Remove case variants on Windows before adding the deterministic process PATH.
    previous=next((value for key,value in env.items() if key.upper()=='PATH'),'')
    for key in list(env):
        if key.upper()=='PATH':del env[key]
    env.update(JAVA_HOME=str(java_home),MAVEN_HOME=str(maven_home),PATH=os.pathsep.join([str(pathlib.Path(node).parent),str(pathlib.Path(java_home)/'bin'),str(pathlib.Path(maven_home)/'bin'),previous]))
    return env

def validate_versions(java,node,maven):
    if not re.search(r'version "21\.',java):raise ValueError('Installed Java21 required')
    if not re.fullmatch(r'v24\.\d+\.\d+\s*',node):raise ValueError('Installed Node24 runtime required')
    if not re.search(r'Apache Maven 3\.9\.11(?:\s|$)',maven):raise ValueError('Installed Maven3.9.11 required')

def installed_tools(args):
    node=pathlib.Path(args.node).resolve(strict=True);java_home=pathlib.Path(args.java_home).resolve(strict=True);maven=pathlib.Path(args.maven_home).resolve(strict=True)
    java=java_home/'bin/java.exe'
    if not java.is_file():raise ValueError('Configured Java executable missing')
    archive_sha=verify_maven_distribution(maven)
    pnpm=pathlib.Path(args.pnpm).resolve(strict=True)
    env=runtime_environment(node,java_home,maven)
    def capture(command):
        result=subprocess.run(command,cwd=ROOT,env=env,capture_output=True,text=True)
        if result.returncode:raise ValueError('Installed runtime version probe failed')
        return result.stdout+result.stderr
    jversion=capture([str(java),'-version']);nversion=capture([str(node),'--version']).strip();mversion=capture(maven_command(java,maven,ROOT,['--version']));pversion=capture([str(pnpm),'--version']).strip()
    validate_versions(jversion,nversion,mversion)
    return {'java':java,'node':node,'maven':maven,'env':env,'metadata':{'javaHome':str(java_home),'javaVersion':jversion.splitlines()[0],'node':str(node),'nodeVersion':nversion,'mavenHome':str(maven),'mavenVersion':'3.9.11','mavenDistributionSha512':archive_sha,'pnpm':str(pnpm),'pnpmVersion':pversion}}

def command(args,cwd=ROOT,env=None):
    result=subprocess.run(args,cwd=cwd,env=env)
    if result.returncode:raise RuntimeError('Build/check failed: '+pathlib.Path(str(args[0])).name)

def source_files():
    raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT)
    files=[]
    for name in sorted(set(raw.decode().strip('\0').split('\0'))):
        p=pathlib.PurePosixPath(name)
        # Include all product source and this deployment tooling, never local evidence/secrets.
        if not (name=='pom.xml' or name.startswith(('ems-cloud-api/','ems-cloud-ui/','ems-cloud-protocol/','ems-cloud-ingestion/','deployment/toyingzhen/'))):continue
        if not name or '..' in p.parts or '.env' in p.name or p.suffix in {'.pem','.key'}:continue
        path=ROOT/name
        if not path.exists():continue  # tracked deletion is represented by omission
        if path.is_symlink() or not path.is_file():raise ValueError('Source must contain regular files only')
        files.append((name,hashlib.sha256(path.read_bytes()).hexdigest()))
    return files

def fingerprint(files):return hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release');parser.add_argument('--expected-source');parser.add_argument('--inspect',action='store_true');parser.add_argument('--pnpm',default=str(RUNTIME/'bin/fallback/pnpm.cmd'));parser.add_argument('--maps-env',default=str(ROOT/'ems-cloud-ui/.env.local'));parser.add_argument('--node',default=str(RUNTIME/'node/bin/node.exe'));parser.add_argument('--java-home',default=os.environ.get('JAVA_HOME') or str(pathlib.Path(shutil.which('java') or 'missing/bin/java.exe').parent.parent));parser.add_argument('--maven-home',default=str(ROOT/'ems-cloud-api/.tools/apache-maven-3.9.11'));parser.add_argument('--check-tools',action='store_true')
    args=parser.parse_args()
    branch=subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()
    if branch!='develop-toyingzhen':raise ValueError('Wrong branch')
    if args.check_tools:
        tools=installed_tools(args);print(json.dumps(tools['metadata'],indent=2));return
    files=source_files();digest=fingerprint(files)
    if args.inspect:print(digest);return
    if not re.fullmatch(r'toyingzhen-[a-z0-9][a-z0-9-]{7,63}',args.release or ''):raise ValueError('Invalid release ID')
    if args.expected_source!=digest:raise ValueError('Source differs from reviewed fingerprint; inspect and verify final UI before building')
    tools=installed_tools(args)
    # Exact frozen content; source .env files and node_modules never enter snapshot/bundle.
    base=ROOT/'.local-tools/deploy-toyingzhen'/args.release
    if base.exists():raise ValueError('Refusing existing snapshot/output')
    source=base/'source';bundle=base/'bundle';source.mkdir(parents=True);bundle.mkdir()
    for name,_ in files:
        dest=source/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,dest)
    frozen=[(name,hashlib.sha256((source/name).read_bytes()).hexdigest()) for name,_ in files]
    if fingerprint(frozen)!=digest or fingerprint(source_files())!=digest:raise ValueError('Source changed while freezing; abandon this release ID')
    from release import load_env
    maps=load_env(args.maps_env).get('VITE_GOOGLE_MAPS_API_KEY','')
    env=dict(tools['env'],VITE_DATA_MODE='api',VITE_API_BASE_URL='/api',VITE_GOOGLE_MAPS_API_KEY=maps,FIGMA_PUBLIC_URL='')
    for key in ['VITE_TRANSLATION_ENDPOINT']:env.pop(key,None)
    ui=source/'ems-cloud-ui'
    command([args.pnpm,'install','--frozen-lockfile'],ui,env)
    command([str(tools['node']),'node_modules/typescript/bin/tsc','--noEmit'],ui,env)
    command([str(tools['node']),'--test',*['tests/'+name for name in UI_REGRESSION_TESTS]],ui,env)
    command([sys.executable,'-m','unittest','discover','-s','deployment/toyingzhen/tests'],source)
    # Normal package executes API/protocol tests; caller cannot silently skip them.
    command(maven_command(tools['java'],tools['maven'],source,['-f',str(source/'pom.xml'),'-pl','ems-cloud-api','-am','package']),source,env)
    command([str(tools['node']),'node_modules/vite/bin/vite.js','build'],ui,env)
    shutil.copyfile(source/'ems-cloud-api/target/ems-cloud-api-0.1.0.jar',bundle/'ems-cloud-api.jar')
    shutil.copytree(ui/'dist',bundle/'web')
    deploy=bundle/'deploy';deploy.mkdir()
    for name in ['release.py','api.service','nginx.conf','preflight.sh','stage-release.sh','activate.sh','rollback.sh']:
        (deploy/name).write_text((source/'deployment/toyingzhen'/name).read_text(encoding='utf-8-sig'),encoding='utf-8',newline='\n')
    migrations=[int(re.match(r'V(\d+)__',p.name)[1]) for p in (source/'ems-cloud-api/src/main/resources/db/migration').glob('V*__*.sql')]
    (bundle/'release.json').write_text(json.dumps({'release':args.release,'branch':branch,'sourceSha256':digest,'createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'migration':max(migrations),'apiBase':'/api','dataMode':'api','mapsConfigured':bool(maps),'buildTools':tools['metadata']},indent=2)+'\n')
    hashes={p.relative_to(bundle).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(bundle.rglob('*')) if p.is_file()}
    (bundle/'SHA256SUMS.json').write_text(json.dumps(hashes,indent=2)+'\n')
    from release import verify_bundle
    verify_bundle(bundle)
    print('Frozen bundle ready (not uploaded): '+str(bundle));print('Source SHA256: '+digest)
if __name__=='__main__':
    try:main()
    except Exception as error:print('FAIL: '+str(error),file=sys.stderr);sys.exit(1)
