"""Owner-only conversion of original .archipelago multidata into a sphere index.

Uses AP's restricted unpickler, not pickle.load. Output contains unrevealed
location membership; --include-items additionally exports item placement spoilers.
No source multidata, passwords, connect names or ROM data are copied.
"""
import argparse
import json
from pathlib import Path
import sys
import zlib


def convert(data, team=0, include_items=False):
    spheres = data.get('spheres')
    if not isinstance(spheres,list) or not spheres:
        raise ValueError('This seed has no sendable sphere data.')
    checks=[]
    for number,sphere in enumerate(spheres,1):
        for slot,locations in sphere.items():
            for location in sorted(locations):
                check=dict(sphere=number,slot=int(slot),location=int(location))
                if include_items:
                    item,receiver,flags=data['locations'][slot][location]
                    check.update(item=item,receiver=receiver,flags=flags)
                checks.append(check)
    return dict(schema='ap-sphere-index-v1',seed=str(data['seed_name']),team=team,
                source='Original Archipelago sendable spheres (1-based)',checks=checks)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('multidata',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--team',type=int,default=0)
    parser.add_argument('--include-items',action='store_true')
    args=parser.parse_args()
    runtime=Path(__file__).resolve().parents[1]/'ut-runtime'
    sys.path.insert(0,str(runtime))
    from Utils import restricted_loads
    blob=args.multidata.read_bytes()
    if not blob or blob[0]!=3:raise ValueError('Unsupported multidata version (expected 3).')
    data=restricted_loads(zlib.decompress(blob[1:]))
    index=convert(data,args.team,args.include_items)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('x',encoding='utf-8') as target:
        json.dump(index,target,indent=2)
    print(f'Exported {len(index["checks"])} sphere locations to {args.output}')
