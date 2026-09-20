import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserEngine,MAX_FILE_BYTES} from '../engine.js';

// Virtual file handles test the loading policy without allocating a 1 GB buffer.
// Encoding and decoding remain covered by the actual-WASM fixture checks.
const NativeFile=globalThis.File;
globalThis.File=class {
  constructor(parts,name){this.parts=parts;this.name=name;this.size=parts.reduce((sum,p)=>sum+p.size,0);}
};
after(()=>{globalThis.File=NativeFile;});
function runtime(mount=true){
  const calls=[];
  return {calls,loaded:false,on(){},async load(){calls.push('load');this.loaded=true;},
    async createDir(){},async mount(type,{files},path){calls.push({type,size:files[0].size,path});return mount;},
    async writeFile(path,data){calls.push({written:path,bytes:data.byteLength});},
    terminate(){calls.push('terminate');this.loaded=false;}};
}
test('a virtual 1 GB input uses lazy mounting and never reads its full buffer',async()=>{
  const driver=runtime();const engine=new BrowserEngine(()=>driver);
  const file={size:1024**3,arrayBuffer(){throw new Error('Full input copy is forbidden');}};
  await engine.prepare(file);
  assert.equal(MAX_FILE_BYTES,file.size);
  assert.equal(engine.input,'/source/input.mp4');
  assert.deepEqual(driver.calls[1],{type:'WORKERFS',size:file.size,path:'/source'});
  await engine.prepare(file);
  assert.equal(driver.calls.length,2,'Already prepared input is reused');
  engine.dispose();
});
test('an input above 1 GB is rejected before creating the runtime',async()=>{
  let loaded=false;const engine=new BrowserEngine(()=>{loaded=true;throw new Error('Unexpected runtime');});
  await assert.rejects(engine.prepare({size:1024**3+1}),/até 1 GB/);
  await assert.rejects(engine.prepare({size:0}),/até 1 GB/);
  assert.equal(loaded,false);
});
test('large inputs cannot fall back to copying the whole file when mounting fails',async()=>{
  for(const throws of [false,true]){
    const driver=runtime(false);
    if(throws)driver.mount=async()=>{throw new Error('Mount unavailable');};
    const engine=new BrowserEngine(()=>driver);
    const file={size:800*1024**2,arrayBuffer(){throw new Error('Full input copy is forbidden');}};
    await assert.rejects(engine.prepare(file),/sem copiá-lo inteiro/);
    assert.equal(engine.ff,null);
    assert.equal(driver.loaded,false);
    assert.equal(driver.calls.at(-1),'terminate');
  }
});
test('small files retain the memory fallback for runtimes without mounting support',async()=>{
  const driver=runtime(false);const engine=new BrowserEngine(()=>driver);
  const file={size:3,async arrayBuffer(){return Uint8Array.of(1,2,3).buffer;}};
  await engine.prepare(file);
  assert.equal(engine.input,'input.mp4');
  assert.deepEqual(driver.calls.at(-1),{written:'input.mp4',bytes:3});
  engine.dispose();
});
