export function validateSettings(settings) {
  if (!Number.isFinite(settings.thresholdDb) || settings.thresholdDb < -80 || settings.thresholdDb > -5)
    throw new Error('O limite deve estar entre -80 e -5 dB.');
  if (!Number.isInteger(settings.minSilenceMs) || settings.minSilenceMs < 30 || settings.minSilenceMs > 5000)
    throw new Error('A pausa mínima deve estar entre 30 e 5000 ms.');
  if (!Number.isInteger(settings.paddingMs) || settings.paddingMs < 0 || settings.paddingMs > 1000)
    throw new Error('A margem deve estar entre 0 e 1000 ms.');
}
const interval = (start, end) => ({ start, end, duration: end - start });
export function buildPlan(duration, fps, silences, settings) {
  validateSettings(settings);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0)
    throw new Error('Duração ou taxa de quadros inválida.');
  const padding = settings.paddingMs / 1000;
  const removed = [];
  for (const silence of [...silences].sort((a,b) => a.start-b.start)) {
    if (!Number.isFinite(silence.start) || !Number.isFinite(silence.end)) continue;
    let start = Math.max(0,Math.min(duration,silence.start));
    let end = Math.max(0,Math.min(duration,silence.end));
    if (end-start+1e-6 < settings.minSilenceMs/1000) continue;
    start = start <= 1e-6 ? 0 : Math.ceil((start+padding)*fps-1e-7)/fps;
    end = end >= duration-1e-6 ? duration : Math.floor((end-padding)*fps+1e-7)/fps;
    if (end-start < 1/fps-1e-7) continue;
    const last = removed.at(-1);
    if (last && start <= last.end+1e-7) removed[removed.length-1] = interval(last.start,Math.max(last.end,end));
    else removed.push(interval(start,end));
  }
  const kept = [];
  let cursor = 0;
  for (const cut of removed) {
    if (cut.start > cursor+1e-7) kept.push(interval(cursor,cut.start));
    cursor = cut.end;
  }
  if (duration > cursor+1e-7) kept.push(interval(cursor,duration));
  if (kept.length > 10000) throw new Error('Mais de 10.000 trechos. Aumente a pausa mínima.');
  const outputDuration = kept.reduce((sum,s) => sum+s.duration,0);
  return { originalDuration: duration, outputDuration, savedSeconds: duration-outputDuration, removed, kept };
}

export function parseMedia(json) {
  const video = json.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = json.streams?.find(s => s.codec_type === 'audio');
  if (!video) throw new Error('O arquivo não contém vídeo.');
  if (!audio) throw new Error('O vídeo não contém uma faixa de áudio.');
  const duration = Number(video.duration) > 0 ? Number(video.duration) : Number(json.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Não foi possível ler a duração do vídeo.');
  let frameRate = video.avg_frame_rate || '30/1';
  const [num,den] = frameRate.split('/').map(Number);
  let fps = num/den;
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) { fps=30; frameRate='30/1'; }
  return { duration, fps, frameRate, videoStart: Number(video.start_time) || 0,
    videoIndex: video.index, audioIndex: audio.index, width: video.width, height: video.height };
}

export function silenceCollector() {
  const intervals = [];
  let start = null;
  return {
    push(line) {
      for (const match of line.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)) {
        const time = Number(match[2]);
        if (match[1] === 'start') start=time;
        else if (start !== null) { intervals.push(interval(start,time)); start=null; }
      }
    },
    finish(duration) { if (start !== null) intervals.push(interval(start,duration)); return intervals; }
  };
}

