"""Recover supported CTRDI seed structure from a delta patch, never reroll it.

ROM routes/recruits/objectives/starting rewards are authoritative. Static logic
options come from the matching player YAML. Unknown layouts fail closed.
"""
import argparse
from collections import Counter
import contextlib
import importlib
import json
import os
from pathlib import Path
from types import SimpleNamespace
import sys

BACKEND = Path(__file__).resolve().parent
CLI_ARGS = sys.argv[1:]
RUNTIME = BACKEND.parent / 'ut-runtime'
sys.path.insert(0, str(RUNTIME))
os.environ['SKIP_REQUIREMENTS_UPDATE'] = '1'
sys.argv = ['UniversalTracker.py', '--nogui']


def recruits_from_rom(scripts):
    from ctrando.common import ctenums as ct, memory
    from ctrando.base import openworldutils as owu
    from inspect_ct_rom import commands
    increment = bytes(owu.get_increment_addr(memory.Memory.RECRUITS_OBTAINED).get_bytearray())
    recruit_map = {spot: [] for spot in ct.RecruitID}
    startup = scripts[ct.LocID.LOAD_SCREEN]
    copies = [cmd for _, cmd in commands(startup) if cmd.command == 0x4E and cmd.args[:2] == [0x2980, 0x7E]]
    if len(copies) != 1:
        raise ValueError('Unsupported CT starting-party initialization.')
    recruit_map[ct.RecruitID.STARTER] = [ct.CharID(x) for x in copies[0].args[-1][:3] if x < 7]
    spot_scripts = {
        'MILLENNIAL_FAIR': ['LEENE_SQUARE'], 'CRONO_TRIAL': ['PRISON_SUPERVISORS_OFFICE'],
        'PROTO_DOME': ['PROTO_DOME'], 'CATHEDRAL': ['MANORIA_SANCTUARY'],
        'FROGS_BURROW': ['FROGS_BURROW'], 'DACTYL_NEST': ['DACTYL_NEST_SUMMIT'],
        'NORTH_CAPE': ['NORTH_CAPE'], 'CASTLE': ['QUEENS_ROOM_600'],
        'DEATH_PEAK': ['DEATH_PEAK_SUMMIT_AFTER'], 'YAKRA_BOX': ['GUARDIA_LAWGIVERS_TOWER']}
    for spot, loc_names in spot_scripts.items():
        candidates = set()
        for name in loc_names:
            script = scripts[ct.LocID[name]]
            starts = sorted({script.get_function_start(obj, fn) for obj in range(script.num_objects) for fn in range(16)})
            for start, end in zip(starts, starts[1:] + [len(script.data)]):
                blob = bytes(script.data[start:end])
                cmds = [cmd for _, cmd in commands(script, start, end)]
                named = {cmd.args[0] & 7 for cmd in cmds if cmd.command == 0xC8 and 0xC0 <= cmd.args[0] <= 0xC6}
                added = {cmd.args[0] for cmd in cmds if cmd.command in (0xD0, 0xD3)}
                scaled = {cmd.args[0] & 7 for cmd in cmds if cmd.command in (0xFC,0xFD) and 0x80 <= cmd.args[0] <= 0x86}
                # Some recruit writers increment in the calling scene; their
                # recruitment function still has seed-specific level setup.
                candidates.update(named.intersection(added).intersection(named if increment in blob else scaled))
        if len(candidates) > 1:
            raise ValueError(f'Ambiguous CT recruitment code at {spot}.')
        recruit_map[ct.RecruitID[spot]] = [ct.CharID(x) for x in candidates]
    assigned = [char for chars in recruit_map.values() for char in chars]
    if Counter(assigned) != Counter(ct.CharID):
        raise ValueError(f'CT recruitment decoder did not uniquely recover all seven characters: {recruit_map}')
    return recruit_map


