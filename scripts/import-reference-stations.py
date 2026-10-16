"""Import a private, read-only reference export into the isolated development DB.

No network access to the source. Default mode is SELECT-only. Apply is one transaction.
Existing stations are never matched by name, reassigned or deleted.
"""
import argparse
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
HOST = 'ess-cloud-login.qudeox.com'
TARGET = 'ems_cloud_saas_toyingzhen'
ROLE = 'ems_toyingzhen_owner'
BRANCH = 'develop-toyingzhen'
LOCK = 78291032


class ImportError(RuntimeError):
    """Safe diagnostics: never interpolate source data or driver errors."""


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def text(value, limit, required=False):
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ImportError('Invalid or missing text field.')
    return value.strip()


def number(value, minimum, maximum, nullable=True, strict_minimum=False):
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ImportError('Invalid numeric field.')
    try:
        result = Decimal(str(value))
        if (not result.is_finite() or result > Decimal(str(maximum)) or
                (result <= Decimal(str(minimum)) if strict_minimum else result < Decimal(str(minimum)))):
            raise ImportError('Numeric field is outside its allowed range.')
        if result != result.quantize(Decimal('0.001')) and maximum == 99999999999.999:
            raise ImportError('Capacity precision exceeds three decimal places.')
        return result
    except (InvalidOperation, ValueError):
        raise ImportError('Invalid numeric field.') from None


def normalize(document):
    if not isinstance(document, dict) or document.get('sourceHost') != HOST:
        raise ImportError('Source host must be the approved reference host.')
    try:
        captured = datetime.fromisoformat(document['capturedAt'].replace('Z', '+00:00'))
        if captured.utcoffset() is None:
            raise ValueError()
        # Reject unsupported/nonfinite JSON anywhere, including raw evidence.
        canonical(document)
    except (KeyError, TypeError, ValueError, AttributeError):
        raise ImportError('Export requires JSON-safe data and an ISO timestamp with timezone.') from None
    stations = document.get('stations')
    if not isinstance(stations, list) or not stations:
        raise ImportError('Export must contain a nonempty station list.')
    rows, seen = [], set()
    for source in stations:
        if not isinstance(source, dict):
            raise ImportError('Each station must be an object.')
        source_id = text(source.get('sourceId'), 200, required=True)
        if source_id in seen:
            raise ImportError('Duplicate source identity in export.')
        seen.add(source_id)
        asset_type = source.get('assetType')
        if asset_type not in ('BESS', 'PV', 'Wind', 'Hybrid', 'Diesel'):
            raise ImportError('A verified asset type is required.')
        profile = source.get('profile', {})
        if not isinstance(profile, dict) or not isinstance(profile.get('details', {}), dict):
            raise ImportError('Station profile/details must be objects.')
        normalized_profile = {}
        for key, limit in [('timezone',100),('country',100),('province',120),('city',120),('postcode',100)]:
            normalized_profile[key] = text(profile.get(key), limit)
        timezone = normalized_profile['timezone']
        # Accept IANA names and the reference platform's explicit UTC offsets.
        if timezone and not re.fullmatch(r'(?:[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+|UTC|GMT|(?:UTC|GMT)?[+-](?:0[0-9]|1[0-4]):[0-5][0-9])',timezone):
            raise ImportError('Invalid timezone notation.')
        for key in ('gridConnectionDate','commissionedOn'):
            value = profile.get(key)
            try:
                normalized_profile[key] = date.fromisoformat(value).isoformat() if value is not None else None
            except (ValueError,TypeError):
                raise ImportError('Profile date must be a real ISO calendar date.') from None
        normalized_profile['solarCapacityKw'] = number(profile.get('solarCapacityKw'),0,99999999999.999)
        known = set(normalized_profile) | {'details'}
        normalized_profile['details'] = dict(profile.get('details', {}))
        normalized_profile['details'].update({k:v for k,v in profile.items() if k not in known})
        row = {'sourceId':source_id,'name':text(source.get('name'),160,True),'assetType':asset_type,
               'ratedPowerKw':number(source.get('ratedPowerKw'),0,99999999999.999,False,True),
               'capacityKwh':number(source.get('capacityKwh'),0,99999999999.999,False,True),
               'region':text(source.get('region'),80),'address':text(source.get('address'),300),
               'longitude':number(source.get('longitude'),-180,180),
               'latitude':number(source.get('latitude'),-90,90),'profile':normalized_profile}
        row['code'] = 'REF-' + hashlib.sha256((HOST+'\0'+source_id).encode()).hexdigest()[:40]
        row['contentHash'] = hashlib.sha256(canonical(source).encode()).hexdigest()
        row['provenance'] = {'sourceHost':HOST,'capturedAt':document['capturedAt'],'station':source,
                             'exportMetadata':{k:v for k,v in document.items() if k != 'stations'}}
        rows.append(row)
    return rows


