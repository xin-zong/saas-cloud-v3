"""Apply only V26+ on develop-toyingzhen; preview is the default.

Run from any directory. Install requirements-toyingzhen.txt first for live previews.
Configuration and driver errors are intentionally redacted. This tool does not make backups.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import sys

TARGET = 'ems_cloud_saas_toyingzhen'
ROLE = 'ems_toyingzhen_owner'
BRANCH = 'develop-toyingzhen'
JDBC = f'jdbc:postgresql://127.0.0.1:15435/{TARGET}'
LOCK = 78291026
ROOT = Path(__file__).resolve().parents[1]

class MigrationError(RuntimeError):
    """Messages contain only fixed operational diagnostics, never driver/env text."""

def settings(env_file):
    values = {}
    try:
        lines = Path(env_file).read_text(encoding='utf-8-sig').splitlines()
    except (OSError, UnicodeError):
        raise MigrationError('Cannot read private configuration.') from None
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator:
            raise MigrationError('Invalid private configuration format.')
        key, value = key.strip(), value.strip()
        if key in values:
            raise MigrationError('Duplicate private configuration key.')
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        values[key] = value
    if (values.get('EMS_DATABASE_NAME') != TARGET or values.get('EMS_DB_URL') != JDBC
            or values.get('EMS_DB_USERNAME') != ROLE or not values.get('EMS_DB_PASSWORD')):
        raise MigrationError('Configuration must target the dedicated local tunnel, database and role.')
    return values

def current_branch(root):
    try:
        result = subprocess.run(['git', 'branch', '--show-current'], cwd=root,
                                capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        raise MigrationError('Cannot verify Git branch.') from None

def repository_migrations(root, through):
    if type(through) is not int or through < 26:
        raise MigrationError('Only migration targets V26 or newer are allowed; historical bootstrap is forbidden.')
    directory = Path(root)/'ems-cloud-api/src/main/resources/db/migration'
    found = {}
    try:
        paths = list(directory.glob('V*__*.sql'))
        for path in paths:
            match = re.fullmatch(r'V([1-9][0-9]*)__[A-Za-z0-9_]+\.sql', path.name)
            if not match or path.is_symlink() or not path.is_file():
                raise MigrationError('Invalid repository migration filename or file type.')
            version = int(match[1])
            if version in found:
                raise MigrationError('Duplicate repository migration version.')
            content = path.read_bytes()
            found[version] = {'version':version, 'filename':path.name,
                              'sha256':hashlib.sha256(content).hexdigest(),
                              'sql':content.decode('utf-8-sig')}
        if not found or through > max(found) or set(range(1, through+1)) - found.keys():
            raise MigrationError('Repository migration sequence has a missing version or unavailable target.')
    except (OSError, UnicodeError):
        raise MigrationError('Cannot read repository migration files.') from None
    return found

def verified_versions(cursor, repository):
    cursor.execute('SELECT current_database(),current_user')
    if cursor.fetchone() != (TARGET, ROLE):
        raise MigrationError('Live database identity guard failed.')
    cursor.execute('SELECT pg_advisory_xact_lock(%s)', (LOCK,))
    cursor.execute('SELECT version FROM public.schema_migration ORDER BY version')
    versions = [row[0] for row in cursor.fetchall()]
    if (not versions or any(type(v) is not int for v in versions)
            # Check against the finite repository before allocating a contiguous sequence.
            or max(versions) > max(repository) or max(versions) < 25
            or versions != list(range(1, max(versions)+1))
            or any(version not in repository for version in versions)):
        raise MigrationError('Applied migration sequence is incomplete or out of order; historical bootstrap is forbidden.')
    return versions

def run(root, env_file, through, apply=False, connect=None, branch_reader=None):
    """Return safe audit metadata. Dependency injection supports tests without a driver/network."""
    connection = None
    try:
        config = settings(env_file)
        branch_reader = branch_reader or current_branch
        if branch_reader(root) != BRANCH:
            raise MigrationError('Git branch must be develop-toyingzhen.')
        repository = repository_migrations(root, through)
        if connect is None:
            try:
                import psycopg
            except ImportError:
                raise MigrationError('Install scripts/requirements-toyingzhen.txt before a live preview or apply.') from None
            connect = psycopg.connect
        connection = connect(host='127.0.0.1', port=15435, dbname=TARGET, user=ROLE,
                             password=config['EMS_DB_PASSWORD'], connect_timeout=10,
                             autocommit=True, options='-c search_path=public')
        report = {'database':TARGET, 'role':ROLE, 'mode':'apply' if apply else 'dry-run', 'migrations':[]}
        for version in range(26, through+1):
            migration = repository[version]
            with connection.transaction():
                with connection.cursor() as cursor:
                    if branch_reader(root) != BRANCH:
                        raise MigrationError('Git branch changed; migration stopped.')
                    applied = verified_versions(cursor, repository)
                    if version in applied:
                        status = 'already-applied'
                    elif not apply:
                        status = 'pending'
                    else:
                        if max(applied) != version-1:
                            raise MigrationError('Migration order guard failed.')
                        cursor.execute(migration['sql'])
                        cursor.execute('INSERT INTO public.schema_migration(version) VALUES(%s)', (version,))
                        status = 'applied'
            report['migrations'].append({key:migration[key] for key in ('version','filename','sha256')} | {'status':status})
        return report
    except MigrationError:
        raise
    except Exception:
        # Do not print exception text, SQL excerpts, DSNs, connection strings or credentials.
        raise MigrationError('Migration operation failed; failing transaction rolled back. Driver details withheld.') from None
    finally:
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass

def main(argv=None):
    parser = argparse.ArgumentParser(description='Guarded V26+ migration preview; requires a verified backup before --apply.')
    parser.add_argument('--env', type=Path, default=ROOT/'ems-cloud-api/.env', help='Private .env path (values are never printed).')
    parser.add_argument('--through', required=True, type=int, help='Last repository migration version to inspect/apply, at least 26.')
    parser.add_argument('--apply', action='store_true', help='Apply pending versions transactionally; otherwise only preview.')
    args = parser.parse_args(argv)
    try:
        print(json.dumps(run(ROOT,args.env,args.through,apply=args.apply),ensure_ascii=True,indent=2))
        return 0
    except MigrationError as error:
        print(str(error),file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
