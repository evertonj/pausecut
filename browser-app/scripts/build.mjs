import {cp,mkdir,readFile,writeFile,stat,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createPages,validateConfig} from './site-pages.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'dist');
const allowed=['styles.css','site.css','app.js','engine.js','planner.js','performance.js','threaded-core.js','.htaccess','vendor'];
const config=JSON.parse(await readFile(path.join(root,'site.config.json'),'utf8'));
const desktopZip=path.join(root,'..','artifacts','PauseCut-Desktop-Windows-x64.zip');
try {
  const desktopStat=await stat(desktopZip);
  const checksum=(await readFile(desktopZip+'.sha256','utf8')).trim().split(/\s+/)[0];
  config.desktopDownload={...config.desktopDownload,available:true,sizeMiB:(desktopStat.size/1024/1024).toFixed(1),sha256:checksum};
} catch {
  if(config.desktopDownload) config.desktopDownload={...config.desktopDownload,available:false};
}
validateConfig(config);
const pending=[];
if(!config.responsibleName?.trim())pending.push('Confirmar nome do responsável em site.config.json');
if(!config.contactEmail)pending.push('Configurar e-mail público real em site.config.json');
if(process.argv.includes('--ready') && pending.length)throw new Error('Publicação pendente: '+pending.join('; '));
const sums=JSON.parse(await readFile(path.join(root,'vendor/asset-sha256.json'),'utf8'));
for(const [file,expected] of Object.entries(sums)){
  const actual=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  if(actual!==expected)throw new Error('Vendor integrity failure: '+file);
}
// Only remove this exact, resolved build directory inside browser-app.
if(path.resolve(dist)!==path.resolve(root,'dist') || path.relative(root,dist)!=='dist')throw new Error('Unsafe build directory');
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const name of allowed)await cp(path.join(root,name),path.join(dist,name),{recursive:true});
const pages=createPages(config,await readFile(path.join(root,'index.html'),'utf8'));
for(const [file,content] of pages)await writeFile(path.join(dist,file),content);
for(const [file,html] of pages){
  if(!file.endsWith('.html'))continue;
  if(html.includes('<!-- SITE_')||html.includes('<!-- EDITOR_GUIDES')||html.includes('<!-- DESKTOP_'))throw new Error('Unresolved template in '+file);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML IDs in '+file);
  for(const match of html.matchAll(/\b(?:href|src)="(\.\/[^"?#]*|#[^"]+)"/g)){
    const target=match[1];
    if(target.startsWith('#')){if(!ids.includes(target.slice(1)))throw new Error('Missing anchor '+target+' in '+file);continue;}
    await stat(path.join(dist,target==='./'?'index.html':target.slice(2)));
  }
}
const integration=path.join(root,'..','artifacts','adsense-integration');
await mkdir(integration,{recursive:true});
// Remove only generated files when the account is cleared, so stale IDs never ship.
for(const file of ['ads.txt','verificacao-adsense.html'])await rm(path.join(integration,file),{force:true});
if(config.adsensePublisherId){
  await writeFile(path.join(integration,'ads.txt'),`google.com, ${config.adsensePublisherId.slice(3)}, DIRECT, f08c47fec0942fa0\n`);
  await writeFile(path.join(integration,'verificacao-adsense.html'),`<!-- Inserir esta meta tag no HEAD da página inicial de ${config.adsenseSiteDomain || new URL(config.baseUrl).hostname}. As páginas do editor já contêm a meta tag. -->\n<meta name="google-adsense-account" content="${config.adsensePublisherId}">\n`);
}
await writeFile(path.join(integration,'STATUS.json'),JSON.stringify({pending,accountConfigured:!!config.adsensePublisherId,adRequestsEnabled:false,domain:new URL(config.baseUrl).hostname,adsenseSiteDomain:config.adsenseSiteDomain || new URL(config.baseUrl).hostname,notes:['A aprovação depende da avaliação do Google e do domínio publicado.','Arquivos desta pasta são instruções de integração; não extraia sobre a raiz automaticamente.']},null,2));
const required=['vendor/core/ffmpeg-core.wasm','vendor/core/ffmpeg-core.js','vendor/core-mt/ffmpeg-core.wasm','vendor/core-mt/ffmpeg-core.js','vendor/core-mt/ffmpeg-core.worker.js','vendor/ffmpeg/worker.js','vendor/ffmpeg/classes.js'];
for(const file of required)if(!(await stat(path.join(dist,file))).size)throw new Error('Missing build asset: '+file);
const html=await readFile(path.join(dist,'index.html'),'utf8');
if(/(?:src|href)="\//.test(html))throw new Error('Root-relative paths would break subdirectory deployment');
const manifest=[];
async function collect(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const full=path.join(folder,entry.name);
    if(entry.isDirectory())await collect(full);
    else manifest.push({path:path.relative(dist,full).replaceAll('\\','/'),bytes:(await stat(full)).size});
  }
}
await collect(dist);
await writeFile(path.join(dist,'build-manifest.json'),JSON.stringify({version:'1.2.0',files:manifest},null,2));
console.log(`Static build ready: ${dist}`);
console.log(`${manifest.length} public files; ${(manifest.reduce((sum,f)=>sum+f.bytes,0)/1024/1024).toFixed(1)} MiB`);
if(pending.length)console.log('PENDENTE ANTES DA PUBLICAÇÃO: '+pending.join('; '));
console.log(config.adsensePublisherId?'Meta tag e ads.txt gerados para a conta configurada.':'Conta AdSense ainda não configurada. Nenhum ID fictício foi incluído.');
