import { BrowserEngine, MAX_FILE_BYTES } from './engine.js';
const $=id=>document.getElementById(id);
const presets={gentle:[-40,350,80],balanced:[-35,180,40],tight:[-30,100,20]};
const engine=new BrowserEngine();
const state={file:null,originalURL:null,resultURL:null,resultKind:null,analysis:null,status:'empty',resultView:false,operation:0,error:null,aspect:'original'};
const supported=typeof WebAssembly==='object' && typeof Worker==='function' && typeof File==='function';
const busy=()=>['analyzing','rendering'].includes(state.status);
const settings=()=>({thresholdDb:+$('threshold').value,minSilenceMs:+$('minimum').value,paddingMs:+$('padding').value});
const exportSettings=()=>({resolution:$('resolution').value,aspect:state.aspect,framing:$('framing').value,focusX:+$('focusX').value,focusY:+$('focusY').value,compression:$('compression').value,targetMiB:+$('targetMiB').value,audioMode:$('audioMode').value});
const validOutput=()=>{const output=exportSettings();return output.compression!=='target'||Number.isFinite(output.targetMiB)&&output.targetMiB>=1&&output.targetMiB<=4096;};
const aspectInfo={original:['Original','Manter proporção original'],vertical:['9:16','Shorts e Reels'],square:['1:1','Vídeo quadrado'],portrait:['4:5','Feed vertical'],landscape:['16:9','Vídeo horizontal']};
const matches=()=>state.analysis && Object.entries(settings()).every(([k,v])=>state.analysis.settings[k]===v);
const format=seconds=>{if(!Number.isFinite(seconds))return '—';const m=Math.floor(seconds/60),s=seconds%60;return `${m}:${s.toFixed(2).padStart(5,'0')}`;};
function message(text,type=''){$('message').textContent=text;$('message').className=`notice ${text?type:'hidden'}`;}
function changed(){
  $('thresholdValue').value=`${$('threshold').value} dB`;$('minimumValue').value=`${$('minimum').value} ms`;$('paddingValue').value=`${$('padding').value} ms`;
  const values=Object.values(settings());
  document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',presets[b.dataset.preset].every((v,i)=>v===values[i])));
  render();
}
function render(){
  const work=busy(),plan=state.analysis?.plan;
  const names={empty:'AGUARDANDO VÍDEO',loaded:'PRONTO PARA ANALISAR',analyzing:'ANALISANDO',analyzed:'ANÁLISE PRONTA',rendering:'EXPORTANDO',completed:'CONCLUÍDO',cancelled:'CANCELADO',failed:'ERRO'};
  $('status').textContent=names[state.status];
  $('file').disabled=work;$('analyze').disabled=!supported||!state.file||work;
  $('delete').disabled=!state.file||work;
  ['threshold','minimum','padding','resolution','framing','focusX','focusY','compression','targetMiB','audioMode'].forEach(id=>$(id).disabled=work);
  $('cpuMode').disabled=work;
  document.querySelectorAll('[data-preset]').forEach(b=>b.disabled=work);
  document.querySelectorAll('[data-aspect]').forEach(b=>b.disabled=work);
  document.querySelectorAll('[data-size]').forEach(b=>b.disabled=work);
  $('export').disabled=work||!plan?.kept.length||!matches()||!validOutput();
  $('convert').disabled=!supported||work||!state.file||!validOutput();
  $('export').classList.toggle('hidden',!!state.resultURL);
  $('convert').classList.toggle('hidden',!!state.resultURL);
  $('download').classList.toggle('hidden',!state.resultURL);
  if(state.resultURL)$('download').href=state.resultURL;
  $('original').disabled=!state.file;$('result').disabled=!state.resultURL;
  $('report').disabled=!plan;$('toggleCuts').disabled=!plan?.removed.length;
  $('workProgress').classList.toggle('hidden',!work);
  $('placeholder').classList.toggle('hidden',!!state.file);$('player').classList.toggle('hidden',!state.file);
  $('fileLabel').textContent=state.file?.name||'Arraste um vídeo para cá';$('fileHint').textContent=state.file?'Clique para escolher outro MP4':'ou clique para escolher um MP4';
  $('videoName').textContent=state.file?.name||'';
  $('duration').textContent=format(plan?.originalDuration);
  $('newDuration').textContent=format(plan?.outputDuration);
  $('saved').textContent=plan?`−${format(plan.savedSeconds)}`:'—';
  $('cutCount').textContent=plan?`${plan.removed.length} pausas removidas · ${plan.kept.length} trechos preservados`:'Analise para encontrar as pausas';
  if(!work){
    if(state.error)message(state.error,'error');
    else if(state.analysis&&!matches())message('Os ajustes mudaram. Analise novamente antes de exportar.');
    else if(state.status==='completed')message(state.resultKind==='converted'?'Conversão concluída. Baixe o MP4 antes de fechar esta aba.':'Vídeo sem pausas pronto. Baixe o MP4 antes de fechar esta aba.','success');
    else if(plan&&!plan.kept.length)message('Todo o vídeo foi identificado como silêncio. Diminua o limite de volume (por exemplo, -45 dB) e analise novamente.','error');
    else if(state.status==='analyzed')message(plan.removed.length?'Análise pronta. Confira os cortes e exporte o vídeo.':'Nenhuma pausa encontrada. Ajuste o limite ou a pausa mínima e analise novamente.');
    else if(state.status==='loaded')message('Vídeo selecionado. Ele fica no seu dispositivo. Clique em Analisar pausas.');
    else message('');
  }
  drawTimeline();
  renderFormat();
  renderCompression();
  renderAudio();
}
function renderCompression(){
  const targeted=$('compression').value==='target';
  $('targetSetting').classList.toggle('hidden',!targeted);
  document.querySelectorAll('[data-size]').forEach(button=>button.classList.toggle('selected',+$('targetMiB').value===+button.dataset.size));
}
function renderAudio(){
  const help={original:'Mantém a dinâmica do áudio e apenas converte a faixa para AAC.',normalize:'Equilibra o volume do vídeo completo para reduzir diferenças entre trechos.',voice:'Reduz ruído contínuo leve, corta frequências extremas e normaliza a voz. Revise o resultado com música.'};
  $('audioHelp').textContent=help[$('audioMode').value];
}
function renderFormat(){
  document.querySelectorAll('[data-aspect]').forEach(button=>button.classList.toggle('selected',button.dataset.aspect===state.aspect));
  const original=state.aspect==='original';
  $('framingSetting').classList.toggle('hidden',original);
  $('focusControls').classList.toggle('hidden',original||$('framing').value!=='crop');
  const focusLabel=value=>value==50?'Centro · 50%':value<50?`Início · ${value}%`:`Fim · ${value}%`;
  $('focusXValue').value=focusLabel(+$('focusX').value);
  $('focusYValue').value=focusLabel(+$('focusY').value);
  if(original){
    $('formatSize').textContent='Manter proporção original';
    $('formatHelp').textContent='O formato original mantém a proporção do arquivo selecionado.';
    updatePlayerPreview();
    return;
  }
  const tier=$('resolution').value==='720'?720:1080;
  const sizes={vertical:[tier,tier===720?1280:1920],square:[tier,tier],portrait:[tier,tier===720?900:1350],landscape:[tier===720?1280:1920,tier]};
  const [width,height]=sizes[state.aspect];
  $('formatSize').textContent=`${aspectInfo[state.aspect][0]} · ${width} × ${height}`;
  $('formatHelp').textContent=$('framing').value==='crop'?'Preenche o quadro; use os controles de foco para escolher a região preservada.':$('framing').value==='blur'?'Mantém todo o vídeo sobre uma cópia ampliada e desfocada.':'Mantém todo o vídeo e completa as bordas com preto.';
  updatePlayerPreview();
}
function outputChanged(){
  state.error=null;
  if(state.resultURL){
    clearResult();
    state.status=state.analysis?'analyzed':state.file?'loaded':'empty';
    viewResult(false);
  }
  render();
}
function viewResult(value){
  if(!state.file)return;
  state.resultView=value&&!!state.resultURL;
  $('player').src=state.resultView?state.resultURL:state.originalURL;
  $('original').classList.toggle('selected',!state.resultView);$('result').classList.toggle('selected',state.resultView);
  updatePlayerPreview();
}
function updatePlayerPreview(){
  const shell=document.querySelector('.player-shell');
  shell.classList.remove('is-vertical','is-square','is-portrait','is-landscape');
  if(state.aspect!=='original')shell.classList.add(`is-${state.aspect}`);
  const cropPreview=!state.resultView&&state.aspect!=='original'&&$('framing').value==='crop';
  $('player').classList.toggle('crop-preview',cropPreview);
  $('player').style.objectPosition=cropPreview?`${$('focusX').value}% ${$('focusY').value}%`:'50% 50%';
}
function clearResult(){if(state.resultURL)URL.revokeObjectURL(state.resultURL);state.resultURL=null;state.resultKind=null;$('download').removeAttribute('href');}
function selectFile(file){
  if(!file||busy())return;
  if(!file.name.toLowerCase().endsWith('.mp4'))return message('Escolha um arquivo MP4.','error');
  if(!file.size||file.size>MAX_FILE_BYTES)return message('Escolha um MP4 de até 1 GB (1.024 MB). Vídeos menores exigem menos memória.','error');
  state.operation++;engine.dispose();
  $('player').pause();$('player').removeAttribute('src');$('player').load();
  if(state.originalURL)URL.revokeObjectURL(state.originalURL);clearResult();
  state.file=file;state.originalURL=URL.createObjectURL(file);state.analysis=null;state.error=null;state.status='loaded';
  $('cuts').classList.add('hidden');$('toggleCuts').textContent='Ver cortes';$('cutRows').replaceChildren();
  render();viewResult(false);$('file').value='';
}
function progress(value,caption){
  $('workText').textContent=caption;
  if(value===null){$('workBar').removeAttribute('value');$('percent').textContent='Preparando…';}
  else{$('workBar').value=value;$('percent').textContent=`${Math.floor(value)}%`;}
}
async function perform(kind){
  if(busy()||!state.file)return;
  const operation=++state.operation;
  const file=state.file;
  const config=settings();
  const output=exportSettings();
  state.error=null;state.status=kind==='analyze'?'analyzing':'rendering';
  if(kind==='analyze'){clearResult();state.analysis=null;viewResult(false);$('cuts').classList.add('hidden');$('toggleCuts').textContent='Ver cortes';}
  render();message('');progress(null,'Preparando o processador de vídeo…');
  let wakeLock;
  try{
    if(navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen').catch(()=>null);
    const update=(value,caption)=>{if(state.operation===operation)progress(value,caption);};
    if(kind==='analyze'){
      const analysis=await engine.analyze(file,config,update);
      if(state.operation!==operation)return;
      state.analysis=analysis;state.status='analyzed';
    }else{
      const blob=kind==='convert'?await engine.convert(file,output,update):await engine.export(file,state.analysis,output,update);
      if(state.operation!==operation)return;
      clearResult();state.resultURL=URL.createObjectURL(blob);state.resultKind=kind==='convert'?'converted':'trimmed';state.status='completed';
      const format=state.aspect==='original'?'original':aspectInfo[state.aspect][0].replace(':','x');
      const sizeSuffix=output.compression==='target'?`-${output.targetMiB}mb`:'';
      const audioSuffix=output.audioMode==='voice'?'-voz-limpa':output.audioMode==='normalize'?'-volume-normalizado':'';
      $('download').download=file.name.replace(/\.mp4$/i,'')+(kind==='convert'?`-${format}${sizeSuffix}${audioSuffix}`:`-sem-pausas-${format}${sizeSuffix}${audioSuffix}`)+'.mp4';
      viewResult(true);
      // Free the WebAssembly heap after the result has been copied to a Blob.
      engine.dispose();
    }
  }catch(e){
    if(state.operation!==operation)return;
    state.status=state.analysis?'analyzed':'failed';state.error=e instanceof Error?e.message:String(e);
    engine.dispose();
  }finally{
    await wakeLock?.release().catch(()=>{});
    if(state.operation===operation)render();
  }
}
function cancel(){
  if(!busy())return;
  state.operation++;engine.dispose();state.status=state.analysis?'analyzed':'cancelled';state.error='Processamento cancelado. Você pode tentar novamente.';render();
}
function drawTimeline(){
  const canvas=$('timeline'),width=canvas.getBoundingClientRect().width,ratio=window.devicePixelRatio||1;
  canvas.width=width*ratio;canvas.height=46*ratio;const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  ctx.fillStyle='#35363f';ctx.fillRect(0,9,width,28);
  const plan=state.analysis?.plan;if(!plan)return;
  ctx.fillStyle='#9171ef';for(const s of plan.removed)ctx.fillRect(s.start/plan.originalDuration*width,9,Math.max(1,s.duration/plan.originalDuration*width),28);
}
function showCuts(){
  const plan=state.analysis?.plan;if(!plan)return;
  $('cuts').classList.toggle('hidden');$('toggleCuts').textContent=$('cuts').classList.contains('hidden')?'Ver cortes':'Ocultar cortes';$('cutRows').replaceChildren();
  for(const [i,s] of plan.removed.slice(0,1000).entries()){
    const row=document.createElement('tr');[i+1,format(s.start),format(s.end),`${Math.round(s.duration*1000)} ms`].forEach(text=>{const td=document.createElement('td');td.textContent=text;row.append(td);});
    const td=document.createElement('td'),button=document.createElement('button');button.className='text-button';button.textContent='Ouvir';
    button.onclick=()=>{viewResult(false);const player=$('player');const play=()=>{player.currentTime=Math.max(0,s.start-.4);player.play().catch(()=>{});};if(player.readyState>=1)play();else player.addEventListener('loadedmetadata',play,{once:true});};
    td.append(button);row.append(td);$('cutRows').append(row);
  }
  $('cutNote').textContent=plan.removed.length>1000?'Exibindo os primeiros 1.000 cortes. O relatório contém todos.':'Os tempos correspondem ao vídeo original.';
}
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p=presets[b.dataset.preset];$('threshold').value=p[0];$('minimum').value=p[1];$('padding').value=p[2];state.error=null;changed();});
engine.onRuntime=runtime=>{
  const detected=runtime.detectedCores;
  $('cpuMode').querySelector('[value="all"]').textContent=detected?`Usar todos · ${detected} ${detected===1?'thread':'threads'}`:'Usar todos · quantidade não informada';
  const detection=detected?`Navegador informa ${detected} ${detected===1?'processador lógico':'processadores lógicos'}. `:'O navegador não informou a quantidade de processadores. ';
  $('cpuInfo').textContent=detection+(runtime.multithread
      ? `Modo paralelo · ${runtime.threads} threads na exportação. Mais threads usam mais memória.`
    : runtime.reason==='selected' ? 'Modo compatível · 1 thread.'
    : runtime.reason==='fallback' ? 'O modo paralelo não carregou. Processando em modo compatível com 1 thread.'
    : 'Modo compatível · 1 thread. O navegador ou a configuração deste site não permite o modo paralelo.');
};
$('cpuMode').onchange=()=>engine.setPerformance($('cpuMode').value);
engine.setPerformance('all');
['threshold','minimum','padding'].forEach(id=>$(id).oninput=()=>{state.error=null;changed();});
$('resolution').onchange=outputChanged;$('framing').onchange=outputChanged;
['focusX','focusY'].forEach(id=>$(id).oninput=outputChanged);
$('compression').onchange=outputChanged;$('targetMiB').oninput=outputChanged;
$('audioMode').onchange=outputChanged;
document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{$('targetMiB').value=button.dataset.size;outputChanged();});
document.querySelectorAll('[data-aspect]').forEach(button=>button.onclick=()=>{state.aspect=button.dataset.aspect;outputChanged();});
$('file').onchange=()=>selectFile($('file').files[0]);
$('dropzone').ondragover=e=>{e.preventDefault();if(!busy())$('dropzone').classList.add('dragover');};
$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragover');
$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragover');selectFile(e.dataTransfer.files[0]);};
$('analyze').onclick=()=>perform('analyze');$('export').onclick=()=>perform('export');$('cancel').onclick=cancel;
$('convert').onclick=()=>perform('convert');
$('original').onclick=()=>viewResult(false);$('result').onclick=()=>viewResult(true);$('toggleCuts').onclick=showCuts;
$('report').onclick=()=>{
  const data={name:state.file.name,...state.analysis};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='cortes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('delete').onclick=()=>{
  engine.dispose();state.operation++;$('player').pause();$('player').removeAttribute('src');$('player').load();
  if(state.originalURL)URL.revokeObjectURL(state.originalURL);clearResult();Object.assign(state,{file:null,originalURL:null,analysis:null,status:'empty',error:null,resultView:false});
  $('cuts').classList.add('hidden');$('toggleCuts').textContent='Ver cortes';$('cutRows').replaceChildren();render();
};
window.addEventListener('resize',drawTimeline);
window.addEventListener('beforeunload',e=>{if(busy()||state.resultURL){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>engine.dispose());
$('health').textContent=supported?'Seu vídeo fica no dispositivo. Mantenha esta aba aberta durante o processamento.':'Este navegador não suporta o processador de vídeo. Use uma versão atual do Chrome, Edge ou Firefox.';
$('health').className=`notice ${supported?'success':'error'}`;
changed();
