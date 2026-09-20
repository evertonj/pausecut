// Node-only verification adapter. The shipped browser pthread worker is unmodified.
import {parentPort,workerData} from 'node:worker_threads';
globalThis.self=globalThis;
globalThis.location={href:workerData.script};
globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
const queued=[];let ready=false;
parentPort.on('message',data=>{if(ready)globalThis.onmessage({data});else queued.push(data);});
await import(workerData.script);
ready=true;
for(const data of queued)globalThis.onmessage({data});
