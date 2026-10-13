"""Validate explicit ownership before migration. Never reads or writes credentials.

Usage: python preflight.py inventory.json ownership-map.json
Inventory is a SELECT projection of user IDs/accounts and station IDs/codes.
Exit 2 means the migration must not proceed.
"""
import json
import sys
from pathlib import Path

def validate(inventory, mapping):
    errors, emails = [], set()
    for user in inventory['users']:
        account = user['account'].strip().lower()
        if account in emails: errors.append('duplicate normalized email: ' + account)
        emails.add(account)
        if mapping.get('users', {}).get(account) not in ('platform', 'demo'):
            errors.append('unmapped user: ' + account)
    for station in inventory['stations']:
        tenant = mapping.get('stations', {}).get(station['code'])
        if not tenant: errors.append('unmapped station: ' + station['code'])
        elif tenant != 'demo': errors.append('station requires enterprise tenant: ' + station['code'])
    for key, tenant, message in [('platformAdministrator', 'platform', 'platform administrator must belong to platform tenant'),
                                  ('enterpriseAdministrator', 'demo', 'enterprise administrator must belong to demo tenant')]:
        email = mapping.get(key, '').strip().lower()
        if email not in emails or mapping.get('users', {}).get(email) != tenant: errors.append(message)
    unknown = set(mapping.get('users', {})) - emails
    errors.extend('unknown mapped user: ' + email for email in sorted(unknown))
    codes = {station['code'] for station in inventory['stations']}
    errors.extend('unknown mapped station: ' + code for code in sorted(set(mapping.get('stations', {})) - codes))
    return errors

if __name__ == '__main__':
    inventory, mapping = (json.loads(Path(p).read_text(encoding='utf-8-sig')) for p in sys.argv[1:3])
    errors = validate(inventory, mapping)
    print(json.dumps({'valid': not errors, 'errors': errors, 'users': len(inventory['users']), 'stations': len(inventory['stations'])}, ensure_ascii=False))
    sys.exit(2 if errors else 0)
