"""Read-only ROM structural diagnostics; patches only an in-memory copy."""
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ut-runtime'))
import bsdiff4
from ctrando.common import ctrom, ctenums
from ctrando.overworlds.owmanager import OWManager
from ctrando.overworlds.owexitdata import OWExitClass
from ctrando.locations.scriptmanager import ScriptManager
from ctrando.locations.eventcommand import get_command


def read_patch(base_path, url):
    base = Path(base_path).read_bytes()
    with urllib.request.urlopen(url, timeout=30) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    meta = json.loads(archive.read('archipelago.json'))
    if hashlib.md5(base).hexdigest() != meta['base_checksum']:
        raise ValueError('Base ROM checksum differs from patch.')
    if meta['game'] != 'Chrono Trigger Rando-Dalton Imperial':
        raise ValueError('Not a CT patch.')
    return ctrom.CTRom(bsdiff4.patch(base, archive.read('delta.bsdiff4')), ignore_checksum=True), meta


def commands(script, start=None, end=None):
    pos = script.num_objects * 32 if start is None else start
    end = len(script.data) if end is None else end
    while pos < end:
        cmd = get_command(script.data, pos)
        yield pos, cmd
        pos += len(cmd)


if __name__ == '__main__':
    rom, meta = read_patch('C:/ProgramData/Archipelago/Chrono Trigger (USA).sfc',
                          'https://archipelago.gg/dl_patch/UJTg7y1-TOyMABK6Ai9ttw/8510373')
    manager = OWManager(rom)
    baseline = OWManager(ctrom.CTRom.from_file('C:/ProgramData/Archipelago/Chrono Trigger (USA).sfc'))
    changed = []
    for cls in OWExitClass:
        info = cls.value[0].value
        a = manager[info.overworld_id].exit_data.exits[info.exit_id]
        b = baseline[info.overworld_id].exit_data.exits[info.exit_id]
        if (a.location, a.dest_x, a.dest_y) != (b.location, b.dest_x, b.dest_y):
            changed.append([cls.name, str(ctenums.LocID(a.location)), a.dest_x, a.dest_y])
    print('Changed entrance targets:', json.dumps(changed))
    scripts = ScriptManager(rom)
    from ctrando import randomizer
    from ctrando.common import randostate, memory
    from ctrando.logic.logictypes import ScriptReward
    for reward in ScriptReward:
        try:
            blob = randostate.get_reward_event_code(reward).get_bytearray()
            print('Initial reward',str(reward),'offset',scripts[ctenums.LocID.LOAD_SCREEN].data.find(blob))
        except ValueError:
            pass
    for name in ('LOAD_SCREEN','TITLE_SCREEN'):
        for pos,cmd in commands(scripts[ctenums.LocID[name]]):
            if cmd.command == 0x4E:
                print('COPY',name,hex(pos),str(cmd))
    from ctrando.objectives import objectivetypes
    from ctrando.bosses import bosstypes
    element_ids = {part.enemy_id for boss in (bosstypes.BossID.NIZBEL,bosstypes.BossID.RETINITE) for part in bosstypes.get_default_scheme(boss).parts}
    for spot,locator in objectivetypes.get_boss_locator_dict().items():
        if not hasattr(locator,'loc_id'):continue
        enemy_ids={cmd.args[0] for _,cmd in commands(scripts[locator.loc_id]) if cmd.command == 0x83}
        special=enemy_ids.intersection(element_ids)
        if special:print('ELEMENT BOSS',spot.name,locator.loc_id.name,[ctenums.EnemyID(x).name for x in special])
    for name in ('LOAD_SCREEN', 'LEENE_SQUARE', 'PROTO_DOME', 'MANORIA_SANCTUARY', 'FROGS_BURROW',
                 'DACTYL_NEST_SUMMIT', 'NORTH_CAPE', 'QUEENS_ROOM_600', 'DEATH_PEAK_SUMMIT_AFTER',
                 'GUARDIA_LAWGIVERS_TOWER', 'GUARDIA_THRONEROOM_1000', 'PRISON_SUPERVISORS_OFFICE'):
        script = scripts[ctenums.LocID[name]]
        found = list(commands(script))
        print('\nSCRIPT', name, 'objects', script.num_objects)
        for i, (pos, cmd) in enumerate(found):
            if cmd.command == 0xC8 and 0xC0 <= cmd.args[0] <= 0xC6:
                print('Name/menu command', hex(pos), str(cmd))
                for _, nearby in found[max(0, i-2):i+4]:
                    print(' ', str(nearby))
        from ctrando.common import memory
        from ctrando.locations.eventcommand import EventCommand as EC
        flag_names = ('MANORIA_RECRUIT_OBTAINED','HAS_BURROW_RECRUIT','OBTAINED_DACTYLS',
                      'NORTH_CAPE_RECRUIT_OBTAINED','PROTO_DOME_RECRUIT_OBTAINED')
        for flag_name in flag_names:
            flag = getattr(memory.Flags, flag_name)
            flag_bytes = EC.set_flag(flag).to_bytearray()
            for i, (pos, cmd) in enumerate(found):
                if cmd.to_bytearray() == flag_bytes:
                    print('FLAG',flag_name,hex(pos),'prior',[(hex(p),str(c)) for p,c in found[max(0,i-8):i]])
