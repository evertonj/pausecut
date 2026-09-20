import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFilter,buildPlan,encodingBudget,normalizeExportOptions,outputDimensions,parseMedia,silenceCollector,validateSettings} from '../planner.js';
const settings={thresholdDb:-35,minSilenceMs:100,paddingMs:40};
test('Known speech pauses preserve margins and exact frame boundaries',()=>{
  const plan=buildPlan(5,30,[{start:1,end:1.5},{start:2,end:2.05},{start:3,end:3.2}],settings);
  assert.equal(plan.removed.length,2);
  assert.equal(plan.removed[0].start,32/30);
  assert.equal(plan.removed[0].end,43/30);
  assert.ok(Math.abs(plan.outputDuration-(5-13/30))<1e-8);
});
test('Kept and removed ranges cover source exactly without overlap',()=>{
  const p=buildPlan(8,29.97,[{start:0,end:1.4},{start:2,end:3},{start:2.5,end:3.5},{start:7,end:8}],settings);
  const all=[...p.kept,...p.removed].sort((a,b)=>a.start-b.start);
  assert.equal(all[0].start,0);assert.equal(all.at(-1).end,8);
  for(let i=1;i<all.length;i++)assert.ok(Math.abs(all[i-1].end-all[i].start)<1e-8);
  assert.equal(p.removed.length,3);
});
test('A fully silent video is represented without an empty video export',()=>{
  const p=buildPlan(2,30,[{start:0,end:2}],settings);assert.equal(p.kept.length,0);assert.equal(p.outputDuration,0);
});
test('Without silence keep the whole recording',()=>{
  assert.deepEqual(buildPlan(2,30,[],settings).kept,[{start:0,end:2,duration:2}]);
});
test('Margins protect a short pause and ignore invalid timestamps',()=>{
  assert.equal(buildPlan(2,30,[{start:.5,end:.65},{start:NaN,end:1}],{...settings,paddingMs:80}).removed.length,0);
});
test('Silence log parser closes trailing silence and handles repeated events',()=>{
  const collector=silenceCollector();collector.push('silence_start: 1');collector.push('silence_end: 1.4 | silence_duration: 0.4');collector.push('silence_start: 2');
  assert.deepEqual(collector.finish(3).map(s=>[s.start,s.end]),[[1,1.4],[2,3]]);
});
test('Probe skips cover art, selects real stream indices and falls back from invalid FPS',()=>{
  const p=parseMedia({streams:[{index:0,codec_type:'video',disposition:{attached_pic:1}},{index:1,codec_type:'video',avg_frame_rate:'0/0',duration:'3'},{index:2,codec_type:'audio'}]});
  assert.equal(p.videoIndex,1);assert.equal(p.audioIndex,2);assert.equal(p.fps,30);
  assert.throws(()=>parseMedia({streams:[{index:0,codec_type:'video'}]}),/áudio/);
});
test('Reject parameters outside meaningful bounds',()=>{
  assert.throws(()=>validateSettings({...settings,thresholdDb:NaN}));
  assert.throws(()=>validateSettings({...settings,minSilenceMs:0}));
  assert.throws(()=>buildPlan(0,30,[],settings));
});
test('Social output presets generate fixed even dimensions and three framing modes',()=>{
  const info={videoIndex:0,audioIndex:1,videoStart:0,frameRate:'30/1'};
  const batch=[{start:0,end:2,duration:2}];
  assert.deepEqual(outputDimensions(info,{resolution:'720',aspect:'vertical',framing:'crop'}),{width:720,height:1280,ratio:'9:16'});
  assert.deepEqual(outputDimensions(info,{resolution:'1080',aspect:'portrait',framing:'fit'}),{width:1080,height:1350,ratio:'4:5'});
  assert.match(batchFilter(info,batch,{resolution:'720',aspect:'vertical',framing:'crop'}).graph,/scale=720:1280.*crop=720:1280/);
  assert.match(batchFilter(info,batch,{resolution:'720',aspect:'vertical',framing:'blur'}).graph,/boxblur=20:1.*overlay=/);
  assert.match(batchFilter(info,batch,{resolution:'720',aspect:'vertical',framing:'fit'}).graph,/pad=720:1280/);
});
test('Export options validate aspect, framing and backwards-compatible resolution input',()=>{
  assert.deepEqual(normalizeExportOptions('720'),{resolution:'720',aspect:'original',framing:'crop',focusX:50,focusY:50,compression:'quality',targetMiB:100,audioMode:'original'});
  assert.throws(()=>normalizeExportOptions({resolution:'4k',aspect:'vertical'}),/Resolução/);
  assert.throws(()=>normalizeExportOptions({resolution:'720',aspect:'story'}),/Formato/);
  assert.throws(()=>normalizeExportOptions({resolution:'720',aspect:'vertical',framing:'stretch'}),/Enquadramento/);
  assert.throws(()=>normalizeExportOptions({resolution:'720',aspect:'vertical',focusX:101}),/foco/);
  assert.throws(()=>normalizeExportOptions({resolution:'720',compression:'target',targetMiB:0}),/tamanho/);
  assert.throws(()=>normalizeExportOptions({resolution:'720',audioMode:'studio-ai'}),/áudio/);
});
test('Manual crop focus is translated to proportional FFmpeg coordinates',()=>{
  const info={videoIndex:0,audioIndex:1,videoStart:0,frameRate:'30/1'};
  const graph=batchFilter(info,[{start:0,end:1,duration:1}],{resolution:'720',aspect:'vertical',framing:'crop',focusX:25,focusY:80}).graph;
  assert.match(graph,/x='\(iw-ow\)\*0\.25'/);
  assert.match(graph,/y='\(ih-oh\)\*0\.8'/);
});
test('Target-size compression reserves audio and container overhead',()=>{
  assert.deepEqual(encodingBudget(60,{resolution:'720',compression:'quality'}),{videoKbps:null,audioKbps:192,targetBytes:null});
  const budget=encodingBudget(60,{resolution:'720',compression:'target',targetMiB:25});
  assert.equal(budget.audioKbps,128);assert.equal(budget.targetBytes,25*1024*1024);
  assert.ok(budget.videoKbps>2500&&budget.videoKbps<3000);
  assert.throws(()=>encodingBudget(7200,{resolution:'720',compression:'target',targetMiB:25}),/muito pequeno/);
});
