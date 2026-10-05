import test from 'node:test';
import assert from 'node:assert/strict';
import {CT_GAME,evaluateCT} from './ct-logic.mjs';
function fixture(){
  const pkg={item_name_to_id:{'Progressive Pendant':1,Seed:2,ChampBadge:3},location_name_to_id:{Start:10,Middle:11,End:12,Badge:13}};
  const graph={schema:'ctrdi-logic-v1',game:CT_GAME,seed:'test',team:0,slot:3,package:pkg,slot_data:{},origin:'start',
    hero_medal_name:'Hero Medal',progressive:{'Progressive Pendant':['Pendant','Charged Pendant']},progression_items:['Progressive Pendant','Seed','ChampBadge'],
    regions:[{name:'start',locations:[{name:'Start',id:10},{name:'starter-event',id:null,event:'Character'}]},
      {name:'middle',locations:[{name:'Middle',id:11},{name:'boss-event',id:null,event:'Boss'}]},
      {name:'end',locations:[{name:'End',id:12}]},{name:'badge',locations:[{name:'Badge',id:13}]}],
    edges:[{from:'start',to:'middle',rule:[['Pendant','Character'],['Seed','Seed']]},
      {from:'middle',to:'end',rule:[['Charged Pendant','Boss']]},{from:'start',to:'badge',rule:[['Hero Medal']]}]};
  const live={game:CT_GAME,seed:'test',team:0,slot:3,packages:{[CT_GAME]:pkg},slotData:{},items:[],missing:[10,11,12,13],checked:[]};
  return {graph,live};
}
test('CT event sweep and progressive items unlock stages without granting treasure contents',()=>{
  const {graph,live}=fixture();
  assert.deepEqual(evaluateCT(graph,live).in_logic,[10]);
  live.items=[{item:1,flags:1}];assert.deepEqual(evaluateCT(graph,live).in_logic,[10,11]);
  live.items.push({item:1,flags:1});assert.deepEqual(evaluateCT(graph,live).in_logic,[10,11,12]);
  live.items.push({item:1,flags:1});assert.deepEqual(evaluateCT(graph,live).in_logic,[10,11,12]);
  assert(evaluateCT(graph,live).events.includes('Boss'));
});
test('CT repeated requirements, OR rules and DS badge alternative',()=>{
  const {graph,live}=fixture();
  live.items=[{item:2,flags:1}];assert.deepEqual(evaluateCT(graph,live).in_logic,[10]);
  live.items.push({item:2,flags:1});assert.deepEqual(evaluateCT(graph,live).in_logic,[10,11]);
  live.items=[{item:3,flags:1}];assert.deepEqual(evaluateCT(graph,live).in_logic,[10,13]);
  live.missing=[13];live.checked=[10,11,12];assert.deepEqual(evaluateCT(graph,live).in_logic,[13]);
});
test('CT rejects mismatched or incomplete seed data and unknown received items',()=>{
  for(const [key,value]of [['seed','wrong'],['team',1],['slot',7]]){
    const {graph,live}=fixture();live[key]=value;assert.throws(()=>evaluateCT(graph,live),/different/);
  }
  const {graph,live}=fixture();live.items=[{item:999,flags:1}];assert.throws(()=>evaluateCT(graph,live),/Unknown/);
  live.items=[];live.missing.push(99);assert.throws(()=>evaluateCT(graph,live),/cover/);
});
test('CT recognizes reordered object keys and rejects modified rules/package',()=>{
  const {graph,live}=fixture();
  live.packages[CT_GAME]={location_name_to_id:{Badge:13,End:12,Middle:11,Start:10},item_name_to_id:{ChampBadge:3,Seed:2,'Progressive Pendant':1}};
  assert.deepEqual(evaluateCT(graph,live).in_logic,[10]);
  graph.edges[0].to='unknown';assert.throws(()=>evaluateCT(graph,live),/entrance/);
});
