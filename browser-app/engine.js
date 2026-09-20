import { FFmpeg } from './vendor/ffmpeg/index.js';
import { buildPlan,parseMedia,silenceCollector,validateSettings,batchFilter,encodingBudget,normalizeExportOptions,num } from './planner.js';
import {chooseRuntime,runtimeEnvironment,encodingThreads} from './performance.js';

export const MAX_FILE_BYTES = 1024*1024*1024;
const MAX_MEMORY_COPY_BYTES = 512*1024*1024;
export function audioFilter(mode) {
  if(mode==='normalize')return 'loudnorm=I=-16:LRA=11:TP=-1.5';
  if(mode==='voice')return 'highpass=f=80,lowpass=f=16000,afftdn=nf=-25,loudnorm=I=-16:LRA=11:TP=-1.5';
  return null;
}

export class BrowserEngine {
  constructor(makeDriver=()=>new FFmpeg(),environment=runtimeEnvironment) {
    this.makeDriver=makeDriver;
    this.environment=environment;
    this.performanceMode='all';
    this.runtime=chooseRuntime(environment());
    this.onRuntime=null;
    this.ff=null;
    this.file=null;
    this.input=null;
    this.onProgress=null;
    this.onLog=null;
    this.errors=[];
    this.cancelled=false;
  }
  setPerformance(mode) {
    const runtime=chooseRuntime(this.environment(),mode);
    if(mode!==this.performanceMode) this.dispose();
    this.performanceMode=mode;this.runtime=runtime;this.onRuntime?.(runtime);
  }
  async load() {
    if (this.ff?.loaded) return;
    this.cancelled=false;
    const runtime=chooseRuntime(this.environment(),this.performanceMode);
    try { await this.loadCore(runtime); }
    catch(e) {
      if(this.cancelled || !runtime.multithread)throw e;
      // Missing isolation or blocked pthread workers must not prevent editing.
      await this.loadCore({...runtime,multithread:false,threads:1,reason:'fallback'});
    }
    this.onRuntime?.(this.runtime);
  }
  async loadCore(runtime) {
    this.runtime=runtime;
    const ff=this.makeDriver(); this.ff=ff;
    ff.on('log',({message})=>{
      this.errors.push(message); if(this.errors.length>60)this.errors.shift();
      this.onLog?.(message);
    });
    ff.on('progress',({time})=>this.onProgress?.(time/1e6));
    let timer;
    const folder=runtime.multithread?'core-mt':'core';
    const assets={coreURL:new URL(runtime.multithread?'./threaded-core.js':`./vendor/${folder}/ffmpeg-core.js`,import.meta.url).href,
      wasmURL:new URL(`./vendor/${folder}/ffmpeg-core.wasm`,import.meta.url).href};
    if(runtime.multithread)assets.workerURL=new URL('./vendor/core-mt/ffmpeg-core.worker.js',import.meta.url).href;
    try {
      await Promise.race([
        ff.load(assets),
        new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Não foi possível carregar o processador. Confira a conexão e se todos os arquivos do site foram publicados.')),90000))
      ]);
    } catch(e) { ff.terminate(); this.ff=null; throw e; }
    finally { clearTimeout(timer); }
  }
  async prepare(file) {
    if(this.file===file && this.input && this.ff?.loaded) return;
    if(!file.size || file.size>MAX_FILE_BYTES) throw new Error('Selecione um vídeo de até 1 GB (1.024 MB).');
    await this.load();
    await this.ff.createDir('/source');
    // WORKERFS reads the File lazily, avoiding a full in-memory copy of the MP4.
    let mounted=false;
    try {
      const safeFile = new File([file],'input.mp4',{type:'video/mp4'});
      mounted=await this.ff.mount('WORKERFS',{files:[safeFile]},'/source');
    } catch { /* Fall back for runtimes without WORKERFS support. */ }
    if(mounted) this.input='/source/input.mp4';
    else {
      // Never fall back to copying a large input into the WebAssembly heap.
      if(file.size>MAX_MEMORY_COPY_BYTES) {
        this.dispose();
        throw new Error('Não foi possível abrir este vídeo grande sem copiá-lo inteiro para a memória. Tente uma versão atual do Chrome, Edge ou Firefox em um computador, ou divida o arquivo em partes menores.');
      }
      await this.ff.writeFile('input.mp4',new Uint8Array(await file.arrayBuffer())); this.input='input.mp4';
    }
    this.file=file;
  }
  async run(args) {
    this.errors=[];
    // FFprobe changes the shared native log level; reset it so silencedetect emits events.
    const code=await this.ff.exec(['-loglevel','info',...args]);
    if(this.cancelled) throw new Error('Processamento cancelado.');
    if(code!==0) {
      console.error('FFmpeg:',this.errors.join('\n'));
      throw new Error('Não foi possível processar este vídeo. Ele pode usar um formato incompatível ou exceder a memória disponível. Tente um arquivo menor ou exporte em 720p.');
    }
  }
  async probe(input=this.input) {
    try { await this.ff.deleteFile('probe.json'); } catch { /* No previous probe output. */ }
    const code=await this.ff.ffprobe(['-v','error','-show_streams','-show_format','-of','json',input,'-o','probe.json']);
    // Core 0.12.10 may return -1 after a successful ffprobe normal return.
    // Require fresh, valid JSON instead of treating this return value as success alone.
    if(code!==0&&code!==-1) throw new Error('Não foi possível ler o MP4. Confira se o arquivo está íntegro.');
    let json;
    try { json=JSON.parse(await this.ff.readFile('probe.json','utf8')); }
    catch { throw new Error('Não foi possível ler o MP4. Confira se o arquivo está íntegro.'); }
    await this.ff.deleteFile('probe.json');
    return parseMedia(json);
  }
  async analyze(file,settings,progress) {
    validateSettings(settings);
    progress(null,'Carregando o processador de vídeo…');
    await this.prepare(file);
    const info=await this.probe();
    const collector=silenceCollector();
    this.onLog=line=>collector.push(line);
    this.onProgress=time=>progress(Math.min(99,time/info.duration*100),'Detectando pausas no áudio…');
    const filter=`asetpts=PTS-(${num(info.videoStart)})/TB,aresample=48000:async=1:first_pts=0,apad,atrim=duration=${num(info.duration)},silencedetect=noise=${num(settings.thresholdDb)}dB:d=${num(settings.minSilenceMs/1000)}`;
    try {
      await this.run(['-hide_banner','-copyts','-i',this.input,'-map',`0:${info.audioIndex}`,'-af',filter,'-vn','-f','null','-']);
      const plan=buildPlan(info.duration,info.fps,collector.finish(info.duration),settings);
      progress(100,'Análise concluída.');
      return { info,plan,settings:{...settings} };
    } finally {this.onLog=null;this.onProgress=null;}
  }
  async convert(file,exportOptions,progress) {
    progress(null,'Preparando o conversor de vídeo…');
    await this.prepare(file);
    const info=await this.probe();
    const whole={start:0,end:info.duration,duration:info.duration};
    const analysis={info,plan:{originalDuration:info.duration,outputDuration:info.duration,savedSeconds:0,removed:[],kept:[whole]}};
    return this.renderExport(file,analysis,exportOptions,progress,'Convertendo o vídeo');
  }
  async export(file,analysis,exportOptions,progress) {
    if(!analysis.plan.kept.length) throw new Error('Todo o vídeo foi identificado como silêncio. Diminua o limite de volume e analise novamente.');
    progress(null,'Preparando a exportação…');
    await this.prepare(file);
    return this.renderExport(file,analysis,exportOptions,progress,'Recortando trechos');
  }
  async renderExport(file,analysis,exportOptions,progress,actionCaption) {
    const {info,plan}=analysis;
    const options=normalizeExportOptions(exportOptions);
    const budget=encodingBudget(plan.outputDuration,options);
    const threads=encodingThreads(this.runtime);
    const files=[];
    let completed=0;
    const batches=[];
    for(let i=0;i<plan.kept.length;i+=12)batches.push(plan.kept.slice(i,i+12));
    try {
      for(const [i,batch] of batches.entries()) {
        const {graph,origin,length,duration}=batchFilter(info,batch,options);
        const path=`batch-${String(i).padStart(5,'0')}.mkv`;files.push(path);
        const caption=`${actionCaption} · lote ${i+1} de ${batches.length} · ${threads.encode} ${threads.encode===1?'thread':'threads'}`;
        const before=completed;
        this.onProgress=time=>progress(Math.min(89,90*(before+Math.min(duration,Math.max(0,time)))/plan.outputDuration),caption);
        progress(90*completed/plan.outputDuration,caption);
        const videoRate=budget.videoKbps
          ? ['-b:v',`${budget.videoKbps}k`,'-maxrate',`${budget.videoKbps}k`,'-bufsize',`${budget.videoKbps*2}k`]
          : ['-crf','23'];
        await this.run(['-hide_banner','-copyts','-seek_timestamp','1','-ss',num(info.videoStart+origin),'-threads',String(threads.decode),'-i',this.input,
          '-t',num(length),'-filter_complex_threads',String(threads.filters),'-filter_complex',graph,'-map','[v]','-map','[a]',
          '-c:v','libx264','-preset','ultrafast',...videoRate,'-pix_fmt','yuv420p','-threads:v',String(threads.encode),
          // The packaged x264 lookahead task crashes with multiple lookahead
          // threads. Frame encoding still uses the full requested thread count.
          '-x264-params','lookahead-threads=1',
          '-c:a','pcm_s16le','-ar','48000','-ac','2',path]);
        completed+=duration;
      }
      await this.ff.writeFile('concat.txt',new TextEncoder().encode(files.map(p=>`file '${p}'`).join('\n')));
      this.onProgress=time=>progress(90+Math.min(9,9*time/plan.outputDuration),'Montando o MP4 final…');
      progress(90,'Montando o MP4 final…');
      const soundFilter=audioFilter(options.audioMode);
      await this.run(['-hide_banner','-f','concat','-safe','1','-i','concat.txt','-map','0:v:0','-map','0:a:0',
        '-c:v','copy',...(soundFilter?['-af',soundFilter]:[]),'-c:a','aac','-b:a',`${budget.audioKbps}k`,'-movflags','+faststart','output.mp4']);
      const data=await this.ff.readFile('output.mp4');
      const blob=new Blob([data],{type:'video/mp4'});
      if(budget.targetBytes&&blob.size>budget.targetBytes)throw new Error('O arquivo ficou acima do tamanho solicitado. Tente um limite um pouco menor ou reduza a resolução.');
      progress(100,'Exportação concluída.');
      return blob;
    } finally {
      this.onProgress=null;
      if(this.ff?.loaded) for(const path of [...files,'concat.txt','output.mp4']) {
        try {await this.ff.deleteFile(path);} catch { /* Already cleaned, or worker terminated. */ }
      }
    }
  }
  dispose() {
    this.cancelled=true;
    this.onProgress=null;this.onLog=null;
    this.ff?.terminate();this.ff=null;this.file=null;this.input=null;
  }
}
