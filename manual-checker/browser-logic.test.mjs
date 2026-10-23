import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGraph} from './browser-logic.mjs';
const lit=x=>['literal',x],has=(name,n=1)=>['call','has',[lit(name),lit(1),lit(n)],{}];
function fixture(){
  const graph={schema:'ap-browser-graph-v1',seed:'seed',team:0,slot:2,game:'Paper Mario',slot_data:{},
    package:{item_name_to_id:{Key:1,'3x Star Pieces':2},location_name_to_id:{Chest:10}},player:1,origin:'Menu',regions:['Menu','Room'],groups:{Keys:['Key']},
    items:{1:{name:'Key',progression:true},2:{name:'3x Star Pieces',progression:true}},collection:'paper-mario',
    edges:[{name:'door',from:'Menu',to:'Room',rule:has('Key',2)}],
    locations:[{name:'Boss',region:'Room',id:null,event:'Boss defeated',rule:lit(true)},
      {name:'Chest',region:'Room',id:10,rule:['and',[has('Boss defeated'),has('Star Piece',3)]]}]};
  const live={seed:'seed',team:0,slot:2,game:'Paper Mario',slotData:{},packages:{'Paper Mario':graph.package},items:[],checked:[],missing:[10]};
  return {graph,live};
}
test('browser graph sweeps events, respects counts, collects Paper Mario star pieces and excludes checked locations',()=>{
  const {graph,live}=fixture();
  assert.deepEqual(evaluateGraph(graph,live).in_logic,[]);
  live.items=[{item:1,flags:1},{item:1,flags:1},{item:2,flags:1}];
  assert.deepEqual(evaluateGraph(graph,live).in_logic,[10]);
  assert.deepEqual(evaluateGraph(graph,live).events,['Boss defeated']);
  live.missing=[];live.checked=[10];assert.deepEqual(evaluateGraph(graph,live).in_logic,[]);
});
test('browser graph cannot silently accept a different seed or unknown rule',()=>{
  const {graph,live}=fixture();live.seed='wrong';assert.throws(()=>evaluateGraph(graph,live),/different seed/);
  live.seed='seed';graph.edges[0].rule=['eval','alert(1)'];assert.throws(()=>evaluateGraph(graph,live),/Unknown rule/);
});
test('browser graph item groups, alternatives and negative predicates',()=>{
  const {graph,live}=fixture();
  graph.edges[0].rule=['and',[['call','has_group',[lit('Keys'),lit(1),lit(2)],{}],['not',has('Blocked')]]];
  live.items=[{item:1,flags:1},{item:1,flags:1},{item:2,flags:1}];assert.deepEqual(evaluateGraph(graph,live).in_logic,[10]);
});