def starting_rewards(scripts):
    from ctrando.common import ctenums as ct, memory, randostate
    from ctrando.base import openworldutils as owu
    from ctrando.locations.eventcommand import EventCommand as EC
    from ctrando.logic.logictypes import ScriptReward
    script = scripts[ct.LocID.LOAD_SCREEN]
    setup = bytes(owu.get_epoch_set_block(ct.LocID.OW_APOCALYPSE, epoch_x_coord=0x270,
                  epoch_y_coord=0x258, require_flight_to_move=False, require_epoch_to_move=False).get_bytearray())
    start = bytes(script.data).find(setup)
    if start < 0:
        raise ValueError('Unknown CT initial Epoch setup.')
    start += len(setup)
    end = script.find_exact_command(EC.set_flag(memory.Flags.OW_VORTEX_ACTIVE), start)
    blob = bytes(script.data[start:end])
    patterns = []
    for reward in list(ScriptReward) + list(memory.Flags) + list(ct.ItemID):
        if isinstance(reward, memory.Flags) and not (0x7F0000 <= reward.value.address < 0x7F0400):
            continue
        try:
            patterns.append((bytes(randostate.get_reward_event_code(reward).get_bytearray()), reward))
        except (ValueError, TypeError):
            pass
    patterns.sort(key=lambda pair: len(pair[0]), reverse=True)
    rewards = []
    while blob:
        match = next(((pattern, reward) for pattern, reward in patterns if blob.startswith(pattern)), None)
        if match is None:
            raise ValueError('Unsupported CT initial reward command; refusing to guess starting items.')
        pattern, reward = match
        rewards.append(reward)
        blob = blob[len(pattern):]
    return rewards


def objectives_from_rom(scripts):
    from ctrando.common import ctenums as ct, memory
    from ctrando.objectives import objectivetypes as oty
    from ctrando.arguments.objectiveoptions import ObjectiveOptions
    from ctrando.locations.eventcommand import EventCommand as EC, Operation as OP
    from inspect_ct_rom import commands
    payloads = []
    for loc in (ct.LocID.LOAD_SCREEN, ct.LocID.TITLE_SCREEN):
        matches = [cmd.args[-1] for _, cmd in commands(scripts[loc]) if cmd.command == 0x4E and cmd.args[:2] == [0x0220, 0x7F]]
        if len(matches) != 1 or len(matches[0]) != 8:
            raise ValueError('Unknown CT objective ID table.')
        payloads.append(bytes(matches[0]))
    if payloads[0] != payloads[1]:
        raise ValueError('CT objective tables disagree.')
    enumeration = {value: key for key, value in oty.enumerate_objectives().items()}
    objectives = [enumeration[x] for x in payloads[0]]
    while objectives and objectives[-1] is None:
        objectives.pop()
    options = ObjectiveOptions()
    cmds = [cmd for _, cmd in commands(scripts[ct.LocID.CRONOS_ROOM])]
    thresholds = {
        'num_algetty_portal_objectives': memory.Flags.HAS_ALGETTY_PORTAL,
        'num_omen_objectives': memory.Flags.BLACK_OMEN_ZEAL_AVAILABLE,
        'num_bucket_objectives': memory.Flags.BUCKET_AVAILABLE,
        'num_timegauge_objectives': memory.Flags.HAS_APOCALYPSE_TIMEGAUGE_ACCESS,
        'num_gauntlet_objectives': memory.Flags.LAVOS_GAUNTLET_DISABLED}
    for key, flag in thresholds.items():
        values = set()
        for i, cmd in enumerate(cmds):
            if cmd.to_bytearray() != EC.set_flag(flag).to_bytearray():
                continue
            for prior in reversed(cmds[max(0, i-10):i]):
                found = next((n for n in range(256) if prior.to_bytearray()[:-1] ==
                              EC.if_mem_op_value(memory.Memory.OBJECTIVES_COMPLETED, OP.GREATER_OR_EQUAL, n).to_bytearray()[:-1]), None)
                if found is not None:
                    values.add(found)
                    break
        if len(values) != 1:
            raise ValueError(f'Cannot verify CT objective threshold: {key}.')
        setattr(options, key, values.pop())
    return objectives, options