def migration_helpers(root):
    spec = importlib.util.spec_from_file_location('toyingzhen_migration_guard',Path(root)/'scripts/migrate-toyingzhen.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(root, env_file, document, tenant_id, manager_id, apply=False, connect=None, branch_reader=None):
    connection = None
    try:
        rows = normalize(document)
        if type(tenant_id) is not int or tenant_id <= 0 or type(manager_id) is not int or manager_id <= 0:
            raise ImportError('Explicit positive tenant and manager IDs are required.')
        guard = migration_helpers(ROOT)
        config = guard.settings(env_file)
        branch_reader = branch_reader or guard.current_branch
        if branch_reader(root) != BRANCH:
            raise ImportError('Git branch must be develop-toyingzhen.')
        if connect is None:
            import psycopg
            connect = psycopg.connect
        connection = connect(host='127.0.0.1',port=15435,dbname=TARGET,user=ROLE,
                             password=config['EMS_DB_PASSWORD'],connect_timeout=10,
                             autocommit=True,options='-c search_path=public')
        report = {'database':TARGET,'role':ROLE,'mode':'apply' if apply else 'dry-run',
                  'tenantId':tenant_id,'managerId':manager_id,'stations':[]}
        with connection.transaction():
            with connection.cursor() as cur:
                if not apply:
                    cur.execute('SET TRANSACTION READ ONLY')
                cur.execute('SELECT current_database(),current_user')
                if cur.fetchone() != (TARGET,ROLE):
                    raise ImportError('Live database identity guard failed.')
                if apply:
                    cur.execute('SELECT pg_advisory_xact_lock(%s)',(LOCK,))
                    # Match AssetController.edit order: business lock before tenant
                    # relation lock/row locks. Plans and market drafts also lock the
                    # station row, so dependencies cannot race a capacity decrease.
                    cur.execute('SELECT pg_advisory_xact_lock(78291001)')
                    # Same lock as tenant/manager relation triggers, before preflight.
                    cur.execute('SELECT pg_advisory_xact_lock(78291002)')
                cur.execute('SELECT EXISTS(SELECT 1 FROM public.schema_migration WHERE version=32)')
                if not cur.fetchone()[0]:
                    raise ImportError('Apply reviewed V32 migration before import.')
                cur.execute("SELECT EXISTS(SELECT 1 FROM public.saas_active_user u WHERE u.user_id=%s AND u.tenant_id=%s AND u.kind='enterprise' AND u.administrator AND EXISTS(SELECT 1 FROM public.saas_member_capability c WHERE c.user_id=u.user_id AND c.client='web' AND c.permission_code='asset.read'))",(manager_id,tenant_id))
                if not cur.fetchone()[0]:
                    raise ImportError('Manager must be an active enterprise administrator with web asset.read capability.')
                plans = []
                for row in rows:
                    cur.execute('SELECT i.station_id,i.content_hash,s.tenant_id,s.code,s.rated_power_kw FROM public.station_reference_import i JOIN public.station s ON s.id=i.station_id WHERE i.source_host=%s AND i.source_id=%s' + (' FOR UPDATE OF s' if apply else ''),(HOST,row['sourceId']))
                    existing = cur.fetchone()
                    if existing and (existing[2] != tenant_id or existing[3] != row['code']):
                        raise ImportError('Existing source mapping belongs to a different tenant or code.')
                    if not existing:
                        cur.execute('SELECT id FROM public.station WHERE code=%s',(row['code'],))
                        if cur.fetchone():
                            raise ImportError('Unmapped station code collision; refusing to adopt existing station.')
                    status = 'unchanged' if existing and existing[1] == row['contentHash'] else ('update' if existing else 'insert')
                    if status == 'update' and row['ratedPowerKw'] < existing[4]:
                        # Intentionally conservative: even historical dependencies
                        # require explicit business review before a power decrease.
                        cur.execute('SELECT EXISTS(SELECT 1 FROM public.operating_plan WHERE station_id=%s) OR EXISTS(SELECT 1 FROM public.market_allocation WHERE station_id=%s)',(existing[0],existing[0]))
                        if cur.fetchone()[0]:
                            raise ImportError('Cannot reduce rated power on a station with operating plans or market allocations; review through the business workflow.')
                    plans.append((row,existing,status))
                if branch_reader(root) != BRANCH:
                    raise ImportError('Git branch changed; import stopped.')
                for row,existing,status in plans:
                    station_id = existing[0] if existing else None
                    if apply and status != 'unchanged':
                        values = tuple(row[k] for k in ('name','ratedPowerKw','capacityKwh','assetType','region','address','longitude','latitude'))
                        if existing:
                            cur.execute('UPDATE public.station SET name=%s,rated_power_kw=%s,capacity_kwh=%s,asset_type=%s,region=%s,address=%s,longitude=%s,latitude=%s WHERE id=%s AND tenant_id=%s',values+(station_id,tenant_id))
                        else:
                            cur.execute('INSERT INTO public.station(name,rated_power_kw,capacity_kwh,asset_type,region,address,longitude,latitude,code,tenant_id,manager_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',values+(row['code'],tenant_id,manager_id))
                            station_id = cur.fetchone()[0]
                        profile = row['profile']
                        cur.execute('INSERT INTO public.station_profile(station_id,timezone,solar_capacity_kw,grid_connection_date,commissioned_on,country,province,city,postcode,details) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT(station_id) DO UPDATE SET timezone=excluded.timezone,solar_capacity_kw=excluded.solar_capacity_kw,grid_connection_date=excluded.grid_connection_date,commissioned_on=excluded.commissioned_on,country=excluded.country,province=excluded.province,city=excluded.city,postcode=excluded.postcode,details=excluded.details,updated_at=now()',
                                    (station_id,)+(tuple(profile[k] for k in ('timezone','solarCapacityKw','gridConnectionDate','commissionedOn','country','province','city','postcode')))+(canonical(profile['details']),))
                        cur.execute('INSERT INTO public.station_reference_import(source_host,source_id,station_id,content_hash,provenance) VALUES(%s,%s,%s,%s,%s::jsonb) ON CONFLICT(source_host,source_id) DO UPDATE SET content_hash=excluded.content_hash,provenance=excluded.provenance,imported_at=now()',
                                    (HOST,row['sourceId'],station_id,row['contentHash'],canonical(row['provenance'])))
                    report['stations'].append({'stationId':station_id,'code':row['code'],'contentHash':row['contentHash'],'status':status})
        return report
    except ImportError:
        raise
    except Exception:
        raise ImportError('Import failed; transaction rolled back. Configuration and driver details withheld.') from None
    finally:
        if connection is not None:
            connection.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True,type=Path,help='Private JSON export; never commit business data.')
    parser.add_argument('--env',type=Path,default=ROOT/'ems-cloud-api/.env')
    parser.add_argument('--tenant-id',required=True,type=int)
    parser.add_argument('--manager-id',required=True,type=int)
    parser.add_argument('--apply',action='store_true')
    args = parser.parse_args(argv)
    try:
        try:
            document = json.loads(args.input.read_text(encoding='utf-8-sig'))
        except (OSError,UnicodeError,ValueError):
            raise ImportError('Cannot read private input JSON.') from None
        print(json.dumps(run(ROOT,args.env,document,args.tenant_id,args.manager_id,args.apply),ensure_ascii=True,indent=2))
        return 0
    except ImportError as error:
        print(str(error),file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
