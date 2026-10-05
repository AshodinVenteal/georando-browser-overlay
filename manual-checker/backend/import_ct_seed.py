"""Install a generation-time CT logic export into this backend's private cache."""
import argparse
import json
from pathlib import Path
import shutil
from ct_adapter import GAME, seed_path, validate, normalized_graph


def install(source):
    graph = json.loads(Path(source).read_text(encoding='utf-8-sig'))
    data = {'seed': graph['seed'], 'team': graph['team'], 'slot': graph['slot'],
            'slotData': graph['slot_data'], 'packages': {GAME: graph['package']},
            'missing': [loc['id'] for region in graph['regions'] for loc in region['locations'] if loc['id'] is not None],
            'checked': []}
    validate(graph, data)
    target = seed_path(data)
    if target.exists():
        if normalized_graph(json.loads(target.read_text(encoding='utf-8'))) != normalized_graph(graph):
            raise ValueError('A different CT logic file is already installed for this seed; refusing to overwrite.')
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    args = parser.parse_args()
    print(install(args.file))
