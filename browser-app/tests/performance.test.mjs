import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseRuntime} from '../performance.js';
import {BrowserEngine,audioFilter} from '../engine.js';
const desktop={hardwareConcurrency:16,deviceMemory:8,isolated:true,sharedMemory:true};
test('audio modes use whole-output filters with safe voice frequencies',()=>{
  assert.equal(audioFilter('original'),null);
  assert.match(audioFilter('normalize'),/^loudnorm=/);
  assert.match(audioFilter('voice'),/highpass=f=80.*afftdn=.*loudnorm=/);
});
test('parallel processing uses the available CPU while respecting small computers',()=>{
  assert.equal(chooseRuntime(desktop,'auto').threads,8);
  assert.equal(chooseRuntime({...desktop,hardwareConcurrency:4},'auto').threads,3);
  assert.equal(chooseRuntime({...desktop,deviceMemory:2},'auto').threads,2);
  assert.equal(chooseRuntime({...desktop,hardwareConcurrency:4},'8').threads,4);
  assert.equal(chooseRuntime(desktop,'1').multithread,false);
  assert.throws(()=>chooseRuntime(desktop,'64'));
});
test('all mode assigns every reported logical processor, without the balanced-mode cap',()=>{
  for(const cores of [2,8,16,32,64]){
    const runtime=chooseRuntime({...desktop,hardwareConcurrency:cores,deviceMemory:2},'all');
    assert.equal(runtime.threads,cores);assert.equal(runtime.detectedCores,cores);
  }
  const unknown=chooseRuntime({...desktop,hardwareConcurrency:Infinity});
  assert.equal(unknown.detectedCores,null);assert.equal(unknown.threads,2);
});
test('browsers without isolation or shared memory stay compatible',()=>{
  for(const environment of [{...desktop,isolated:false},{...desktop,sharedMemory:false},{...desktop,hardwareConcurrency:1}]){
    const runtime=chooseRuntime(environment,'8');
    assert.equal(runtime.multithread,false);assert.equal(runtime.threads,1);
  }
});
function driver(load){return {loaded:false,terminated:false,on(){},async load(assets){this.assets=assets;await load?.();this.loaded=true;},terminate(){this.terminated=true;this.loaded=false;}};}
test('failure to load parallel workers retries the standard core and reports the fallback',async()=>{
  const parallel=driver(()=>{throw new Error('Worker blocked');});const standard=driver();
  const drivers=[parallel,standard];
  const engine=new BrowserEngine(()=>drivers.shift(),()=>desktop);
  let notice;engine.onRuntime=value=>notice=value;
  await engine.load();
  assert.equal(parallel.terminated,true);
  assert.match(parallel.assets.workerURL,/vendor\/core-mt\/ffmpeg-core.worker.js$/);
  assert.match(standard.assets.coreURL,/vendor\/core\/ffmpeg-core.js$/);
  assert.equal(notice.reason,'fallback');assert.equal(notice.threads,1);
  engine.dispose();
});
test('cancelling a parallel load never starts a replacement worker',async()=>{
  let reject;let created=0;
  const parallel=driver(()=>new Promise((_,fail)=>{reject=fail;}));
  const engine=new BrowserEngine(()=>{created++;return parallel;},()=>desktop);
  const loading=engine.load();engine.dispose();reject(new Error('Stopped'));
  await assert.rejects(loading,/Stopped/);
  assert.equal(created,1);assert.equal(engine.ff,null);
});
