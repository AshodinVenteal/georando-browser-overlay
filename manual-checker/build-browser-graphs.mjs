import {scan} from './core.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const path=name=>fileURLToPath(new URL(name,import.meta.url));
for(const name of ['AshedUpFusion','PaperAsh64']){
  const live=await scan({server:'wss://archipelago.gg:63304',name});
  const r=spawnSync(path('.venv/Scripts/python.exe'),[path('backend/worker.py')],{input:JSON.stringify(live),encoding:'utf8',timeout:100000,maxBuffer:20*1024*1024,
    env:{...process.env,UT_RUNTIME:path('ut-runtime'),UT_PLAYER_DIR:path('private/players'),UT_EXPORT_BROWSER_GRAPH:'1'}});
  if(r.status!==0)throw new Error(r.stdout+r.stderr.slice(-2500));
  const graph=JSON.parse(r.stdout);
  await writeFile(path(`data/graph-${graph.seed}-${graph.team}-${graph.slot}.json`),JSON.stringify(graph));
  console.log(name,graph.regions.length,'regions',graph.edges.length,'edges',graph.locations.length,'locations');
}
