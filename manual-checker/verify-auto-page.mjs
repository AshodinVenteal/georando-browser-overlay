// Integration: invoke the actual page handler with live room data and no engine.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const elements=new Map();
const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,checked:true,querySelectorAll:()=>[]});
  return elements.get(id);
};
globalThis.document={getElementById:element,querySelectorAll:()=>[],hidden:false};
globalThis.location={hostname:'ashodinventeal.github.io',protocol:'https:'};
const stored=new Map([['ap-manual-checker',JSON.stringify({server:'wss://archipelago.gg:63304',backend:'https://offline.invalid',profiles:['AshedUpFusion','PaperAsh64','AshTrigger'].map(slot=>({slot,label:''}))})]]);
globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
let timer;
let connections=0;
const NativeSocket=globalThis.WebSocket;
globalThis.WebSocket=class extends NativeSocket{constructor(...args){super(...args);connections++;}};
globalThis.setInterval=(fn,ms)=>{assert.equal(ms,60000);timer=fn;return 0;};
let loads=0;
globalThis.fetch=async url=>{
  assert(String(url).startsWith('./data/'),'Bundled slots must never need the backend');loads++;
  return {ok:true,json:async()=>JSON.parse(await readFile(new URL(String(url).split('?')[0],import.meta.url),'utf8'))};
};
await import('./app.mjs');
await element('update').onclick();
assert.match(element('status').textContent,/Updated 3 of 3 slots; logic available for 3/);
assert.equal(loads,3);
assert.doesNotMatch(element('results').innerHTML,/Logic unavailable|Browser logic unavailable|Unknown item/);
assert.match(element('results').innerHTML,/Browser logic \(UT parity tested\)/);
// Auto-refresh must respect visibility and the checkbox; then recalculate all
// three games using the in-memory graphs, even with a stale engine URL saved.
document.hidden=true;assert.equal(timer(),undefined);document.hidden=false;
element('auto-refresh').checked=false;assert.equal(timer(),undefined);element('auto-refresh').checked=true;
await element('update').onclick();
assert.equal(loads,3);
assert.match(element('status').textContent,/logic available for 3/);
assert.equal(connections,6);
timer();
for(let i=0;i<200&&connections<9;i++)await new Promise(resolve=>setTimeout(resolve,100));
for(let i=0;i<200&&!/Updated 3 of 3 slots; logic available for 3/.test(element('status').textContent);i++)await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(connections,9,'Automatic timer must reconnect every slot');
assert.equal(loads,3,'Automatic refresh reuses seed graphs');
assert.match(element('status').textContent,/logic available for 3/);
let downloaded;
document.createElement=()=>({click(){downloaded=this;}});
element('export-snapshots').onclick();
assert.match(downloaded.download,/ut-snapshots-/);
const snapshots=await (await fetchNative(downloaded.href)).json();
assert.equal(snapshots.slots.length,3);
element('export-graphs').onclick();
const graphs=await (await fetchNative(downloaded.href)).json();
assert.equal(graphs.graphs.length,3);
console.log('All three slots: online handler twice, offline backend bypassed, automatic refresh controls and JSON downloads passed.');
await element('sweep-room').onclick();
assert.match(element('sweep-status').textContent,/Sweep complete\. 0 slots failed/);
assert.match(element('sweep-results').innerHTML,/48\/48 player slots sampled/);
assert.match(element('sweep-results').innerHTML,/NOT early-sphere results/);
assert.match(element('sweep-results').innerHTML,/sphere status unknown/);
assert.doesNotMatch(element('sweep-results').innerHTML,/undefined|NaN/);
console.log('Room sweep page handler: 48 live slots rendered, unresolved hints shown, no guessed spheres.');
async function fetchNative(url){
  // Node resolves blob URLs via its buffer API without internet.
  const {resolveObjectURL}=await import('node:buffer');
  return {json:async()=>JSON.parse(await resolveObjectURL(url).text())};
}
