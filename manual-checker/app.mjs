import {socketAddress,scan,identity,history,itemName,locationName,availableChecks} from './core.mjs?v=20261023-2';
import {attachRoomSweep} from './room-sweep-ui.mjs?v=20261023-2';
import {CT_GAME,evaluateCT,validateCT} from './ct-logic.mjs?v=20261005-4';
import {evaluateGraph,validateGraph} from './browser-logic.mjs?v=20261023-1';
const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const settings=read('ap-manual-checker',{});
const state={profiles:settings.profiles||[{slot:'AshedUpFusion',label:''},{slot:'PaperAsh64',label:''},{slot:'AshTrigger',label:''}],results:[],snapshots:read('ap-checker-logic',[]),baseline:read('ap-checker-history',{})};
const ctGraphs=read('ap-checker-ct-graphs',[]);
const browserGraphs=read('ap-checker-browser-graphs',[]);
let updating=false,hasUpdated=false;
async function browserSnapshot(r){
  let graph=browserGraphs.find(x=>identity(x)===identity(r)&&x.game===r.game);
  if(!graph&&r.seed==='14834085843224584573'&&r.team===0&&
     ((r.slot===2&&r.game==='Metroid Fusion')||(r.slot===38&&r.game==='Paper Mario'))){
    $('status').textContent=`${r.game}: loading seed logic…`;
    const response=await fetch(`./data/graph-${r.seed}-${r.team}-${r.slot}.json?v=20261023-1`,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Could not load this slot’s seed graph.');
    graph=await response.json();validateGraph(graph,r);browserGraphs.push(graph);
  }
  return graph?evaluateGraph(graph,r):null;
}
async function ctSnapshot(r){
  let graph=ctGraphs.find(x=>identity(x)===identity(r));
  if(!graph&&r.seed==='14834085843224584573'&&r.team===0&&r.slot===3){
    const response=await fetch('./data/ct-14834085843224584573-0-3.json?v=20261005-4',{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Could not load this room’s CT seed graph.');
    graph=await response.json();validateCT(graph,r);ctGraphs.push(graph);
  }
  return graph?evaluateCT(graph,r):null;
}
$('server').value=settings.server||$('server').value;
$('backend').value=settings.backend||(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'http://127.0.0.1:8765':'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){save('ap-manual-checker',{server:$('server').value,backend:$('backend').value,profiles:state.profiles});}
function downloadJSON(value,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export-snapshots').onclick=()=>{
  const slots=state.results.filter(r=>!r.error).flatMap(r=>{
    const snapshot=state.snapshots.find(x=>identity(x)===identity(r)&&x.game===r.game);
    return snapshot&&availableChecks(r,[snapshot]).ids!==null?[snapshot]:[];
  });
  if(!slots.length){$('status').textContent='Update slots with available logic first.';return;}
  downloadJSON({slots},`ut-snapshots-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
};
$('export-graphs').onclick=()=>{
  const graphs=[...browserGraphs,...ctGraphs].filter(g=>state.results.some(r=>!r.error&&identity(r)===identity(g)&&r.game===g.game));
  if(!graphs.length){$('status').textContent='Update a supported slot first.';return;}
  downloadJSON({graphs},'tracker-seed-graphs.json');
};
function profiles(){
  $('profiles').innerHTML=state.profiles.map((p,i)=>`<div class="profile"><input aria-label="Slot name" data-i="${i}" data-k="slot" value="${esc(p.slot)}" placeholder="Slot name"><input aria-label="Display label" data-i="${i}" data-k="label" value="${esc(p.label)}" placeholder="Optional label"><button data-remove="${i}">Remove</button></div>`).join('');
  $('profiles').querySelectorAll('input').forEach(x=>x.oninput=()=>{state.profiles[x.dataset.i][x.dataset.k]=x.value;persist();});
  $('profiles').querySelectorAll('button').forEach(x=>x.onclick=()=>{state.profiles.splice(+x.dataset.remove,1);persist();profiles();});
}
function render(){
  $('results').innerHTML=state.results.map(r=>{
    if(r.error)return `<article class="panel"><h2>${esc(r.label)}</h2><p class="error">${esc(r.error)}</p></article>`;
    const logic=availableChecks(r,state.snapshots);
    const checks=ids=>ids.map(id=>`<div class="check" data-search="${esc(locationName(r,id).toLowerCase())}">${esc(locationName(r,id))}</div>`).join('');
    return `<article class="panel"><h2>${esc(r.label)}</h2><p class="note">${esc(r.game)} · Slot ${r.slot} · ${esc(r.seed)}</p><div class="stats"><span><b>${logic.ids===null?'—':logic.ids.length}</b>checks available in logic</span><span><b>${r.items.length}</b>items received</span></div>
      <h3>Available checks</h3><p class="note">${esc(r.logicError||logic.reason)}</p><div class="list">${logic.ids===null?'':checks(logic.ids)||'<p class="note">No unchecked locations currently reachable.</p>'}</div>
      <details><summary>All unfinished checks (${r.missing.length})</summary><input class="filter" placeholder="Search unfinished checks"><div class="list">${checks(r.missing)}</div></details>
      <h3>Received items · newest first</h3><p class="note">NEW marks arrivals since the previous successful update on this browser. The first update establishes a baseline.</p><div class="list">${r.history.map(x=>{
        const sender=r.players.find(p=>p.slot===x.player&&p.team===r.team);
        return `<div class="item"><div>${esc(itemName(r,x.item))}<small>#${x.index+1} · ${esc(sender?.alias||sender?.name||'Starting inventory')}${x.location>0?' · '+esc(locationName(r,x.location,r.slots[x.player]?.game)):''}</small></div>${x.isNew?'<span class="badge">NEW</span>':''}</div>`;
      }).join('')||'<p class="note">No received items.</p>'}</div></article>`;
  }).join('');
  $('results').querySelectorAll('.filter').forEach(input=>input.oninput=()=>input.parentElement.querySelectorAll('.check').forEach(x=>x.hidden=!x.dataset.search.includes(input.value.toLowerCase())));
}
$('add').onclick=()=>{state.profiles.push({slot:'',label:''});profiles();persist();};
$('logic').onchange=async event=>{
  try{
    const incoming=[];
    for(const file of event.target.files){
      const data=JSON.parse(await file.text());
      if(data.graphs||['ctrdi-logic-v1','ap-browser-graph-v1'].includes(data.schema)){
        for(const graph of data.graphs||[data]){
          if(!['ctrdi-logic-v1','ap-browser-graph-v1'].includes(graph.schema)||!Array.isArray(graph.regions)||!Array.isArray(graph.edges))throw new Error('Invalid seed graph.');
          const target=graph.schema==='ctrdi-logic-v1'?ctGraphs:browserGraphs;
          const old=target.findIndex(x=>identity(x)===identity(graph));
          if(old>=0)target.splice(old,1);target.push(graph);
        }
        save('ap-checker-ct-graphs',ctGraphs);save('ap-checker-browser-graphs',browserGraphs);continue;
      }
      for(const x of data.slots||[data]){
        if(x.schema!=='ap-ut-snapshot-v1'||!Array.isArray(x.items)||!Array.isArray(x.in_logic)||!Array.isArray(x.checked)||typeof x.seed!=='string'||!Number.isInteger(x.slot)||!Number.isInteger(x.team))throw new Error('Not a Universal Tracker snapshot.');
        incoming.push(x);
      }
    }
    for(const x of incoming)state.snapshots=[...state.snapshots.filter(old=>identity(old)!==identity(x)),x];
    save('ap-checker-logic',state.snapshots);render();$('status').textContent=`Imported logic files. Use Update all slots to evaluate the current inventory.`;
  }catch(error){$('status').textContent=error.message;}
};
$('update').onclick=async()=>{
  if(updating)return;updating=true;
  const buttons=document.querySelectorAll('button');buttons.forEach(x=>x.disabled=true);
  try{
    const server=socketAddress($('server').value,location.protocol==='https:');persist();
    const slots=state.profiles.filter(p=>p.slot.trim());if(!slots.length)throw new Error('Add at least one slot.');
    state.results=[];render();
    for(const p of slots){
      const label=p.label||p.slot;
      try{
        const r=await scan({server,name:p.slot,password:$('password').value,onStage:stage=>$('status').textContent=`${label}: ${stage}…`});
        const backend=$('backend').value.trim().replace(/\/$/,'');
        let browserLogic=false;
        if(r.game==='Metroid Fusion'||r.game==='Paper Mario'){
          try{
            const snapshot=await browserSnapshot(r);
            if(snapshot){state.snapshots=[...state.snapshots.filter(x=>identity(x)!==identity(r)),snapshot];browserLogic=true;}
            else if(!backend)r.logicError='No browser seed graph installed for this slot. Import its matching graph or configure a UT engine.';
          }catch(error){
            state.snapshots=state.snapshots.filter(x=>identity(x)!==identity(r));
            r.logicError=`Browser logic unavailable: ${error.message}`;browserLogic=true;
          }
        }
        if(r.game===CT_GAME){
          try{
            const snapshot=await ctSnapshot(r);
            if(snapshot){state.snapshots=[...state.snapshots.filter(x=>identity(x)!==identity(r)),snapshot];browserLogic=true;}
            else if(!backend)r.logicError='CT needs a ROM-reconstructed seed graph for this seed. Import it below or configure the local engine.';
          }catch(error){
            state.snapshots=state.snapshots.filter(x=>identity(x)!==identity(r));
            r.logicError=`CT logic unavailable: ${error.message}`;browserLogic=true;
          }
        }
        if(backend&&!browserLogic){
          $('status').textContent=`${label}: calculating Universal Tracker logic…`;
          try{
            const generateGraph=r.game==='Metroid Fusion'||r.game==='Paper Mario';
            const response=await fetch(`${backend}/${generateGraph?'graph':'evaluate'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r),signal:AbortSignal.timeout(100000)});
            const answer=await response.json();
            if(!response.ok)throw new Error(answer.error||`Logic engine returned ${response.status}`);
            let snapshot=answer;
            if(generateGraph){
              validateGraph(answer,r);snapshot=evaluateGraph(answer,r);
              browserGraphs.push(answer);
              try{save('ap-checker-browser-graphs',browserGraphs);}catch{ /* In-memory graph still avoids repeated backend calls. */ }
            }
            if(snapshot.schema!=='ap-ut-snapshot-v1'||identity(snapshot)!==identity(r)||!Array.isArray(snapshot.in_logic))throw new Error('Logic engine returned an invalid snapshot.');
            state.snapshots=[...state.snapshots.filter(x=>identity(x)!==identity(r)),snapshot];
          }catch(error){
            state.snapshots=state.snapshots.filter(x=>identity(x)!==identity(r));
            r.logicError=`Logic unavailable: ${error.message}`;
          }
        }
        r.label=label;r.history=history(r,state.baseline[identity(r)]);
        state.baseline[identity(r)]={items:r.items};save('ap-checker-history',state.baseline);state.results.push(r);
      }catch(error){state.results.push({label,error:error.message});}render();
    }
    const connected=state.results.filter(r=>!r.error);
    hasUpdated=connected.length>0;
    $('status').textContent=`Updated ${connected.length} of ${slots.length} slots; logic available for ${connected.filter(r=>availableChecks(r,state.snapshots).ids!==null).length}.`;
  }catch(error){$('status').textContent=error.message;}
  finally{updating=false;buttons.forEach(x=>x.disabled=false);}
};
setInterval(()=>{if(hasUpdated&&!updating&&!document.hidden&&$('auto-refresh').checked)$('update').onclick();},60000);
profiles();render();
attachRoomSweep({getReference:()=>state.results.find(r=>!r.error)});
