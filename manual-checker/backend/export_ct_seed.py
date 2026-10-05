"""Call export_seed(world, destination, team=0) during ORIGINAL CT seed generation.

Call after create_regions, before discarding the generated MultiWorld. No ROM,
item placement or other players' spoilers are included. Never regenerate a seed
from its YAML to supply this file: its random graph would differ.
"""
import json
from pathlib import Path
try:
    from .ct_adapter import GAME, SCHEMA, seed_path, normalized_graph
except ImportError:
    from ct_adapter import GAME, SCHEMA, seed_path, normalized_graph


def export_seed(world, destination=None, team=0):
    if world.game != GAME:
        raise ValueError('Expected a CTRDI world.')
    from ctrando.common.ctenums import ItemID
    config = world.config
    regions = []
    for region in world.multiworld.get_regions(world.player):
        locations = []
        for loc in region.locations:
            # Victory has a special rule but is not a network check or a traversal reward.
            if loc.name == 'Victory' and loc.address is None:
                continue
            spec = {'name': loc.name, 'id': loc.address}
            if loc.address is None:
                if loc.item is None:
                    raise ValueError(f'Event {loc.name} has no reward.')
                spec['event'] = loc.item.name
            locations.append(spec)
        regions.append({'name': region.name, 'locations': locations})
    edges = []
    for connectors in config.region_map.name_connector_dict.values():
        for connector in connectors:
            branches = []
            for branch in connector.rule.get_access_rule():
                # Preserve native Hero Medal's alternate DS item requirement.
                branches.append([str(item) for item in branch])
            edges.append({'from': connector.from_region_name, 'to': connector.to_region_name,
                          'rule': branches})
    data = {'schema': SCHEMA, 'game': GAME, 'seed': str(world.multiworld.seed_name),
            'team': team, 'slot': world.player, 'origin': world.origin_region_name,
            'package': world.get_data_package_data(), 'slot_data': world.fill_slot_data(),
            'regions': regions, 'edges': edges}
    # Use the enum's actual display name instead of assuming an English spelling.
    data['hero_medal_name'] = str(ItemID.HERO_MEDAL)
    import importlib
    items = importlib.import_module(type(world).__module__).Items
    data['progressive'] = {items.progressive_items_map[str(upgrade)]: [str(base), str(upgrade)]
                           for upgrade, base in items.progressive_item_upgrades.items()}
    data['progression_items'] = sorted({str(item) for item in items.key_item_list} |
                                       set(items.progressive_items_map.values()) | {'ChampBadge'})
    target = Path(destination) if destination else seed_path(data)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(normalized_graph(data), indent=2), encoding='utf-8')
    return target
