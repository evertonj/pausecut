import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPages,validateConfig} from '../scripts/site-pages.mjs';
const template=await readFile(new URL('../index.html',import.meta.url),'utf8');
const config={baseUrl:'https://pausecut.homeforgelab.com/',adsenseSiteDomain:'homeforgelab.com',brand:'HomeForgeLab',responsibleName:'Responsável de teste',contactEmail:'editor@example.com',githubUrl:'https://github.com/evertonj',adsensePublisherId:'',desktopDownload:{version:'1.0.0',url:'https://pausecut.homeforgelab.com/downloads/PauseCut-Desktop-Windows-x64.zip',sha256Url:'https://pausecut.homeforgelab.com/downloads/PauseCut-Desktop-Windows-x64.zip.sha256'},updatedAt:'2026-09-20'};
test('all public pages are linked and independently readable without the editor runtime',()=>{
  const pages=createPages(config,template);
  assert.equal(pages.size,13);
  for(const [file,html] of pages){
    if(!file.endsWith('.html'))continue;
    if(!file.endsWith('.html'))continue;
    assert.match(html,/<html lang="pt-BR">/);
    assert.match(html,/<h1/);
    assert.match(html,/rel="canonical"/);
    assert.doesNotMatch(html,/<!-- SITE_|<!-- EDITOR_GUIDES/);
    for(const match of html.matchAll(/href="\.\/([^"#]+\.html)"/g))assert.ok(pages.has(match[1]),`${file}: ${match[1]}`);
    if(file!=='index.html')assert.doesNotMatch(html,/src="\.\/app.js"/);
    assert.ok(pages.get('sitemap.xml').includes(new URL(file==='index.html'?'':file,config.baseUrl).href));
  }
  assert.equal(pages.get('robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${config.baseUrl}sitemap.xml\n`);
});
test('desktop download is prominent, same-origin and describes the native acceleration',()=>{
  const page=createPages(config,template).get('index.html');
  assert.match(page,/id="download-desktop"/);
  assert.match(page,/PauseCut-Desktop-Windows-x64\.zip/);
  assert.match(page,/NVIDIA, Intel ou AMD/);
  assert.throws(()=>validateConfig({...config,desktopDownload:{...config.desktopDownload,url:'https://downloads.example.com/PauseCut.zip'}}));
});
test('unconfigured AdSense creates no account ID or ad network request',()=>{
  const pages=createPages(config,template);
  for(const html of pages.values())assert.doesNotMatch(html,/google-adsense-account|adsbygoogle|pagead2\.googlesyndication/);
});
test('subdomain metadata and sitemap use its root URL; subdirectory layouts still work',()=>{
  const pages=createPages(config,template);
  assert.match(pages.get('index.html'),/rel="canonical" href="https:\/\/pausecut.homeforgelab.com\/"/);
  assert.match(pages.get('sitemap.xml'),/<loc>https:\/\/pausecut.homeforgelab.com\/privacidade.html<\/loc>/);
  for(const html of pages.values())assert.doesNotMatch(html,/https:\/\/homeforgelab.com\/pausecut\//);
  const folderPages=createPages({...config,baseUrl:'https://homeforgelab.com/pausecut/',desktopDownload:{...config.desktopDownload,url:'https://homeforgelab.com/pausecut/downloads/PauseCut-Desktop-Windows-x64.zip',sha256Url:'https://homeforgelab.com/pausecut/downloads/PauseCut-Desktop-Windows-x64.zip.sha256'}},template);
  assert.match(folderPages.get('sitemap.xml'),/<loc>https:\/\/homeforgelab.com\/pausecut\/privacidade.html<\/loc>/);
  assert.throws(()=>validateConfig({...config,adsenseSiteDomain:'another-site.example'}));
});
test('configured AdSense uses metadata only and no third-party loader',()=>{
  const pages=createPages({...config,adsensePublisherId:'ca-pub-1234567890123456'},template);
  for(const [file,html] of pages){
    if(!file.endsWith('.html'))continue;
    assert.match(html,/<meta name="google-adsense-account" content="ca-pub-1234567890123456">/);
    assert.doesNotMatch(html,/pagead2\.googlesyndication|adsbygoogle/);
  }
});
test('public identity and mail link are escaped and invalid account IDs are rejected',()=>{
  const pages=createPages({...config,responsibleName:'A & B <Editor>'},template);
  assert.match(pages.get('contato.html'),/A &amp; B &lt;Editor&gt;/);
  assert.match(pages.get('privacidade.html'),/mailto:editor@example.com/);
  assert.match(pages.get('contato.html'),/https:\/\/github\.com\/evertonj/);
  assert.throws(()=>validateConfig({...config,adsensePublisherId:'ca-pub-123'}));
  assert.throws(()=>validateConfig({...config,contactEmail:'bad@example.com" onclick="oops'}));
  assert.throws(()=>validateConfig({...config,baseUrl:'http://homeforgelab.com/pausecut/'}));
  assert.throws(()=>validateConfig({...config,githubUrl:'https://example.com/evertonj'}));
});
