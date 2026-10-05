"""Exact CTRDI seed graphs, evaluated by Universal Tracker (never re-randomized)."""
import json
import os
from collections import Counter
from pathlib import Path
from types import MethodType

GAME = 'Chrono Trigger Rando-Dalton Imperial'
SCHEMA = 'ctrdi-logic-v1'


def normalized_graph(graph):
    """Region/rule order is immaterial; progressive stage order is not."""
    value = json.loads(json.dumps(graph))
    for region in value['regions']:
        region['locations'].sort(key=lambda loc: loc['name'])
    value['regions'].sort(key=lambda region: region['name'])
    for edge in value['edges']:
        edge['rule'] = sorted(sorted(branch) for branch in edge['rule'])
    value['edges'].sort(key=lambda edge: json.dumps(edge, sort_keys=True))
    return value


def seed_path(data):
    # Untrusted seed text must never become a filesystem path.
    import hashlib
    identity = json.dumps([str(data['seed']), data['team'], data['slot']], separators=(',', ':'))
    root = Path(os.environ.get('UT_CT_SEED_DIR', Path(__file__).resolve().parents[1] / 'private' / 'ct-seeds'))
    return root / (hashlib.sha256(identity.encode()).hexdigest() + '.json')


def validate(graph, data):
    if graph.get('schema') != SCHEMA or graph.get('game') != GAME:
        raise ValueError('Not a supported CT seed-logic file.')
    for key in ('seed', 'team', 'slot'):
        if graph.get(key) != data[key]:
            raise ValueError(f'CT seed-logic file has a different {key}.')
    if graph.get('package') != data['packages'][GAME]:
        # Checksums may be supplied separately by different network versions.
        for key in ('item_name_to_id', 'location_name_to_id'):
            if graph.get('package', {}).get(key) != data['packages'][GAME].get(key):
                raise ValueError('CT seed-logic file uses a different APWorld data package.')
    if graph.get('slot_data') != data['slotData']:
        raise ValueError('CT seed-logic file does not match the slot data.')
    regions = graph.get('regions', [])
    names = [r['name'] for r in regions]
    if not names or len(set(names)) != len(names) or graph.get('origin') not in names:
        raise ValueError('CT seed-logic file has an invalid region list.')
    locations = [loc for r in regions for loc in r['locations']]
    ids = [loc['id'] for loc in locations if loc['id'] is not None]
    if len(ids) != len(set(ids)) or not set(data['missing'] + data['checked']).issubset(ids):
        raise ValueError('CT seed-logic file does not cover this slot’s locations.')
    loc_names = [loc['name'] for loc in locations]
    if len(loc_names) != len(set(loc_names)):
        raise ValueError('CT seed-logic file has duplicate locations.')
    for loc in locations:
        if loc['id'] is not None and graph['package']['location_name_to_id'].get(loc['name']) != loc['id']:
            raise ValueError('CT location name/id mismatch.')
        if loc['id'] is None and not isinstance(loc.get('event'), str):
            raise ValueError('CT event location has no event reward.')
    for edge in graph.get('edges', []):
        if edge['from'] not in names or edge['to'] not in names:
            raise ValueError('CT seed-logic file contains a dangling entrance.')
        if not isinstance(edge['rule'], list) or not edge['rule']:
            raise ValueError('CT entrance must contain an OR-list of AND-rules.')
        if any(not isinstance(branch, list) or any(not isinstance(item, str) for item in branch) for branch in edge['rule']):
            raise ValueError('CT entrance contains an invalid item requirement.')
    return graph


def access_rule(branches, player, hero_medal_name):
    requirements = [Counter(branch) for branch in branches]

    def allowed(state):
        return any(all(state.has(name, player, count) or
                       (name == hero_medal_name and state.has('ChampBadge', player, count))
                       for name, count in branch.items()) for branch in requirements)
    return allowed


def initialize(core, cls, data, graph=None):
    from BaseClasses import MultiWorld, Region, Location, Item, ItemClassification
    from worlds.tracker import DeferredEntranceMode
    if graph is None:
        path = seed_path(data)
        if not path.is_file():
            raise ValueError('CT needs an exact seed-logic export for this seed. Its slot data omits recruits, '
                             'entrances and rules; the original YAML cannot reconstruct them. '
                             'Use backend/export_ct_seed.py with the original generation world.')
        graph = json.loads(path.read_text(encoding='utf-8'))
    validate(graph, data)
    mw = MultiWorld(1)
    mw.set_seed(0)
    mw.game[1] = GAME
    mw.player_name = {1: core.slot_name}
    world = cls(mw, 1)
    mw.worlds[1] = world
    world.origin_region_name = graph['origin']
    # CTRDI's create_item/collect_item retain native progressive conversion.
    world.ds_replacements = data['slotData'].get('ds_replacements', {})
    # The bundled APWorld's factory only accepts vanilla enum names and cannot
    # create its own progressive/DS items. Preserve network IDs and let its
    # native collect_item do progressive conversion instead.
    import importlib
    native_items = importlib.import_module(cls.__module__).Items
    progression_names = {str(item) for item in native_items.key_item_list}
    progression_names.update(native_items.progressive_items_map.values())
    progression_names.add('ChampBadge')
    def create_item(self, name):
        classification = ItemClassification.progression if name in progression_names else ItemClassification.filler
        return Item(name, classification, self.item_name_to_id[name], self.player)
    world.create_item = MethodType(create_item, world)
    regions = {r['name']: Region(r['name'], 1, mw) for r in graph['regions']}
    mw.regions.extend(regions.values())
    for entry in graph['regions']:
        region = regions[entry['name']]
        for spec in entry['locations']:
            loc = Location(1, spec['name'], spec['id'], region)
            if spec['id'] is None:
                loc.place_locked_item(Item(spec['event'], ItemClassification.progression, None, 1))
            region.locations.append(loc)
    for i, edge in enumerate(graph['edges']):
        exit = regions[edge['from']].create_exit(f'CT-{i}')
        from ctrando.common.ctenums import ItemID
        exit.access_rule = access_rule(edge['rule'], 1, str(ItemID.HERO_MEDAL))
        exit.connect(regions[edge['to']])
    _, core.output_format, core.hide_excluded, core.use_split, _, _, core.sorting_priorities, core.sorting_method = core._set_host_settings()
    core.enable_glitched_logic = False
    core.enforce_deferred_connections = DeferredEntranceMode.disabled
    core.multiworld = mw
    core.player_id = 1
