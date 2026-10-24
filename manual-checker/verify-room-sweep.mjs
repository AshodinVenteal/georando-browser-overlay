import assert from 'node:assert/strict';
import {scan} from './core.mjs';
import {inspectSlot,sweepRoom,analyzeSweep} from './room-sweep.mjs';
const server='wss://archipelago.gg:63304';
const reference=await scan({server,name:'AshedUpFusion'});
if(process.argv.includes('--all')){
  const report=await sweepRoom({reference,server,onProgress:(n,total,name)=>console.log(`${n}/${total} ${name}`)});
  const rows=analyzeSweep(report);
  console.log(`Sampled ${rows.length} slots; ${rows.filter(x=>x.error).length} failed; ${report.hints.length} distinct hints.`);
  for(const row of rows.filter(x=>x.hints.length).slice(0,10))console.log(`${row.name}: ${row.hints.length} unresolved hints (${row.progressionHints} progression); spheres unknown`);
}else{
  const result=await inspectSlot({server,name:'AshedUpFusion',team:reference.team,keys:['_read_hints_0_2','_read_client_status_0_2']});
  assert.equal(result.seed,reference.seed);assert.deepEqual([...result.checked].sort(),[...reference.checked].sort());
  assert(Array.isArray(result.stored._read_hints_0_2));
  console.log(`Read-only room connection: ${result.checked.length} checked, ${result.missing.length} missing; hints and client status readable.`);
}
