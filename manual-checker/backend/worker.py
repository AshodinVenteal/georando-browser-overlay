"""Isolated Universal Tracker evaluation. Read one browser snapshot on stdin."""
import contextlib
import json
import logging
import os
from pathlib import Path
import sys
import tempfile
import shutil
from datetime import datetime, timezone


def evaluate(data):
    runtime = Path(os.environ['UT_RUNTIME']).resolve()
    sys.path.insert(0, str(runtime))
    os.chdir(runtime)
    sys.argv = [str(runtime / 'UniversalTracker.py'), '--nogui']
    os.environ['SKIP_REQUIREMENTS_UPDATE'] = '1'
    from worlds.AutoWorld import AutoWorldRegister
    from worlds.tracker.TrackerCore import TrackerCore
    from NetUtils import NetworkItem
    from worlds.tracker import UT_VERSION, TrackerWorld

    player_dir = os.environ.get('UT_PLAYER_DIR')
    default_players = runtime / 'Players'
    default_players.mkdir(exist_ok=True)
    TrackerWorld.settings.player_files_path = player_dir or str(default_players)

    game = data['game']
    cls = AutoWorldRegister.world_types.get(game)
    if cls is None:
        raise ValueError(f'APWorld for {game} is not installed on the logic server.')
    local = cls.get_data_package_data()
    remote = data['packages'][game]
    if any(local.get(k) != remote.get(k) for k in ('item_name_to_id', 'location_name_to_id')):
        raise ValueError(f'The installed APWorld for {game} does not match this seed. Install the matching version.')
    core = TrackerCore(logging.getLogger('UT'), False, False)
    slot_name = data['slots'][str(data['slot'])]['name']
    core.set_slot_params(game, data['slot'], slot_name, data['team'])
    if game == 'Chrono Trigger Rando-Dalton Imperial':
        from ct_adapter import initialize
        initialize(core, cls, data)
    elif not getattr(cls, 'ut_can_gen_without_yaml', False):
        if not player_dir or not any(x.suffix.lower() in ('.yaml', '.yml') for x in Path(player_dir).iterdir()):
            raise ValueError(f'{game} needs its original player YAML on the logic server.')
        core.player_folder_override = player_dir
        core.run_generator()
    if game != 'Chrono Trigger Rando-Dalton Imperial':
        core.initalize_tracker_core(cls, data['slotData'])
    if core.tracker_disabled:
        raise ValueError(f'{game} disables Universal Tracker support.')
    if core.multiworld is None or core.player_id is None:
        raise ValueError(core.gen_error or f'Universal Tracker could not reconstruct {game}.')
    world = core.get_current_world()
    storage_keys = getattr(world, 'found_entrances_datastorage_key', None)
    if storage_keys:
        if isinstance(storage_keys, str):
            storage_keys = [storage_keys]
        keys = [x.format(player=data['slot'], team=data['team']) for x in storage_keys]
        stored = data.get('storedData', {})
        if any(x not in stored for x in keys):
            raise ValueError('This slot needs discovered-entrance data; its logic cannot yet be evaluated by this service.')
        core.set_stored_data(stored)
        raise ValueError('Discovered-entrance worlds require UT context integration and are not yet supported by this service.')
    core.set_missing_locations(set(data['missing']))
    core.set_items_received([NetworkItem(x['item'], x['location'], x['player'], x.get('flags', 0)) for x in data['items']])
    result = core.updateTracker()
    errors = [line.location_label for lines in core.log_lines.values() for line in lines if line.group.value == 'error']
    if errors:
        raise ValueError('; '.join(errors))
    return dict(schema='ap-ut-snapshot-v1', seed=data['seed'], team=data['team'],
                slot=data['slot'], game=game, items=data['items'], checked=data['checked'],
                in_logic=sorted(set(core.locations_available).intersection(data['missing'])),
                events=list(result.events), generated_at=datetime.now(timezone.utc).isoformat(),
                engine=f'Universal Tracker {UT_VERSION}')


if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        with tempfile.TemporaryDirectory(prefix='ut-slot-') as folder:
            player_dir = os.environ.get('UT_PLAYER_DIR')
            if player_dir:
                import yaml
                name = data['slots'][str(data['slot'])]['name']
                for path in Path(player_dir).iterdir():
                    if path.suffix.lower() in ('.yaml', '.yml'):
                        content = yaml.safe_load(path.read_text(encoding='utf-8-sig'))
                        if isinstance(content, dict) and content.get('name') == name:
                            shutil.copyfile(path, Path(folder) / path.name)
                os.environ['UT_PLAYER_DIR'] = folder
            with contextlib.redirect_stdout(sys.stderr):
                answer = evaluate(data)
        print(json.dumps(answer))
    except Exception as error:
        logging.exception('Logic evaluation failed')
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
