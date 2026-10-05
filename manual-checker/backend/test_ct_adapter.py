"""Integration tests use real AP/UT classes with a synthetic, labeled test graph."""
import copy
import logging
import os
from pathlib import Path
import sys
import unittest
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

runtime = Path(__file__).resolve().parents[1] / 'ut-runtime'
sys.path.insert(0, str(runtime))
os.chdir(runtime)
os.environ['SKIP_REQUIREMENTS_UPDATE'] = '1'
sys.argv = ['UniversalTracker.py', '--nogui']
from worlds.AutoWorld import AutoWorldRegister
from worlds.tracker.TrackerCore import TrackerCore
from NetUtils import NetworkItem
from ctrando.common.ctenums import ItemID
from ct_adapter import GAME, SCHEMA, initialize, seed_path
from worlds.tracker import TrackerWorld
TrackerWorld.settings.player_files_path = str(runtime / 'Players')


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.cls = AutoWorldRegister.world_types[GAME]
        package = self.cls.get_data_package_data()
        names = list(package['location_name_to_id'])[:4]
        ids = [package['location_name_to_id'][name] for name in names]
        self.data = dict(seed='test-only', team=0, slot=3, game=GAME, slotData={'ds_replacements': {}},
                         packages={GAME: package}, missing=list(ids), checked=[])
        self.ids = ids
        self.graph = dict(schema=SCHEMA, game=GAME, seed='test-only', team=0, slot=3,
                          slot_data=self.data['slotData'], package=package, origin='starting_rewards',
                          regions=[dict(name='starting_rewards', locations=[dict(name=names[0], id=ids[0]),
                                    dict(name='Starter Character', id=None, event='Test Character')]),
                                   dict(name='pendant', locations=[dict(name=names[1], id=ids[1]),
                                    dict(name='Boss Event', id=None, event='Test Boss')]),
                                   dict(name='charged', locations=[dict(name=names[2], id=ids[2])]),
                                   dict(name='badge', locations=[dict(name=names[3], id=ids[3])])],
                          edges=[{'from':'starting_rewards','to':'pendant','rule':[[str(ItemID.PENDANT),'Test Character']]},
                                 {'from':'pendant','to':'charged','rule':[[str(ItemID.PENDANT_CHARGE),'Test Boss']]},
                                 {'from':'starting_rewards','to':'badge','rule':[[str(ItemID.HERO_MEDAL)]]}])

    def evaluate(self, item_names):
        core = TrackerCore(logging.getLogger('test'), False, False)
        core.set_slot_params(GAME, 3, 'Test Slot', 0)
        initialize(core, self.cls, self.data, self.graph)
        core.set_missing_locations(set(self.data['missing']))
        core.set_items_received([NetworkItem(self.cls.item_name_to_id[name], -1, 3, 1) for name in item_names])
        result = core.updateTracker()
        errors = [line for lines in core.log_lines.values() for line in lines if line.group.value == 'error']
        self.assertEqual(errors, [])
        return set(core.locations_available), result.events

    def test_progressive_and_event_spheres(self):
        self.assertEqual(self.evaluate([])[0], {self.ids[0]})
        self.assertEqual(self.evaluate(['Progressive Pendant'])[0], set(self.ids[:2]))
        available, events = self.evaluate(['Progressive Pendant'] * 2)
        self.assertEqual(available, set(self.ids[:3]))
        self.assertIn('Test Boss', events)
        self.assertEqual(self.evaluate(['Progressive Pendant'] * 3)[0], available)

    def test_ds_badge_and_checked_filter(self):
        self.assertEqual(self.evaluate(['ChampBadge'])[0], {self.ids[0], self.ids[3]})
        self.data['missing'].remove(self.ids[0])
        self.data['checked'].append(self.ids[0])
        self.assertEqual(self.evaluate(['ChampBadge'])[0], {self.ids[3]})

    def test_reject_wrong_seed_and_incomplete_graph(self):
        for key, value in [('seed', 'wrong'), ('slot', 7), ('team', 1)]:
            graph = copy.deepcopy(self.graph)
            graph[key] = value
            with self.assertRaises(ValueError):
                initialize(TrackerCore(logging.getLogger('test'), False, False), self.cls, self.data, graph)
        self.graph['regions'][1]['locations'] = []
        with self.assertRaises(ValueError):
            self.evaluate([])

    def test_safe_seed_path(self):
        self.data['seed'] = '../../escape'
        self.assertEqual(seed_path(self.data).parent.name, 'ct-seeds')

    def test_count_requirements_and_alternative_branches(self):
        self.graph['edges'][0]['rule'] = [['Progressive Pendant', 'Progressive Pendant'], [str(ItemID.SEED)]]
        # Progressive items collect as their native stages, not their receipt label.
        self.assertEqual(self.evaluate(['Progressive Pendant'] * 2)[0], {self.ids[0]})
        self.assertEqual(self.evaluate([str(ItemID.SEED)])[0], set(self.ids[:2]))
        self.graph['edges'][0]['rule'] = [[str(ItemID.SEED), str(ItemID.SEED)]]
        self.assertEqual(self.evaluate([str(ItemID.SEED)])[0], {self.ids[0]})
        self.assertEqual(self.evaluate([str(ItemID.SEED)] * 2)[0], set(self.ids[:2]))

    def test_export_import_roundtrip(self):
        from export_ct_seed import export_seed
        from import_ct_seed import install
        from ct_adapter import validate
        core = TrackerCore(logging.getLogger('test'), False, False)
        core.set_slot_params(GAME, 3, 'Test Slot', 0)
        initialize(core, self.cls, self.data, self.graph)
        world = core.get_current_world()
        # The adapter maps a remote slot to local player 1. Export this test world
        # using that local identity; real generation preserves the original slot.
        connectors = []
        for edge in self.graph['edges']:
            connectors.append(SimpleNamespace(from_region_name=edge['from'], to_region_name=edge['to'],
                              rule=SimpleNamespace(get_access_rule=lambda rule=edge['rule']: rule)))
        world.config = SimpleNamespace(region_map=SimpleNamespace(name_connector_dict={'test': connectors}))
        world.fill_slot_data = lambda: self.data['slotData']
        world.multiworld.seed_name = self.data['seed']
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'UT_CT_SEED_DIR': folder}):
            import json
            source = export_seed(world, Path(folder) / 'source.json')
            graph = json.loads(source.read_text())
            self.assertNotIn('treasure_assignment', graph)
            from ct_adapter import normalized_graph
            self.assertEqual(graph['edges'], normalized_graph(self.graph)['edges'])
            target = install(source)
            self.assertTrue(target.is_file())
            self.assertEqual(install(source), target)
            data = dict(self.data, slot=1)
            validate(graph, data)
            graph['origin'] = 'pendant'
            source.write_text(json.dumps(graph), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
                install(source)


if __name__ == '__main__':
    unittest.main(argv=['test_ct_adapter'])
