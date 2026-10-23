import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {scan} from './core.mjs';
import {evaluateGraph} from './browser-logic.mjs';
const path=name=>fileURLToPath(new URL(name,import.meta.url));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const server=spawn(path('.venv/Scripts/python.exe'),[path('backend/server.py')],{
  env:{...process.env,PORT:String(port),BIND_HOST:'127.0.0.1',UT_RUNTIME:path('ut-runtime'),UT_PLAYER_DIR:path('private/players'),UT_ALLOWED_ORIGINS:'http://localhost:8000'},stdio:'ignore'});
try{
  let healthy=false;
  for(let n=0;n<50;n++){
    if(server.exitCode!==null)throw new Error('Test API failed to start.');
    try{healthy=(await fetch(`http://127.0.0.1:${port}/health`)).ok;}catch{}
    if(healthy)break;await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(healthy);
  const live=await scan({server:'wss://archipelago.gg:63304',name:'PaperAsh64'});
  const post=endpoint=>fetch(`http://127.0.0.1:${port}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:8000'},body:JSON.stringify(live)});
  const response=await post('graph');
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'http://localhost:8000');
  const graph=await response.json(),browser=evaluateGraph(graph,live);
  const nativeResponse=await post('evaluate');assert.equal(nativeResponse.status,200);
  const native=await nativeResponse.json();assert.deepEqual(browser.in_logic,native.in_logic);
  assert.deepEqual([...browser.events].sort(),[...native.events].sort());
  console.log('POST /graph: exports live reconstructed rules; browser matches /evaluate; normal engine evaluation remains intact.');
}finally{server.kill();}
