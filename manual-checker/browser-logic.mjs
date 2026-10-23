// Allowlisted declarative rules only: never eval imported Python or JavaScript.
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function validateGraph(graph,live){
  if(graph?.schema!=='ap-browser-graph-v1')throw new Error('Not a browser seed graph.');
  for(const key of ['seed','team','slot','game'])if(graph[key]!==live[key])throw new Error(`Seed graph has a different ${key}.`);
  if(!equal(graph.slot_data,live.slotData))throw new Error('Seed graph options do not match this slot.');
  for(const key of ['item_name_to_id','location_name_to_id'])if(!equal(graph.package?.[key],live.packages?.[live.game]?.[key]))throw new Error('Seed graph data package does not match.');
  if(!Array.isArray(graph.regions)||!graph.regions.includes(graph.origin)||!Array.isArray(graph.edges)||!Array.isArray(graph.locations)||!graph.items||!graph.groups)throw new Error('Incomplete seed graph.');
  const regions=new Set(graph.regions),ids=new Set();
  if(regions.size!==graph.regions.length)throw new Error('Duplicate graph region.');
  const names=new Set();
  for(const loc of graph.locations){
    if(!regions.has(loc.region)||names.has(loc.name))throw new Error('Invalid graph location.');names.add(loc.name);
    if(loc.id!==null){
      if(!Number.isInteger(loc.id)||ids.has(loc.id)||graph.package.location_name_to_id[loc.name]!==loc.id)throw new Error('Invalid graph location ID.');
      ids.add(loc.id);
    }
  }
  if([...live.checked,...live.missing].some(id=>!ids.has(id)))throw new Error('Seed graph is missing this slot’s locations.');
  for(const edge of graph.edges)if(!regions.has(edge.from)||!regions.has(edge.to))throw new Error('Dangling graph entrance.');
  if(!['standard','paper-mario'].includes(graph.collection))throw new Error('Unsupported item collection rules.');
  return graph;
}
export function evaluateGraph(graph,live){
  validateGraph(graph,live);
  const counts=new Map(),reached=new Set([graph.origin]),collected=new Set(),events=[];
  const count=name=>counts.get(name)||0;
  const add=(name,n=1)=>counts.set(name,count(name)+n);
  const collect=name=>{
    if(graph.collection==='paper-mario'){
      if(name==='3x Star Pieces')add('Star Piece',3);
      else if(name.startsWith('StarPiece_')&&count(name)===1)add('Star Piece');
    }
    add(name);
  };
  for(const item of live.items){
    if(item.item<=0)continue;
    const spec=graph.items[item.item];if(!spec)throw new Error(`Unknown received item ${item.item}.`);
    // UT flags override item classification before collecting.
    if(graph.collection==='paper-mario'&&spec.name==='3x Star Pieces'&&!spec.progression&&!(item.flags&1))add('Star Piece',3);
    if(spec.progression||(item.flags&1))collect(spec.name);
  }
  const locationByName=new Map(graph.locations.map(loc=>[loc.name,loc]));
  const edgeByName=new Map(graph.edges.map(edge=>[edge.name,edge]));
  const sum=(names,unique=false)=>names.reduce((total,name)=>total+(unique?Number(count(name)>0):count(name)),0);
  const reach=(name,type='Region')=>{
    if(type==='Region'||type===null)return reached.has(name);
    if(type==='Location'){const loc=locationByName.get(name);return !!loc&&reached.has(loc.region)&&run(loc.rule);}
    if(type==='Entrance'){const edge=edgeByName.get(name);return !!edge&&reached.has(edge.from)&&run(edge.rule);}
    throw new Error(`Unsupported reachability type ${type}.`);
  };
  let budget=0;
  function run(expr){
    if(++budget>10000000)throw new Error('Seed graph evaluation exceeds safety limit.');
    if(!Array.isArray(expr))throw new Error('Invalid rule expression.');
    const [op,a,b,c]=expr;
    if(op==='literal')return a;
    if(op==='list')return a.map(run);
    if(op==='and')return a.every(run);
    if(op==='or')return a.some(run);
    if(op==='not')return !run(a);
    if(op==='if')return run(a)?run(b):run(c);
    if(op==='compare'){
      let left=run(a);
      for(let i=0;i<b.length;i++){
        const right=run(c[i]);
        const compare={ge:()=>left>=right,gt:()=>left>right,le:()=>left<=right,lt:()=>left<right,eq:()=>left===right,ne:()=>left!==right}[b[i]];
        if(!compare)throw new Error('Unknown comparison.');if(!compare())return false;left=right;
      }return true;
    }
    if(op==='math'){
      const left=run(b),right=run(c);
      if(a==='add')return left+right;if(a==='sub')return left-right;if(a==='mul')return left*right;
      if(a==='div')return Math.floor(left/right);if(a==='mod')return ((left%right)+right)%right;
      throw new Error('Unknown arithmetic operation.');
    }
    if(op==='call'){
      const args=b.map(run),kw=Object.fromEntries(Object.entries(c).map(([key,value])=>[key,run(value)]));
      const name=args[0],n=args[2]??kw.count??1;
      if(a==='has')return count(name)>=n;
      if(a==='count')return count(name);
      if(a==='has_all')return name.every(x=>count(x)>0);
      if(a==='has_any')return name.some(x=>count(x)>0);
      if(a==='can_reach')return reach(name,args[1]??kw.resolution_hint??'Region');
      if(a.startsWith('can_reach_'))return reach(name,{can_reach_region:'Region',can_reach_location:'Location',can_reach_entrance:'Entrance'}[a]);
      const allowed=['has_group','has_group_unique','count_group','count_group_unique','has_from_list','has_from_list_unique','count_from_list','count_from_list_unique'];
      if(allowed.includes(a)){
        const names=a.includes('group')?graph.groups[name]:name;
        if(!Array.isArray(names))throw new Error(`Unknown item group ${name}.`);
        const value=sum(names,a.endsWith('unique'));return a.startsWith('has')?value>=n:value;
      }
      throw new Error(`Unsupported state predicate ${a}.`);
    }
    throw new Error(`Unknown rule expression ${op}.`);
  }
  let changed=true;
  while(changed){
    changed=false;
    for(const edge of graph.edges)if(reached.has(edge.from)&&!reached.has(edge.to)&&run(edge.rule)){reached.add(edge.to);changed=true;}
    for(const loc of graph.locations)if(loc.id===null&&loc.event&&!collected.has(loc.name)&&reached.has(loc.region)&&run(loc.rule)){
      collected.add(loc.name);collect(loc.event);events.push(loc.event);changed=true;
    }
  }
  const missing=new Set(live.missing);
  const ids=graph.locations.filter(loc=>loc.id!==null&&missing.has(loc.id)&&reached.has(loc.region)&&run(loc.rule)).map(loc=>loc.id).sort((a,b)=>a-b);
  return {schema:'ap-ut-snapshot-v1',seed:live.seed,team:live.team,slot:live.slot,game:live.game,items:live.items,checked:live.checked,
    in_logic:ids,events,generated_at:new Date().toISOString(),engine:'Browser logic (UT parity tested)',logic_source:'Seed-specific rules reconstructed by the matching APWorld'};
}
