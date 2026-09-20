// Functional benchmark of shipped cores and production export filters.
// This adapter exercises WASM, not browser UI or hardware video acceleration.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import createCore from '../vendor/core/ffmpeg-core.js';
import {createMultithreadCore,terminateThreads} from './mt-core-adapter.mjs';
import {BrowserEngine} from '../engine.js';
const multi=process.argv.includes('--mt');
const all=process.argv.includes('--all');
const reportedThreads=all?Number(process.argv.find(arg=>arg.startsWith('--cores='))?.split('=')[1] || 32):8;
globalThis.self={location:{href:new URL('../vendor/core/ffmpeg-core.js',import.meta.url).href}};
const poolSize=Number(process.argv.find(arg=>arg.startsWith('--pool='))?.split('=')[1]) || reportedThreads+14;
const core=multi?await createMultithreadCore(poolSize):await createCore({wasmBinary:new Uint8Array(await readFile(new URL('../vendor/core/ffmpeg-core.wasm',import.meta.url)))});
console.log(`Core ready; ${multi?core.PThread.unusedWorkers.length:0} pthread workers`);
const callbacks={log:[],progress:[]};
core.setLogger(data=>callbacks.log.forEach(callback=>callback(data)));
if(process.argv.includes('--verbose'))callbacks.log.push(({message})=>console.log(message));
core.setProgress(data=>callbacks.progress.forEach(callback=>callback(data)));
const driver={loaded:false,on(event,callback){callbacks[event].push(callback);},async load(){this.loaded=true;},
  async createDir(path){core.FS.mkdir(path);},async mount(){return false;},
  async writeFile(path,data){core.FS.writeFile(path,data);},async readFile(path,encoding='binary'){return core.FS.readFile(path,{encoding});},
  async deleteFile(path){core.FS.unlink(path);},async exec(args){core.exec(...args);const result=core.ret;core.reset();return result;},
  async ffprobe(args){core.ffprobe(...args);const result=core.ret;core.reset();return result;},terminate(){this.loaded=false;}};
const engine=new BrowserEngine(()=>driver,()=>({hardwareConcurrency:reportedThreads,deviceMemory:8,isolated:multi,sharedMemory:multi}));
engine.setPerformance(multi?all?'all':'4':'1');
const root=new URL('../../artifacts/performance/',import.meta.url);
try {
  const file=new File([await readFile(new URL('input.mp4',root))],'input.mp4');
  const analysis=await engine.analyze(file,{thresholdDb:-35,minSilenceMs:180,paddingMs:40},()=>{});
  console.log('Analysis ready');
  assert.equal(analysis.plan.removed.length,4);
  const cpu=process.cpuUsage(),start=performance.now();
  const blob=await engine.export(file,analysis,'720',()=>{});
  const wallMs=performance.now()-start,used=process.cpuUsage(cpu);
  core.FS.writeFile('verify.mp4',new Uint8Array(await blob.arrayBuffer()));
  const probe=await engine.probe('verify.mp4');
  assert.ok(Math.abs(probe.duration-analysis.plan.outputDuration)<.1);
  const stat={mode:multi?'multithread':'single-thread',threads:engine.runtime.threads,wallMs:Math.round(wallMs),cpuMs:Math.round((used.user+used.system)/1000),inputDuration:analysis.info.duration,outputDuration:probe.duration,bytes:blob.size};
  await mkdir(root,{recursive:true});await writeFile(new URL(multi?all?'all.json':'multi.json':'single.json',root),JSON.stringify(stat,null,2));
  console.log(JSON.stringify(stat));
} finally {if(multi)await terminateThreads();}