def recover(data, rom, meta, player_yaml, destination):
    from worlds.AutoWorld import AutoWorldRegister
    from BaseClasses import MultiWorld
    from ctrando.common import ctenums as ct
    from ctrando.locations.scriptmanager import ScriptManager
    from ctrando.overworlds.owmanager import OWManager
    from ctrando.entranceshuffler import regionmap, locregions, owregions
    from ctrando.objectives import objectivetypes as oty, objectivelogic
    from ctrando.bosses import bosstypes as bty
    from ctrando.logic import logictypes
    from ctrando.common import ctrom
    import yaml
    from ct_adapter import GAME, validate
    from export_ct_seed import export_seed
    from inspect_ct_rom import commands
    cls = AutoWorldRegister.world_types[GAME]
    if meta['player'] != data['slot'] or meta['player_name'] != data['slots'][str(data['slot'])]['name']:
        raise ValueError('Patch is for a different CT slot.')
    for key in ('item_name_to_id', 'location_name_to_id'):
        if cls.get_data_package_data()[key] != data['packages'][GAME][key]:
            raise ValueError('CT ROM reader APWorld does not match the connected seed.')
    mw = MultiWorld(data['slot'])
    mw.set_seed(0, name=data['seed'])
    mw.player_name = {data['slot']: meta['player_name']}
    world = cls(mw, data['slot'])
    mw.worlds[data['slot']] = world
    mw.game[data['slot']] = GAME
    settings = yaml.safe_load(Path(player_yaml).read_text(encoding='utf-8-sig'))
    if settings.get('name') != meta['player_name'] or settings.get('game') != GAME:
        raise ValueError('CT player YAML is for a different slot.')
    supplied = settings[GAME]
    hints = cls.options_dataclass.type_hints
    world.options = cls.options_dataclass(**{key: option.from_any(supplied.get(key, option.default)) for key, option in hints.items()})
    world._translate_settings()
    logic_options = world.rdi_settings.logic_options
    if world.rdi_settings.entrance_options.shuffle_gates:
        raise ValueError('ROM gate-shuffle decoding is not supported yet.')
    scripts = ScriptManager(rom)
    manager = OWManager(rom)
    # This first importer supports the actual room's unshuffled entrances.
    # Compare every entrance to the base, allowing only the known openworld
    # Northern Ruins landing-tile fix. Never substitute vanilla for a shuffle.
    base_manager = OWManager(ctrom.CTRom.from_file(os.environ['UT_CT_BASE_ROM']))
    from ctrando.overworlds.owexitdata import OWExitClass
    for exit_class in OWExitClass:
        for member in exit_class.value:
            info = member.value
            a = manager[info.overworld_id].exit_data.exits[info.exit_id]
            b = base_manager[info.overworld_id].exit_data.exits[info.exit_id]
            if (a.location, a.dest_x, a.dest_y) != (b.location, b.dest_x, b.dest_y):
                if not (exit_class.name == 'NORTHERN_RUINS_600' and a.location == ct.LocID.NORTHERN_RUINS_ENTRANCE_600 and (a.dest_x, a.dest_y) == (16, 11)):
                    raise ValueError(f'CT shuffled entrance decoder needed at {exit_class.name}: {(a.location,a.dest_x,a.dest_y)} vs {(b.location,b.dest_x,b.dest_y)}; no vanilla fallback used.')
    recruits = recruits_from_rom(scripts)
    rewards = starting_rewards(scripts)
    objectives, objective_options = objectives_from_rom(scripts)
    connectors = regionmap.get_default_region_connectors(recruits, logic_options)
    rmap = regionmap.RegionMap(owregions.get_ow_regions(), locregions.get_all_loc_regions(),
                              regionmap.get_default_exit_connectors(), connectors)
    rmap.loc_region_dict['starting_rewards'].region_rewards.extend(rewards)
    # Element locks depend on actual ROM boss loads, not a newly randomized boss pool.
    locators = oty.get_boss_locator_dict()
    special_spots = {bty.BossID.NIZBEL: set(), bty.BossID.RETINITE: set()}
    for boss, spots in special_spots.items():
        enemies = {part.enemy_id for part in bty.get_default_scheme(boss).parts}
        for spot, locator in locators.items():
            if not hasattr(locator, 'loc_id'):
                continue
            loaded = {cmd.args[0] for _, cmd in commands(scripts[locator.loc_id]) if cmd.command == 0x83}
            if enemies.issubset(loaded):
                spots.add(spot)
    if not logic_options.disable_element_locks:
        rules = {bty.BossID.NIZBEL: logictypes.LogicRule([[ct.CharID.CRONO], [ct.CharID.ROBO, ct.CharID.MAGUS]]),
                 bty.BossID.RETINITE: logictypes.LogicRule([[ct.CharID.MARLE], [ct.CharID.FROG]])}
        for boss, spots in special_spots.items():
            targets = {name for name, region in rmap.loc_region_dict.items() if spots.intersection(region.reward_spots)}
            for edges in rmap.name_connector_dict.values():
                for edge in edges:
                    if edge.to_region_name in targets:
                        edge.rule &= rules[boss]
    # Quest objectives are recoverable from the ROM's explicit objective table.
    # Boss objectives require a complete boss-assignment decoder, not assumptions.
    if any(isinstance(obj, bty.BossID) for obj in objectives):
        raise ValueError('This CT seed uses boss objectives; full boss-placement decoding is required.')
    objectivelogic.add_objectives_to_map(objectives, {}, objective_options, rmap)
    module = importlib.import_module(cls.__module__)
    world.ds_replacements = data['slotData']['ds_replacements']
    world.fill_slot_data = lambda: data['slotData']
    # Location contents are deliberately not decoded. Server IDs determine which
    # chests are AP checks; nothing receives locally placed treasure in evaluation.
    all_ids = set(data['missing'] + data['checked'])
    world.config = SimpleNamespace(region_map=rmap, recruit_dict=recruits,
        treasure_assignment={treasure: ct.ItemID.MOP for treasure in ct.TreasureID})
    regions = module.Locations.create_region_map(world.config, mw, world.player)
    module.Locations.create_locations_for_regions(regions, world.config, world.rdi_settings,
                                                  module.Items.key_item_list, world.player)
    module.Locations.create_recruit_events(regions, world.config, world.player)
    module.Locations.create_flag_events(regions, world.config, world.player)
    for entry in regions.values():
        for loc in list(entry.ap_region.locations):
            if loc.address is not None and loc.address not in all_ids:
                entry.ap_region.locations.remove(loc)
    mw.regions.extend(entry.ap_region for entry in regions.values())
    path = export_seed(world, destination, data['team'])
    graph = json.loads(path.read_text())
    graph['provenance'] = {
        'method': 'ROM-reconstructed routes, recruits, starting rewards and quest objectives; static rules from matching APWorld and player YAML',
        'patch_sha256': __import__('hashlib').sha256(rom.getvalue()).hexdigest(),
        'recruits': {str(spot): [str(char) for char in chars] for spot, chars in recruits.items()},
        'objectives': [str(obj) for obj in objectives],
        'ignored_yaml_keys': sorted(set(supplied) - set(hints)),
        'logic_options_source': 'local player YAML plus APWorld defaults'}
    validate(graph, data)
    path.write_text(json.dumps(graph, indent=2), encoding='utf-8')
    return graph


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-rom', required=True)
    parser.add_argument('--patch-url', required=True)
    parser.add_argument('--player-yaml', required=True)
    parser.add_argument('--snapshot', required=True, help='Live server snapshot JSON (not UT result)')
    parser.add_argument('--output', required=True)
    args = parser.parse_args(CLI_ARGS)
    os.environ['UT_CT_BASE_ROM'] = str(Path(args.base_rom).resolve())
    data = json.load(sys.stdin) if args.snapshot == '-' else json.loads(Path(args.snapshot).read_text(encoding='utf-8'))
    with contextlib.redirect_stdout(sys.stderr):
        from inspect_ct_rom import read_patch
        rom, metadata = read_patch(args.base_rom, args.patch_url)
        graph = recover(data, rom, metadata, args.player_yaml, Path(args.output))
    print(json.dumps({'regions': len(graph['regions']), 'edges': len(graph['edges']), 'provenance': graph['provenance']}))
