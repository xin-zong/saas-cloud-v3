"""Real HTTP permission cutover checks on explicitly provisioned, isolated T11 fixtures.

Requires EMS_PERMISSION_FIXTURE (JSON path) and EMS_PERMISSION_TEST_PASSWORD.
Never provisions, bootstraps governance, connects to a database, or prints credentials.
See docs/permission-cutover.md for the fixture contract and exact cleanup lifecycle.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    fixture = json.loads(Path(os.environ['EMS_PERMISSION_FIXTURE']).read_text(encoding='utf-8'))
    password = os.environ['EMS_PERMISSION_TEST_PASSWORD']
    base = os.environ.get('EMS_TEST_API', 'http://127.0.0.1:18090/api').rstrip('/')
    endpoint = urllib.parse.urlsplit(base)
    assert (endpoint.scheme == 'http' and endpoint.hostname in {'127.0.0.1', 'localhost'}
            and endpoint.port and not endpoint.username and not endpoint.password
            and endpoint.path == '/api' and not endpoint.query and not endpoint.fragment), 'Use the local cutover API'
    assert fixture['namespace'] == 'permission-t11', 'Wrong fixture namespace'
    actors = fixture['actors']
    assert set(actors) == {'actor', 'peer', 'target', 'legacy', 'limited', 'expiring'}
    assert all(a['account'].startswith('permission-t11-') and int(a['id']) > 0 for a in actors.values())
    assert len({a['id'] for a in actors.values()}) == 6
    org, station, outside = (int(fixture[k]) for k in ('organizationId', 'stationId', 'outsideStationId'))
    assert min(org, station, outside) > 0 and station != outside
    output = Path(os.environ.get('EMS_PERMISSION_RESULT', 'permission-t11-result.json'))
    ledger = {'namespace': fixture['namespace'], 'createdRoleIds': [], 'createdGrants': [], 'checks': []}

    def save():
        # Contains identifiers/results only, never tokens, passwords, or full HTTP responses.
        output.write_text(json.dumps(ledger, indent=2), encoding='utf-8')

    def request(method, path, body=None, token=None, expected=200):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        req = urllib.request.Request(base + path, headers=headers, method=method,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                status, data = response.status, json.load(response)
        except urllib.error.HTTPError as response:
            status, data = response.code, json.load(response)
        if expected is not None:
            assert status == expected, f'{method} {path}: expected {expected}, got {status}'
        return status, data.get('data')

    tokens = {}
    try:
        for name in ['expiring', 'actor', 'peer', 'target', 'legacy', 'limited']:
            actor = actors[name]
            _, login = request('POST', '/auth/login', {'account': actor['account'], 'password': password})
            assert not login.get('requiresMfa'), 'Fixtures must not require MFA'
            tokens[name] = login['token']
            _, me = request('GET', '/auth/me', token=tokens[name])
            assert int(me['id']) == actor['id'], 'Fixture identity mismatch'
            if name == 'expiring':
                assert 'asset.read' in me['stationPermissions'].get(str(station), []), 'Expiry fixture expired before test start'
        admin = tokens['actor']
        _, stations = request('GET', '/stations', token=admin)
        site = next(s for s in stations if s['id'] == station)
        assert site['code'].startswith('permission-t11-'), 'Refuse to mutate a business station'
        _, legacy = request('GET', '/auth/me', token=tokens['legacy'])
        assert not legacy['organizationPermissions'] and not legacy['stationPermissions']
        request('GET', '/platform/organizations?purpose=organizations', token=tokens['legacy'], expected=403)
        ledger['checks'].append('NULL-owner stationless grant has no organization or station wildcard')
        for path in ('/platform/member-grants', '/platform/role-permissions'):
            request('GET', path, token=admin, expected=410)
            request('GET', path, expected=401)
        target = actors['target']['id']
        request('PUT', f'/members/{target}/grants', {'roleIds': [], 'stationIds': []}, admin, 410)
        request('PUT', f"/platform/roles/{fixture['longRoleId']}/permissions",
                {'permissionCodes': ['asset.read', 'asset.edit']}, tokens['limited'], 403)
        _, unchanged = request('GET', f'/platform/roles?organizationId={org}', token=admin)
        assert next(r for r in unchanged if r['id'] == fixture['longRoleId'])['permissionCodes'] == ['asset.read']
        ledger['checks'].append('finite issuer cannot expand a role held by a permanent grant')

        _, role = request('POST', '/platform/roles', {'name': 'permission-t11-created', 'description': 'T11 isolated fixture', 'organizationId': org}, admin)
        role_id = role['id']
        ledger['createdRoleIds'].append(role_id)
        save()
        for number in (1, 2):
            request('PUT', f'/platform/roles/{role_id}', {'name': f'permission-t11-edited-{number}', 'description': 'T11 isolated fixture'}, admin)
            request('PUT', f'/platform/roles/{role_id}/permissions', {'permissionCodes': ['asset.edit']}, admin)
        _, before = request('GET', f'/members/{target}/grants', token=admin)
        request('POST', f'/members/{target}/grants', {'roleId': role_id, 'stationIds': [outside], 'term': '30d'}, admin, 403)
        _, after = request('GET', f'/members/{target}/grants', token=admin)
        assert [g['id'] for g in after] == [g['id'] for g in before], 'Rejected write left a partial grant'
        _, grant = request('POST', f'/members/{target}/grants', {'roleId': role_id, 'stationIds': [station], 'term': '30d'}, admin)
        grant_id = grant['id']
        ledger['createdGrants'].append({'memberId': target, 'grantId': grant_id})
        save()
        _, edited = request('PUT', f'/members/{target}/grants/{grant_id}', {'roleId': role_id, 'stationIds': [station], 'term': '90d'}, admin)
        assert edited['id'] == grant_id and edited['validUntil'] != grant['validUntil']
        _, me = request('GET', '/auth/me', token=tokens['target'])
        assert 'asset.edit' in me['stationPermissions'].get(str(station), [])
        request('GET', f'/stations/{outside}', token=tokens['target'], expected=403)
        _, detail = request('GET', f'/stations/{station}', token=tokens['target'])
        edit = {'name': detail['name'], 'ratedPowerKw': detail['rated_power_kw'], 'capacityKwh': detail['capacity_kwh'],
                'region': detail.get('region'), 'address': detail.get('address'), 'longitude': detail.get('longitude'), 'latitude': detail.get('latitude')}
        request('PUT', f'/stations/{station}', edit, tokens['target'])
        request('DELETE', f'/members/{target}/grants/{grant_id}', token=admin)
        _, me = request('GET', '/auth/me', token=tokens['target'])
        assert 'asset.edit' not in me['stationPermissions'].get(str(station), [])
        request('PUT', f'/stations/{station}', edit, tokens['target'], 403)
        request('DELETE', f'/platform/roles/{role_id}', token=admin)
        _, audits = request('GET', '/audit?limit=200', token=admin)
        actions = {event['action'] for event in audits}
        assert {'role.create', 'role.edit', 'role.permissions', 'role.delete',
                'member.grant.create', 'member.grant.edit', 'member.grant.revoke'} <= actions
        assert all(password not in event['detail'] and 'password_hash' not in event['detail'] for event in audits)
        ledger['checks'].append('real role/grant CRUD, repeated writes, cross-station denial, atomic failure and same-session revocation')

        # The fixture grant expires shortly after provisioning. Do not manipulate production clocks.
        deadline = time.monotonic() + 180
        while True:
            _, me = request('GET', '/auth/me', token=tokens['expiring'])
            if 'asset.read' not in me['stationPermissions'].get(str(station), []):
                break
            assert time.monotonic() < deadline, 'Expiry fixture must expire within 180 seconds'
            time.sleep(1)
        request('GET', f'/stations/{station}', token=tokens['expiring'], expected=403)
        ledger['checks'].append('same authenticated session loses permission at actual expiry')

        # Both permanent governors may independently remove their role.manage, but not both.
        def reduce(name):
            rid = actors[name]['roleId']
            codes = [c for c in fixture['governorPermissionCodes'] if c != 'role.manage']
            return request('PUT', f'/platform/roles/{rid}/permissions', {'permissionCodes': codes}, tokens[name], None)[0]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(reduce, ['actor', 'peer']))
        assert sorted(statuses) == [200, 409], f'Concurrent governance results: {statuses}'
        ledger['checks'].append('concurrent last permanent governance loss denied atomically')
        ledger['status'] = 'PASS'
    finally:
        save()
        for token in tokens.values():
            try:
                request('POST', '/auth/logout', token=token)
            except Exception:
                pass  # Exact-ID administrative cleanup remains mandatory, even on test failure.
    print(f"PASS: {len(ledger['checks'])} real HTTP permission workflows; exact-ID result ledger written")


if __name__ == '__main__':
    main()
