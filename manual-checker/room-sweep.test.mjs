import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSweep,validateSpheres,sweepRoom,inspectSlot} from './room-sweep.mjs';
const reference={seed:'seed',team:0,slot:1,slots:{1:{name:'One',game:'A',type:1},2:{name:'Two',game:'B',type:1},3:{name:'Group',game:'Archipelago',type:2}}};
test('exact spheres rank earliest remaining checks, not all missing; completed and unknown locations excluded',()=>{
  const index={schema:'ap-sphere-index-v1',seed:'seed',team:0,checks:[{sphere:1,slot:1,location:10},{sphere:3,slot:1,location:11},{sphere:1,slot:2,location:20},{sphere:2,slot:2,location:21}]};
  validateSpheres(index,reference);
  const current={seed:'seed',team:0,slots:[{slot:1,checked:[10],missing:[11,12]},{slot:2,checked:[],missing:[20,21]}],hints:[]};
  const rows=analyzeSweep(current,{index,maxSphere:2});
  assert.equal(rows[0].slot,2);assert.deepEqual(rows[0].early.map(x=>x.location),[20,21]);assert.equal(rows[1].early.length,0);
});
test('fallback hints are not called spheres; stale found hints and checked checks are excluded',()=>{
  const current={seed:'seed',team:0,slots:[{slot:1,checked:[10],missing:[11]},{slot:2,error:'refused'}],hints:[{finding_player:1,location:10,found:false,item_flags:1},{finding_player:1,location:11,found:false,item_flags:1,status:30},{finding_player:1,location:11,found:true,item_flags:1}]};
  const rows=analyzeSweep(current,{previous:{seed:'seed',team:0,slots:[{slot:1,checked:[],missing:[10,11]}]}});
  assert.equal(rows[0].hints.length,1);assert.equal(rows[0].earliest,null);assert.equal(rows[0].newChecks,1);assert.equal(rows[1].newChecks,null);
});
test('wrong seed/team and duplicate sphere membership are rejected',()=>{
  assert.throws(()=>validateSpheres({schema:'ap-sphere-index-v1',seed:'other',team:0,checks:[]},reference),/match/);
  const check={sphere:1,slot:1,location:10};assert.throws(()=>validateSpheres({schema:'ap-sphere-index-v1',seed:'seed',team:0,checks:[check,check]},reference),/duplicate/);
});
test('sweep filters groups, deduplicates hints and isolates failed slots',async()=>{
  let calls=0;
  const inspect=async({name,keys})=>{
    calls++;if(name==='Two')throw new Error('password required');
    const hint={finding_player:1,receiving_player:2,location:11,found:false};
    return {seed:'seed',team:0,slot:1,checked:[10],missing:[11],stored:keys?.length?{'_read_hints_0_1':[hint],'_read_hints_0_2':[hint],'_read_client_status_0_1':30}:{}};
  };
  const report=await sweepRoom({reference,server:'wss://example.invalid',inspect});
  assert.equal(report.slots.length,2);assert.equal(report.hints.length,1);assert.equal(calls,2);assert.equal(report.slots[1].error,'password required');
});
test('sweep connection only sends Connect and read-only Get, requests no item stream',async()=>{
  const sent=[];
  class Socket{
    constructor(){queueMicrotask(()=>this.onmessage({data:JSON.stringify([{cmd:'RoomInfo',seed_name:'seed'}])}));}
    send(raw){const p=JSON.parse(raw)[0];sent.push(p);
      if(p.cmd==='Connect')queueMicrotask(()=>this.onmessage({data:JSON.stringify([{cmd:'Connected',team:0,slot:1,checked_locations:[10],missing_locations:[11]}])}));
      if(p.cmd==='Get')queueMicrotask(()=>this.onmessage({data:JSON.stringify([{cmd:'Retrieved',keys:{_read_hints_0_1:[]}}])}));}
    close(){}
  }
  const result=await inspectSlot({server:'wss://example.invalid',name:'One',keys:['_read_hints_0_1'],Socket});
  assert.equal(result.checked.length,1);assert.deepEqual(sent.map(x=>x.cmd),['Connect','Get']);assert.equal(sent[0].items_handling,0);assert(sent[0].tags.includes('Tracker'));
});
