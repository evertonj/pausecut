// Exercise the actual vendored WASM binary without browser UI automation.
// Only the small wrapper driver is adapted to Node; production engine/filters are shared.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import createCore from '../vendor/core/ffmpeg-core.js';
import {BrowserEngine} from '../engine.js';
import {createMultithreadCore,terminateThreads} from './mt-core-adapter.mjs';
const multi=process.argv.includes('--mt');
const cores=Number(process.argv.find(arg=>arg.startsWith('--cores='))?.split('=')[1] || 8);
globalThis.self={location:{href:new URL('../vendor/core/ffmpeg-core.js',import.meta.url).href}};
const core=multi ? await createMultithreadCore(cores+14) : await createCore({wasmBinary:new Uint8Array(await readFile(new URL('../vendor/core/ffmpeg-core.wasm',import.meta.url)))});
console.log(`PASS: vendored ${multi?'multithread':'single-thread'} WebAssembly initialized`);
assert.ok(core.FS.filesystems.WORKERFS,'Production core must include lazy File mounting');
class Driver {
  loaded=false;logCallbacks=[];progressCallbacks=[];
  constructor(){
    core.setLogger(data=>this.logCallbacks.forEach(f=>f(data)));
    core.setProgress(data=>this.progressCallbacks.forEach(f=>f(data)));
  }
  on(event,callback){(event==='log'?this.logCallbacks:this.progressCallbacks).push(callback);}
  async load(){this.loaded=true;}
  async createDir(path){core.FS.mkdir(path);}
  async mount(){return false;} // Node has no synchronous browser FileReader; use the fallback.
  async writeFile(path,data){core.FS.writeFile(path,data);}
  async readFile(path,encoding='binary'){return core.FS.readFile(path,{encoding});}
  async deleteFile(path){core.FS.unlink(path);}
  async exec(args){core.exec(...args);const ret=core.ret;core.reset();return ret;}
  async ffprobe(args){core.ffprobe(...args);const ret=core.ret;core.reset();return ret;}
  terminate(){this.loaded=false;}
}
const fixtureRoot=new URL('../../tests/fixtures/',import.meta.url);
const resultRoot=new URL(`../../artifacts/${multi?'browser-mt-checks':'browser-checks'}/`,import.meta.url);
await mkdir(resultRoot,{recursive:true});
const config={thresholdDb:-35,minSilenceMs:100,paddingMs:40};
const driver=new Driver();const engine=new BrowserEngine(()=>driver,()=>({hardwareConcurrency:cores,deviceMemory:8,isolated:multi,sharedMemory:multi}));
const fixtures=['known-pauses','many-cuts','timestamp-offset','all-silent'];
for(const name of fixtures){
  // Release previous test source and reuse one WASM heap to avoid redundant 256MB allocations.
  if(engine.input){core.FS.unlink(engine.input);core.FS.rmdir('/source');engine.file=null;engine.input=null;}
  const file=new File([await readFile(new URL(`${name}/input.mp4`,fixtureRoot))],`${name}.mp4`,{type:'video/mp4'});
  const analysis=await engine.analyze(file,config,()=>{});
  assert.ok(analysis.plan.removed.length>0,`${name}: detected known pauses`);
  console.log(`PASS: ${name} silence analysis (${analysis.plan.removed.length} cuts)`);
  if(name==='all-silent'){
    assert.equal(analysis.plan.kept.length,0);await assert.rejects(()=>engine.export(file,analysis,'720',()=>{}),/silêncio/);continue;
  }
  const blob=await engine.export(file,analysis,'720',()=>{});
  const data=new Uint8Array(await blob.arrayBuffer());
  assert.ok(data.length>1000);core.FS.writeFile('check.mp4',data);
  await driver.ffprobe(['-v','error','-show_streams','-show_format','-of','json','check.mp4','-o','check.json']);
  const meta=JSON.parse(core.FS.readFile('check.json',{encoding:'utf8'}));
  const video=meta.streams.find(s=>s.codec_type==='video'),audio=meta.streams.find(s=>s.codec_type==='audio');
  assert.equal(video.codec_name,'h264');assert.equal(audio.codec_name,'aac');
  assert.ok(Math.abs(Number(video.duration)-analysis.plan.outputDuration)<.1,`${name}: duration matches plan`);
  assert.ok(Math.abs(Number(video.duration)-Number(audio.duration))<.1,`${name}: AV alignment`);
  assert.ok(video.height<=720&&video.width<=1280);
  const errors=[];const previous=core.logger;
  core.setLogger(({type,message})=>{if(type==='stderr'&&message!=='Aborted()')errors.push(message);});
  core.exec('-v','error','-i','check.mp4','-enc_time_base:v','1:1000000','-f','null','-');
  assert.equal(core.ret,0);core.reset();core.setLogger(previous);
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(new URL(`${name}.mp4`,resultRoot),data);
  core.FS.unlink('check.mp4');core.FS.unlink('check.json');
  console.log(`PASS: ${name} H264/AAC export, decoding and AV sync; ${analysis.info.duration.toFixed(2)} -> ${Number(video.duration).toFixed(2)}s`);
  if(name==='known-pauses'){
    for(const framing of ['crop','blur','fit']){
      const converted=await engine.convert(file,{resolution:'720',aspect:'vertical',framing,focusX:framing==='crop'?25:50,focusY:framing==='crop'?80:50},()=>{});
      core.FS.writeFile('social.mp4',new Uint8Array(await converted.arrayBuffer()));
      await driver.ffprobe(['-v','error','-show_streams','-of','json','social.mp4','-o','social.json']);
      const social=JSON.parse(core.FS.readFile('social.json',{encoding:'utf8'})).streams.find(s=>s.codec_type==='video');
      assert.equal(social.width,720);assert.equal(social.height,1280);
      core.FS.unlink('social.mp4');core.FS.unlink('social.json');
      console.log(`PASS: 9:16 ${framing} conversion at 720x1280`);
    }
    const compressed=await engine.convert(file,{resolution:'720',aspect:'original',compression:'target',targetMiB:1,audioMode:'voice'},()=>{});
    assert.ok(compressed.size<=1024*1024,`target compression exceeded 1 MiB: ${compressed.size}`);
    console.log(`PASS: voice cleanup and target-size compression stayed below 1 MiB (${compressed.size} bytes)`);
  }
}
console.log('PASS: actual WebAssembly engine checks complete');
if(multi)await terminateThreads();
