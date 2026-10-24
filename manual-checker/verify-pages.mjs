import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base='https://ashodinventeal.github.io/georando-browser-overlay/manual-checker/';
for (const file of ['index.html','core.mjs','app.mjs','ct-logic.mjs','browser-logic.mjs','room-sweep.mjs','room-sweep-ui.mjs',
  'data/ct-14834085843224584573-0-3.json','data/graph-14834085843224584573-0-2.json','data/graph-14834085843224584573-0-38.json']) {
  const response=await fetch(`${base}${file}?verify=${Date.now()}`);
  assert.equal(response.status,200,`${file} HTTP status`);
  const actual=await response.text();
  assert(actual.replace(/\r\n/g,'\n') === (await readFile(new URL(file,import.meta.url),'utf8')).replace(/\r\n/g,'\n'),`${file} deployed content differs; Pages may still be building`);
  if (file==='core.mjs') {
    const {scan,itemName}=await import(`data:text/javascript;base64,${Buffer.from(actual).toString('base64')}`);
    const result=await scan({server:'wss://archipelago.gg:63304',name:'AshedUpFusion'});
    console.log(`Deployed connector: ${result.game}, ${result.items.length} items; latest: ${itemName(result,result.items.at(-1).item)}.`);
  }
  if(file.startsWith('data/ct-')){
    const {scan}=await import('./core.mjs');
    const code=await (await fetch(`${base}ct-logic.mjs?verify=${Date.now()}`)).text();
    const {evaluateCT}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const live=await scan({server:'wss://archipelago.gg:63304',name:'AshTrigger'});
    const graph=JSON.parse(actual),answer=evaluateCT(graph,live);
    assert(answer.in_logic.every(id=>live.missing.includes(id)));
    const maximal={...live,items:Object.entries(graph.package.item_name_to_id).filter(([name])=>graph.progression_items.includes(name)).flatMap(([,id])=>Array.from({length:4},()=>({item:id,location:-1,player:3,flags:1})))};
    assert(evaluateCT(graph,maximal).in_logic.length>0);
    console.log(`Deployed CT evaluator: ${answer.in_logic.length}/${live.missing.length} available; maximal-progression sanity check passed.`);
  }
  if(file.startsWith('data/graph-')){
    const {scan}=await import('./core.mjs');
    const code=await (await fetch(`${base}browser-logic.mjs?verify=${Date.now()}`)).text();
    const {evaluateGraph}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const graph=JSON.parse(actual);
    const live=await scan({server:'wss://archipelago.gg:63304',name:graph.slot===2?'AshedUpFusion':'PaperAsh64'});
    const answer=evaluateGraph(graph,live);
    assert(answer.in_logic.every(id=>live.missing.includes(id)));
    console.log(`Deployed ${live.game}: ${answer.in_logic.length}/${live.missing.length} available with no Python backend.`);
  }
  console.log(`Verified Pages: ${file}`);
}