export const num = n => Number(n.toFixed(9)).toString();
const socialFormats = {
  vertical: { ratio: '9:16', dimensions: {720:[720,1280],1080:[1080,1920]} },
  square: { ratio: '1:1', dimensions: {720:[720,720],1080:[1080,1080]} },
  portrait: { ratio: '4:5', dimensions: {720:[720,900],1080:[1080,1350]} },
  landscape: { ratio: '16:9', dimensions: {720:[1280,720],1080:[1920,1080]} }
};
export function normalizeExportOptions(resolutionOrOptions) {
  const options=typeof resolutionOrOptions==='string'?{resolution:resolutionOrOptions}:resolutionOrOptions||{};
  const resolution=options.resolution||'720';
  const aspect=options.aspect||'original';
  const framing=options.framing||'crop';
  const focusX=options.focusX===undefined?50:Number(options.focusX);
  const focusY=options.focusY===undefined?50:Number(options.focusY);
  const compression=options.compression||'quality';
  const targetMiB=options.targetMiB===undefined?100:Number(options.targetMiB);
  const audioMode=options.audioMode||'original';
  if (!['720','1080','original'].includes(resolution)) throw new Error('Resolução inválida.');
  if (aspect!=='original' && !socialFormats[aspect]) throw new Error('Formato de vídeo inválido.');
  if (!['crop','blur','fit'].includes(framing)) throw new Error('Enquadramento inválido.');
  if (!Number.isFinite(focusX)||focusX<0||focusX>100||!Number.isFinite(focusY)||focusY<0||focusY>100) throw new Error('Posição de foco inválida.');
  if (!['quality','target'].includes(compression)) throw new Error('Modo de compressão inválido.');
  if (!Number.isFinite(targetMiB)||targetMiB<1||targetMiB>4096) throw new Error('O tamanho desejado deve estar entre 1 MB e 4.096 MB.');
  if (!['original','normalize','voice'].includes(audioMode)) throw new Error('Tratamento de áudio inválido.');
  return {resolution,aspect,framing,focusX,focusY,compression,targetMiB,audioMode};
}
export function encodingBudget(duration,resolutionOrOptions) {
  const options=normalizeExportOptions(resolutionOrOptions);
  if(options.compression==='quality')return {videoKbps:null,audioKbps:192,targetBytes:null};
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Duração inválida para calcular a compressão.');
  const audioKbps=128;
  // Reserve 12% for MP4/MKV overhead, bitrate variation and the audio encoder.
  const availableKibits=options.targetMiB*8192*.88;
  const videoKbps=Math.floor(availableKibits/duration-audioKbps);
  if(videoKbps<150)throw new Error('O tamanho escolhido é muito pequeno para a duração deste vídeo. Aumente o limite em MB, diminua a resolução ou divida o vídeo.');
  return {videoKbps,audioKbps,targetBytes:Math.round(options.targetMiB*1024*1024)};
}
export function outputDimensions(info,resolutionOrOptions) {
  const options=normalizeExportOptions(resolutionOrOptions);
  if(options.aspect==='original')return null;
  // Social presets use 1080p when "original" is selected because a fixed
  // aspect ratio needs explicit output dimensions.
  const tier=options.resolution==='720'?'720':'1080';
  const [width,height]=socialFormats[options.aspect].dimensions[tier];
  return {width,height,ratio:socialFormats[options.aspect].ratio};
}
function videoGraph(info,origin,count,options) {
  const source=`[0:${info.videoIndex}]setpts=PTS-(${num(info.videoStart+origin)})/TB,fps=${info.frameRate}:start_time=0`;
  const labels=Array.from({length:count},(_,i)=>`[v${i}]`).join('');
  const dimensions=outputDimensions(info,options);
  if(!dimensions) {
    const scale=options.resolution === 'original' ? 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
      : `scale=w='min(${options.resolution==='720'?1280:1920},iw)':h='min(${options.resolution},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
    return `${source},${scale},setsar=1,split=${count}${labels};`;
  }
  const {width,height}=dimensions;
  if(options.framing==='crop') {
    const x=num(options.focusX/100),y=num(options.focusY/100);
    return `${source},scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height}:x='(iw-ow)*${x}':y='(ih-oh)*${y}',setsar=1,split=${count}${labels};`;
  }
  if(options.framing==='fit') {
    return `${source},scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,split=${count}${labels};`;
  }
  return `${source},split=2[bgsource][fgsource];`+
    `[bgsource]scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height},boxblur=20:1,eq=brightness=-0.18:saturation=0.75[bg];`+
    `[fgsource]scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg];`+
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,split=${count}${labels};`;
}
export function batchFilter(info,batch,resolutionOrOptions) {
  if (!batch.length) throw new Error('Não há trechos para exportar.');
  const options=normalizeExportOptions(resolutionOrOptions);
  const origin=batch[0].start, length=batch.at(-1).end-origin;
  let graph=videoGraph(info,origin,batch.length,options);
  graph+=`[0:${info.audioIndex}]asetpts=PTS-(${num(info.videoStart+origin)})/TB,aresample=48000:async=1:first_pts=0,apad,atrim=duration=${num(length)},asplit=${batch.length}`;
  graph+=batch.map((_,i)=>`[a${i}]`).join('')+';';
  batch.forEach((s,i)=>{
    graph+=`[v${i}]trim=start=${num(s.start-origin)}:end=${num(s.end-origin)},setpts=PTS-STARTPTS[vout${i}];`;
    graph+=`[a${i}]atrim=start=${num(s.start-origin)}:end=${num(s.end-origin)},asetpts=PTS-STARTPTS[aout${i}];`;
  });
  graph+=batch.map((_,i)=>`[vout${i}][aout${i}]`).join('')+`concat=n=${batch.length}:v=1:a=1[v][a]`;
  return { graph, origin, length, duration: batch.reduce((sum,s)=>sum+s.duration,0) };
}
