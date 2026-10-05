import {scan} from './core.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {evaluateCT} from './ct-logic.mjs';
const live=await scan({server:'wss://archipelago.gg:63304',name:'AshTrigger'});
const path=name=>fileURLToPath(new URL(name,import.meta.url));
const args=[path('backend/recover_ct_rom.py'),'--base-rom','C:/ProgramData/Archipelago/Chrono Trigger (USA).sfc',
  '--patch-url','https://archipelago.gg/dl_patch/UJTg7y1-TOyMABK6Ai9ttw/8510373',
  '--player-yaml',path('private/players/AshTrigger.yaml'),'--snapshot','-',
  '--output',path('private/ct-rom-graph.json')];
const result=spawnSync(path('.venv/Scripts/python.exe'),args,{input:JSON.stringify(live),encoding:'utf8',timeout:90000,maxBuffer:10*1024*1024});
console.log(result.stdout);
if(result.status!==0){console.error(result.stderr.slice(-4500));process.exit(1);}
const graph=JSON.parse(await readFile(path('private/ct-rom-graph.json'),'utf8'));
const install=spawnSync(path('.venv/Scripts/python.exe'),[path('backend/import_ct_seed.py'),path('private/ct-rom-graph.json')],{encoding:'utf8'});
assert.equal(install.status,0,install.stderr);
const scenarios=[live,{...live,items:[]},{...live,items:live.items.filter(x=>!(x.flags&1))},
  {...live,items:live.items.filter(x=>x.item!==50350337)},
  {...live,items:Object.entries(graph.package.item_name_to_id).filter(([name])=>graph.progression_items.includes(name)).flatMap(([,id])=>Array.from({length:4},()=>({item:id,location:-1,player:3,flags:1})))},
  {...live,missing:[...live.missing,...live.checked],checked:[]}];
for(const input of scenarios){
  const native=spawnSync(path('.venv/Scripts/python.exe'),[path('backend/worker.py')],{
    input:JSON.stringify(input),encoding:'utf8',timeout:90000,maxBuffer:10*1024*1024,
    env:{...process.env,UT_RUNTIME:path('ut-runtime'),UT_PLAYER_DIR:path('private/players')}});
  assert.equal(native.status,0,native.stderr.slice(-2500));
  const answer=JSON.parse(native.stdout),browser=evaluateCT(graph,input);
  assert.deepEqual(browser.in_logic,answer.in_logic);
  assert.deepEqual([...browser.events].sort(),[...answer.events].sort());
  assert(answer.in_logic.every(id=>input.missing.includes(id)));
  console.log(`UT/browser parity: ${input.items.length} items -> ${answer.in_logic.length}/${input.missing.length} available`);
  if(input.items.length>live.items.length)assert(answer.in_logic.length>0,'Maximal progression must unlock checks.');
}
const answer=evaluateCT(graph,live);
console.log('Available:',Object.entries(live.packages[live.game].location_name_to_id).filter(([,id])=>answer.in_logic.includes(id)).map(([name])=>name).join(', '));
// This generated artifact contains routes/rules only. Never export ROM bytes,
// passwords, the live inventory, or other slots' item placements.
await mkdir(path('data'),{recursive:true});
await writeFile(path(`data/ct-${graph.seed}-${graph.team}-${graph.slot}.json`),JSON.stringify(graph));
console.log('Verified seed graph exported for the page.');
