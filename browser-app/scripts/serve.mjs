import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.xml':'application/xml; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try {
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Preview both root and Hostinger subdirectory layouts.
    if(pathname.startsWith('/pausecut/'))pathname=pathname.slice('/pausecut'.length);
    if(pathname.endsWith('/'))pathname+='index.html';
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root)||!(await stat(target)).isFile()){res.writeHead(404);res.end();return;}
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store',
      'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
server.listen(5090,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5090/pausecut/'));
