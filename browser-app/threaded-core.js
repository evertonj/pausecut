import createCore from './vendor/core-mt/ffmpeg-core.js';
import {chooseRuntime,runtimeEnvironment,encodingThreads} from './performance.js';

// Leave the official core unchanged. Preload enough pthreads before synchronous
// execution, including on CPUs with more threads than the upstream pool of 32.
export default async function createThreadedCore(options={}) {
  const core=await createCore(options);
  if(options.ENVIRONMENT_IS_PTHREAD)return core;
  const runtime=chooseRuntime(runtimeEnvironment(),'all');
  const budget=encodingThreads(runtime);
  const required=Number(options.pausecutPoolSize) || budget.encode+budget.decode+budget.filters+8;
  const pool=core.PThread;
  const added=[];
  while(pool.unusedWorkers.length<required){
    pool.allocateUnusedWorker();added.push(pool.unusedWorkers.at(-1));
  }
  await Promise.all(added.map(worker=>pool.loadWasmModuleToWorker(worker)));
  return core;
}
