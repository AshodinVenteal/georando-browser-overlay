// Declarative CT access rules exported from the matching APWorld. No ROM is
// loaded in the browser. Event rewards are swept until reachability stabilizes.
export const CT_GAME='Chrono Trigger Rando-Dalton Imperial';
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(x){
  if(Array.isArray(x))return x.map(canonical);
  if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
  return x;
}
export function validateCT(graph,live){
  if(graph?.schema!=='ctrdi-logic-v1'||graph.game!==CT_GAME||live.game!==CT_GAME)throw new Error('Not a CT seed graph.');
  for(const key of ['seed','team','slot'])if(graph[key]!==live[key])throw new Error(`CT graph has a different ${key}.`);
  if(!equal(graph.slot_data,live.slotData))throw new Error('CT graph has different slot data.');
  for(const key of ['item_name_to_id','location_name_to_id'])if(!equal(graph.package?.[key],live.packages?.[CT_GAME]?.[key]))throw new Error('CT graph uses a different game data package.');
  if(!Array.isArray(graph.regions)||!Array.isArray(graph.edges)||!graph.progressive||!Array.isArray(graph.progression_items)||!graph.hero_medal_name)throw new Error('Incomplete CT graph.');
  const regions=new Set(graph.regions.map(r=>r.name));
  if(regions.size!==graph.regions.length||!regions.has(graph.origin))throw new Error('Invalid CT regions.');
  const ids=new Set(),names=new Set();
  for(const region of graph.regions){
    if(!Array.isArray(region.locations))throw new Error('Invalid CT locations.');
    for(const loc of region.locations){
      if(names.has(loc.name))throw new Error('Duplicate CT location.');names.add(loc.name);
      if(loc.id===null){if(typeof loc.event!=='string')throw new Error('CT event reward missing.');}
      else{
        if(!Number.isInteger(loc.id)||ids.has(loc.id)||graph.package.location_name_to_id[loc.name]!==loc.id)throw new Error('Invalid CT location ID.');
        ids.add(loc.id);
      }
    }
  }
  if([...live.missing,...live.checked].some(id=>!ids.has(id)))throw new Error('CT graph does not cover this seed’s checks.');
  for(const edge of graph.edges){
    if(!regions.has(edge.from)||!regions.has(edge.to)||!Array.isArray(edge.rule)||!edge.rule.length||edge.rule.some(branch=>!Array.isArray(branch)||branch.some(name=>typeof name!=='string')))throw new Error('Invalid CT entrance rule.');
  }
  for(const [name,stages]of Object.entries(graph.progressive)){
    if(!(name in graph.package.item_name_to_id)||!Array.isArray(stages)||stages.length!==2||stages.some(stage=>typeof stage!=='string'))throw new Error('Invalid CT progressive item mapping.');
  }
  return graph;
}
export function evaluateCT(graph,live){
  validateCT(graph,live);
  const byId=new Map(Object.entries(graph.package.item_name_to_id).map(([name,id])=>[id,name]));
  const progression=new Set(graph.progression_items),counts=new Map();
  const grant=name=>counts.set(name,(counts.get(name)||0)+1);
  for(const item of live.items){
    if(item.item<=0)continue;
    const name=byId.get(item.item);if(!name)throw new Error(`Unknown CT received item ${item.item}.`);
    if(!progression.has(name)&&!(item.flags&1))continue;
    const stages=graph.progressive[name];
    if(stages){const next=stages.find(stage=>!(counts.get(stage)>0));if(next)grant(next);}
    else grant(name);
  }
  const allowed=branches=>branches.some(branch=>{
    const needed=new Map();for(const name of branch)needed.set(name,(needed.get(name)||0)+1);
    return [...needed].every(([name,n])=>(counts.get(name)||0)>=n||(name===graph.hero_medal_name&&(counts.get('ChampBadge')||0)>=n));
  });
  const reached=new Set([graph.origin]),collected=new Set(),events=[];
  let changed=true;
  while(changed){
    changed=false;
    for(const edge of graph.edges)if(reached.has(edge.from)&&!reached.has(edge.to)&&allowed(edge.rule)){reached.add(edge.to);changed=true;}
    for(const region of graph.regions)if(reached.has(region.name)){
      for(const loc of region.locations)if(loc.id===null&&!collected.has(loc.name)){
        collected.add(loc.name);grant(loc.event);events.push(loc.event);changed=true;
      }
    }
  }
  const missing=new Set(live.missing);
  const ids=graph.regions.filter(r=>reached.has(r.name)).flatMap(r=>r.locations.filter(loc=>loc.id!==null&&missing.has(loc.id)).map(loc=>loc.id)).sort((a,b)=>a-b);
  return {schema:'ap-ut-snapshot-v1',seed:live.seed,team:live.team,slot:live.slot,game:live.game,
    items:live.items,checked:live.checked,in_logic:ids,events,generated_at:new Date().toISOString(),
    engine:'CT browser graph evaluator (UT parity tested)',logic_source:graph.provenance?.method||'CT APWorld seed graph'};
}
