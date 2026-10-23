import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {scan} from './core.mjs';
import {evaluateGraph} from './browser-logic.mjs';
const path=name=>fileURLToPath(new URL(name,import.meta.url));
for(const name of ['AshedUpFusion','PaperAsh64']){
  const live=await scan({server:'wss://archipelago.gg:63304',name});
  const graph=JSON.parse(await readFile(path(`data/graph-${live.seed}-${live.team}-${live.slot}.json`),'utf8'));
  const allIds=[...live.missing,...live.checked];
  const maximal=Object.entries(graph.items).filter(([,spec])=>spec.progression).flatMap(([id])=>Array.from({length:30},()=>({item:+id,location:-1,player:live.slot,flags:1})));
  const scenarios=[live,{...live,items:[]},{...live,items:live.items.filter(x=>!(x.flags&1))},
    {...live,missing:allIds,checked:[]},{...live,items:maximal},
    {...live,items:live.items.filter((_,i)=>i%2===0)}];
  for(const input of scenarios){
    const r=spawnSync(path('.venv/Scripts/python.exe'),[path('backend/worker.py')],{input:JSON.stringify(input),encoding:'utf8',timeout:100000,maxBuffer:20*1024*1024,
      env:{...process.env,UT_RUNTIME:path('ut-runtime'),UT_PLAYER_DIR:path('private/players')}});
    assert.equal(r.status,0,r.stdout+r.stderr.slice(-2000));
    const native=JSON.parse(r.stdout),browser=evaluateGraph(graph,input);
    assert.deepEqual(browser.in_logic,native.in_logic,`${name}: ${input.items.length} items`);
    assert.deepEqual([...browser.events].sort(),[...native.events].sort(),`${name}: event mismatch`);
    console.log(`${name}: ${input.items.length} items -> ${browser.in_logic.length}/${input.missing.length}, UT parity passed`);
  }
}
