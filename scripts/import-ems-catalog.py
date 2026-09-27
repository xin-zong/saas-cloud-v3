"""Offline, deterministic EMS v1 evidence import. Never connects to or executes SQL.

Usage: --sql FILE --protocol FILE --references DIRECTORY --output FILE
Reference JSON supplies the ordinary profile's placement and config ID evidence;
it supplies no units, config scalar types, writable flags or enum semantics.
"""
import argparse
import hashlib
import json
import pathlib
import re

VERSIONS = {20003, 20071, 20103, 20176, 20177, 20178, 20231, 20232, 20233, 20234, 20235}
INSERT = re.compile(r'''INSERT\s+INTO\s+"point_catalog"\s+VALUES\s*\(\s*(\d+)\s*,\s*'((?:[^']|'')*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*;''', re.I)

def parse_sql(text):
    records, seen = [], set()
    for line in text.splitlines():
        if not re.search(r'\bINSERT\b', line, re.I):
            continue
        match = INSERT.fullmatch(line.strip())
        if not match:
            raise ValueError('Malformed catalog INSERT')
        point_id, name, value_type, policy = match.groups()
        point_id, name = int(point_id), name.replace("''", "'")
        if point_id <= 0 or not name or point_id in seen:
            raise ValueError('Invalid or duplicate catalog point')
        seen.add(point_id)
        records.append(dict(id=point_id, name=name, dcValueType=int(value_type), archivePolicy=int(policy)))
    if not records:
        raise ValueError('No catalog definitions')
    return sorted(records, key=lambda item: item['id'])

def import_catalog(sql, protocol, references):
    sources = {}
    def source(path):
        data = pathlib.Path(path).read_bytes()
        name = pathlib.Path(path).name
        sources[name] = hashlib.sha256(data).hexdigest()
        return data.decode('utf-8-sig')
    records = parse_sql(source(sql))
    protocol_text = source(protocol)
    units = {}
    for match in re.finditer(r'^\|\s*(\d+)\s*\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|\s*$', protocol_text, re.M):
        point_id, unit = int(match[1]), match[2].strip()
        if unit != '—':
            if point_id in units and units[point_id] != unit:
                raise ValueError('Conflicting explicit units')
            units[point_id] = unit
    placement = {}
    for period, name, count in [('cabinet_30s', '05_机柜30秒完整报文参考.json', 241), ('cabinet_60s', '05_机柜60秒完整报文参考.json', 54)]:
        frame = json.loads(source(pathlib.Path(references) / name))
        if frame['type'] != period:
            raise ValueError('Wrong ordinary reference type')
        for subsystem in ['emu', 'bms', 'tms', 'pvdc', 'pcs', 'grid']:
            for point_id, _ in frame['d'][subsystem]['p']:
                if point_id in placement:
                    raise ValueError('Duplicate ordinary reference point')
                placement[point_id] = (period, subsystem, name)
        if sum(p[0] == period for p in placement.values()) != count:
            raise ValueError('Ordinary reference count mismatch')
    ordinary_ids = set(range(10001, 10042)) | set(range(20001, 20255))
    if not ordinary_ids.issubset({record['id'] for record in records}):
        raise ValueError('SQL catalog missing an ordinary definition')
    if set(placement) != ordinary_ids:
        raise ValueError('Ordinary profile does not cover protocol 295 points')
    definitions = []
    for record in records:
        point_id = record['id']
        entry = dict(namespace='cabinet', sourcePointId=point_id,
                     sourceName=record['name'], wireType='UNKNOWN', verifiedUnit=None, subsystem=None,
                     sourceType=None, provenance=[pathlib.Path(sql).name], sourceMetadata={
                         'dcValueType': record['dcValueType'], 'archivePolicy': record['archivePolicy'],
                         'encodingSemantics': 'unknown', 'writable': 'unknown'})
        if point_id in ordinary_ids:
            period, subsystem, name = placement[point_id]
            entry.update(wireType='TEXT' if point_id in VERSIONS else 'U16_WORDS' if point_id == 20062 else 'NUMBER',
                         sourceType=period, subsystem=subsystem, verifiedUnit=units.get(point_id))
            entry['provenance'] += [name + ' (placement reference)', '05 protocol §3.3']
            if point_id in units:
                entry['provenance'].append('05 protocol appendix A.3 (unit)')
        definitions.append(entry)
    for point_id in range(90002, 90008):
        definitions.append(dict(namespace='ems', sourcePointId=point_id,
            sourceName={90005:'CPU usage', 90006:'Memory usage', 90007:'System uptime seconds'}.get(point_id),
            wireType='NUMBER', verifiedUnit={90005:'%',90006:'%',90007:'s'}.get(point_id),
            subsystem='base', sourceType='ems', provenance=['05 protocol §3.2'],
            sourceMetadata={'semanticMapping': 'confirmed' if point_id >= 90005 else 'unknown', 'writable':'unknown'}))
    ems = json.loads(source(pathlib.Path(references) / '05_EMS完整报文参考.json'))
    config_ids = [pair[0] for pair in ems['d']['cfg']['p']]
    if len(config_ids) != 173 or len(set(config_ids)) != 173:
        raise ValueError('Configuration reference must contain 173 unique IDs')
    for point_id in sorted(config_ids):
        definitions.append(dict(namespace='config', sourcePointId=point_id,
            sourceName={101:'模式',102:'主从'}.get(point_id), wireType='SCALAR', verifiedUnit=None,
            subsystem=None, sourceType='ems', provenance=['05_EMS完整报文参考.json (ID evidence only)', '05 protocol §3.2'],
            sourceMetadata={'scalarType':'unknown','enumSemantics':'unknown','writable':'not_opened'}))
    definitions.sort(key=lambda d: (d['namespace'], d['sourcePointId']))
    source_hash = hashlib.sha256(json.dumps(sources, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return dict(version='ems-v1-profile-20260917', sourceHash=source_hash, sources=sources,
                counts={'sqlDefinitions':len(records), 'ordinary':295, 'ems':6, 'config':173, 'definitions':len(definitions)},
                definitions=definitions)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ('sql', 'protocol', 'references', 'output'):
        parser.add_argument('--' + arg, required=True, type=pathlib.Path)
    args = parser.parse_args()
    result = import_catalog(args.sql, args.protocol, args.references)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'sourceHash':result['sourceHash'], 'counts':result['counts']}, sort_keys=True))

if __name__ == '__main__':
    main()
