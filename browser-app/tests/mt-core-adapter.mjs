import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import createCore from '../threaded-core.js';
const workers=[];
export async function createMultithreadCore(poolSize){
  globalThis.self={location:{href:new URL('../vendor/core-mt/ffmpeg-core.js',import.meta.url).href}};
  globalThis.Worker=class {
    constructor(script){
      this.node=new NodeWorker(new URL('./pthread-node-shim.mjs',import.meta.url),{workerData:{script:String(script)}});
      workers.push(this.node);
      this.node.on('message',data=>this.onmessage?.({data}));
      this.node.on('error',error=>{if(this.onerror)this.onerror(error);else throw error;});
    }
    postMessage(message,transfer){this.node.postMessage(message,transfer);}
    terminate(){return this.node.terminate();}
  };
  const assets={wasmURL:new URL('../vendor/core-mt/ffmpeg-core.wasm',import.meta.url).href,
    workerURL:new URL('../vendor/core-mt/ffmpeg-core.worker.js',import.meta.url).href};
  // Same core URL routing used by the browser FFmpeg wrapper, including pthreads
  // importing the app's thin initializer rather than bypassing it in this test.
  const mainScriptUrlOrBlob=new URL('../threaded-core.js',import.meta.url).href+'#'+btoa(JSON.stringify(assets));
  return createCore({pausecutPoolSize:poolSize,mainScriptUrlOrBlob,wasmBinary:new Uint8Array(await readFile(new URL('../vendor/core-mt/ffmpeg-core.wasm',import.meta.url)))});
}
export async function terminateThreads(){await Promise.all(workers.map(worker=>worker.terminate()));}
