const $ = id => document.getElementById(id);
const presets = { gentle: [-40, 350, 80], balanced: [-35, 180, 40], tight: [-30, 100, 20] };
let job = null, ready = false, uploading = false, poll = null, maxBytes = null, resultView = false;
const busy = () => uploading || (job && ['uploading', 'queued', 'analyzing', 'rendering'].includes(job.status));
const settings = () => ({ thresholdDb: +$('threshold').value, minSilenceMs: +$('minimum').value, paddingMs: +$('padding').value });
const format = seconds => {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
function message(text, type = '') { $('message').textContent = text; $('message').className = `notice ${text ? type : 'hidden'}`; }
async function api(path, options) {
  const r = await fetch(path, options);
  if (!r.ok) { let body; try { body = await r.json(); } catch {} throw new Error(body?.error || `Não foi possível concluir (${r.status}).`); }
  return r.status === 204 || r.status === 202 ? null : r.json();
}
function changed() {
  $('thresholdValue').value = `${$('threshold').value} dB`;
  $('minimumValue').value = `${$('minimum').value} ms`;
  $('paddingValue').value = `${$('padding').value} ms`;
  const s = settings();
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('selected', presets[b.dataset.preset].every((v,i) => v === [s.thresholdDb,s.minSilenceMs,s.paddingMs][i])));
  updateButtons();
}
function settingsMatch() { return job?.settings && JSON.stringify(settings()) === JSON.stringify({ thresholdDb: job.settings.thresholdDb, minSilenceMs: job.settings.minSilenceMs, paddingMs: job.settings.paddingMs }); }
function updateButtons() {
  const work = busy();
  $('analyze').disabled = !ready || !job || work;
  $('export').disabled = work || job?.status !== 'analyzed' || !job?.plan?.kept.length || !settingsMatch();
  $('delete').disabled = !job || work;
  $('file').disabled = work;
  $('recent').disabled = work;
  ['threshold','minimum','padding'].forEach(id => $(id).disabled = work);
  document.querySelectorAll('[data-preset]').forEach(b => b.disabled = work);
  if (job?.status === 'analyzed' && !settingsMatch()) message('Os ajustes mudaram. Analise novamente antes de exportar.');
  else if (job?.error) message(job.error, 'error');
  else if (job?.status === 'analyzed') message(job.plan.removed.length ? 'Análise pronta. Confira os cortes abaixo e exporte quando estiver satisfeito.' : 'Nenhuma pausa encontrada com esses ajustes. Você pode aumentar o limite de silêncio ou diminuir a pausa mínima.');
  else if (job?.status === 'completed') message('Seu vídeo está pronto. Baixe o MP4 e importe no editor.', 'success');
}
function viewResult(value) {
  resultView = value;
  $('player').src = `/api/jobs/${job.id}/video/${value ? 'output' : 'original'}`;
  $('original').classList.toggle('selected', !value);
  $('result').classList.toggle('selected', value);
}
function render() {
  if (!job) return;
  $('placeholder').classList.add('hidden'); $('player').classList.remove('hidden');
  $('videoName').textContent = job.name;
  $('fileLabel').textContent = job.name; $('fileHint').textContent = 'Clique para carregar outro vídeo';
  const names = { uploaded:'PRONTO PARA ANALISAR', queued:'NA FILA', analyzing:'ANALISANDO', analyzed:'ANÁLISE PRONTA', rendering:'EXPORTANDO', completed:'CONCLUÍDO', failed:'ERRO', cancelled:'CANCELADO' };
  $('status').textContent = names[job.status] || 'ENVIANDO';
  const work = ['queued','analyzing','rendering'].includes(job.status);
  $('workProgress').classList.toggle('hidden', !work);
  $('workText').textContent = job.status === 'rendering' ? 'Gerando vídeo sem pausas…' : job.status === 'queued' ? 'Aguardando na fila…' : 'Detectando pausas no áudio…';
  $('workBar').value = job.progress; $('percent').textContent = `${job.progress}%`;
  $('duration').textContent = format(job.plan?.originalDuration ?? job.info?.duration);
  $('newDuration').textContent = format(job.plan?.outputDuration);
  $('saved').textContent = job.plan ? `−${format(job.plan.savedSeconds)}` : '—';
  $('cutCount').textContent = job.plan ? `${job.plan.removed.length} pausas removidas · ${job.plan.kept.length} trechos preservados` : 'Analise para encontrar as pausas';
  $('toggleCuts').disabled = !job.plan?.removed.length;
  $('report').disabled = !job.plan;
  $('original').disabled = false; $('result').disabled = job.status !== 'completed';
  $('download').classList.toggle('hidden', job.status !== 'completed');
  $('export').classList.toggle('hidden', job.status === 'completed');
  $('download').href = `/api/jobs/${job.id}/download`;
  drawTimeline(); updateButtons();
}
function drawTimeline() {
  const canvas = $('timeline'), rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio; canvas.height = 46 * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio,ratio);
  ctx.fillStyle = '#35363f'; ctx.fillRect(0,9,rect.width,28);
  if (!job?.plan) return;
  ctx.fillStyle = '#9171ef';
  for (const cut of job.plan.removed) ctx.fillRect(cut.start / job.plan.originalDuration * rect.width,9,Math.max(1,cut.duration / job.plan.originalDuration * rect.width),28);
}
function showCuts() {
  $('cuts').classList.toggle('hidden');
  $('toggleCuts').textContent = $('cuts').classList.contains('hidden') ? 'Ver cortes' : 'Ocultar cortes';
  const rows = $('cutRows'); rows.replaceChildren();
  for (const [i,cut] of (job?.plan?.removed || []).slice(0,1000).entries()) {
    const row = document.createElement('tr');
    [i+1, format(cut.start), format(cut.end), `${Math.round(cut.duration*1000)} ms`].forEach(text => { const td=document.createElement('td'); td.textContent=text; row.append(td); });
    const td=document.createElement('td'), button=document.createElement('button'); button.className='text-button'; button.textContent='Ouvir';
    button.onclick=()=> { if(resultView) viewResult(false); $('player').currentTime=Math.max(0,cut.start-.4); $('player').play().catch(()=>{}); }; td.append(button); row.append(td); rows.append(row);
  }
  $('cutNote').textContent = job.plan.removed.length > 1000 ? 'Exibindo os primeiros 1.000 cortes. O relatório JSON contém todos.' : 'Os tempos se referem ao vídeo original.';
}
async function refreshList() {
  const jobs = await api('/api/jobs'); $('recent').replaceChildren(new Option('Selecione um vídeo',''));
  jobs.filter(j=>j.status !== 'uploading').forEach(j=>$('recent').add(new Option(j.name,j.id)));
  $('recent').value = job?.id || ''; $('recentLabel').classList.toggle('hidden', !jobs.length);
}
function startPolling() {
  clearTimeout(poll);
  const id = job?.id;
  poll = setTimeout(async()=> {
    try {
      const latest=await api(`/api/jobs/${id}`); if(job?.id!==id) return;
      const wasComplete = job.status === 'completed'; job=latest; render();
      if(job.status==='completed' && !wasComplete) viewResult(true);
      if(busy()) startPolling(); else refreshList().catch(()=>{});
    } catch(e) { message(`${e.message} Tentando reconectar…`,'error'); if(job?.id===id) startPolling(); }
  },1000);
}
async function selectJob(id) {
  if(!id || busy()) return;
  clearTimeout(poll); job=await api(`/api/jobs/${id}`); message('');
  if(job.settings) { $('threshold').value=job.settings.thresholdDb; $('minimum').value=job.settings.minSilenceMs; $('padding').value=job.settings.paddingMs; }
  $('cuts').classList.add('hidden'); $('toggleCuts').textContent='Ver cortes';
  changed(); render(); viewResult(job.status==='completed'); if(busy()) startPolling();
}
function upload(file) {
  if(!file || busy()) return;
  if(!file.name.toLowerCase().endsWith('.mp4')) return message('Escolha um arquivo MP4.','error');
  if(!file.size) return message('Escolha um arquivo MP4 não vazio.','error');
  if(maxBytes && file.size>maxBytes) return message(`Escolha um MP4 de até ${Math.round(maxBytes/1024/1024)} MB.`,'error');
  uploading=true; updateButtons(); message(''); $('uploadProgress').classList.remove('hidden'); $('uploadBar').value=0;
  const xhr=new XMLHttpRequest(); xhr.open('POST',`/api/jobs?filename=${encodeURIComponent(file.name)}`); xhr.setRequestHeader('Content-Type','application/octet-stream');
  xhr.upload.onprogress=e=>{ if(e.lengthComputable) { const p=Math.round(e.loaded/e.total*100); $('uploadBar').value=p; $('uploadText').textContent=`Enviando ${p}%`; }};
  xhr.onload=async()=> {
    uploading=false; $('uploadProgress').classList.add('hidden');
    try { const data=JSON.parse(xhr.responseText); if(xhr.status>=400) throw new Error(data.error || 'Erro no upload.'); job=data; $('cuts').classList.add('hidden'); render(); viewResult(false); message('Vídeo carregado. Ajuste os parâmetros e clique em Analisar pausas.'); await refreshList(); }
    catch(e){message(e.message,'error');} updateButtons(); $('file').value='';
  };
  xhr.onerror=()=>{uploading=false;$('uploadProgress').classList.add('hidden');message('Falha no envio. Confira se o servidor está em execução.','error');updateButtons();};
  xhr.send(file);
}
async function action(kind) {
  try {
    await api(`/api/jobs/${job.id}/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},...(kind==='analyze'?{body:JSON.stringify(settings())}:{})});
    if(kind==='cancel') { $('cancel').disabled=true; message('Cancelando…'); }
    else { job.status='queued'; job.progress=0; job.error=null; if(kind==='analyze'){job.plan=null; $('cuts').classList.add('hidden'); viewResult(false);} message(''); render(); }
    startPolling();
  } catch(e){message(e.message,'error');}
}
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{ const p=presets[b.dataset.preset]; $('threshold').value=p[0]; $('minimum').value=p[1]; $('padding').value=p[2]; changed(); });
['threshold','minimum','padding'].forEach(id=>$(id).oninput=changed);
$('file').onchange=()=>upload($('file').files[0]);
$('dropzone').ondragover=e=>{e.preventDefault();if(!busy())$('dropzone').classList.add('dragover');};
$('dropzone').ondragleave=()=>$('dropzone').classList.remove('dragover');
$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('dragover');upload(e.dataTransfer.files[0]);};
$('analyze').onclick=()=>{ $('cancel').disabled=false; action('analyze'); };
$('export').onclick=()=>{ $('cancel').disabled=false; action('export'); };
$('cancel').onclick=()=>action('cancel');
$('original').onclick=()=>viewResult(false); $('result').onclick=()=>viewResult(true);
$('toggleCuts').onclick=showCuts;
$('recent').onchange=()=>selectJob($('recent').value).catch(e=>message(e.message,'error'));
$('report').onclick=async()=>{try {const data=await api(`/api/jobs/${job.id}/cuts`);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cortes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message,'error');}};
$('delete').onclick=async()=>{try { $('player').removeAttribute('src');$('player').load();await api(`/api/jobs/${job.id}`,{method:'DELETE'});location.reload();}catch(e){message(e.message,'error');viewResult(resultView);}};
window.addEventListener('resize',drawTimeline);
async function init() {
  try { const health=await api('/api/health');ready=health.ready;maxBytes=health.maxUploadBytes;const remote=health.processingLocation==='server';const desktop=health.processingLocation==='desktop';$('processingLabel').textContent=remote?'PROCESSAMENTO NO SERVIDOR':desktop?'DESKTOP · FFMPEG NATIVO':'PROCESSAMENTO LOCAL';$('storageLabel').textContent=remote?'Arquivos temporários no servidor. Baixe o resultado; reiniciar o serviço apaga os arquivos.':desktop?'Processamento privado neste computador. Fechar a janela encerra o motor local.':'Seus arquivos ficam neste computador e são temporários.';const localReady=desktop?`Pronto para processar com ${health.videoEncoder || `${health.cpuThreads || 1} threads de CPU`}. O vídeo não sai deste computador.`:'Pronto para processar. O vídeo é enviado apenas para o servidor local.';$('health').textContent=ready?(remote?'Pronto para processar. Seu vídeo será enviado ao servidor deste site.':localReady):health.error;$('health').className=`notice ${ready?'success':'error'}`;$('uploadLimit').textContent=maxBytes?`MP4 · até ${Math.round(maxBytes/1024/1024)} MB`:'MP4 · sem limite fixo';await refreshList();const id=$('recent').options[1]?.value;if(id)await selectJob(id); }
  catch(e){$('health').textContent=e.message;$('health').className='notice error';}changed();drawTimeline();
}
init();
