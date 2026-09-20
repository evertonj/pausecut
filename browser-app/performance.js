export function runtimeEnvironment() {
  return {hardwareConcurrency:globalThis.navigator?.hardwareConcurrency,
    deviceMemory:globalThis.navigator?.deviceMemory,
    isolated:globalThis.crossOriginIsolated===true,
    sharedMemory:typeof SharedArrayBuffer==='function'};
}
export function chooseRuntime(environment=runtimeEnvironment(),mode='all') {
  if(!['all','auto','1','2','4','8'].includes(mode))throw new Error('Modo de CPU inválido.');
  const reported=Number(environment.hardwareConcurrency);
  const detectedCores=Number.isFinite(reported) && reported>=1 ? Math.floor(reported) : null;
  const cores=detectedCores || 2;
  if(mode==='1')return {multithread:false,threads:1,reason:'selected',detectedCores};
  if(!environment.isolated || !environment.sharedMemory || cores<2)
    return {multithread:false,threads:1,reason:'unavailable',detectedCores};
  const memory=Number(environment.deviceMemory);
  const automaticLimit=memory>0 && memory<=4 ? 2 : 8;
  const threads=mode==='all'?cores:mode==='auto'?Math.min(automaticLimit,Math.max(2,cores-1)):Math.min(Number(mode),cores);
  return {multithread:true,threads,reason:'available',detectedCores};
}
export function encodingThreads(runtime) {
  return {decode:runtime.multithread?Math.min(4,runtime.threads):1,
    filters:runtime.multithread?Math.min(2,runtime.threads):1,
    encode:runtime.multithread?runtime.threads:1};
}
