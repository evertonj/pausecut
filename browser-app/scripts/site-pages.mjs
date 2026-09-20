import {guides, institutional} from './site-content.mjs';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonScript = obj => JSON.stringify(obj).replace(/</g,'\\u003c');
export function validateConfig(config) {
  const url = new URL(config.baseUrl);
  if(url.protocol!=='https:' || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error('baseUrl must be an HTTPS folder URL ending in /');
  if(config.adsenseSiteDomain && url.hostname!==config.adsenseSiteDomain && !url.hostname.endsWith('.'+config.adsenseSiteDomain)) throw new Error('AdSense site domain must match the site hostname or its parent domain');
  if(!config.brand?.trim()) throw new Error('Missing brand');
  if(config.contactEmail && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(config.contactEmail)) throw new Error('Invalid public contact email');
  if(config.githubUrl) {
    const github = new URL(config.githubUrl);
    if(github.protocol!=='https:' || github.hostname!=='github.com' || github.search || github.hash) throw new Error('GitHub URL must be an HTTPS github.com profile or repository URL');
  }
  if(config.adsensePublisherId && !/^ca-pub-\d{16}$/.test(config.adsensePublisherId)) throw new Error('AdSense ID must have the format ca-pub- followed by 16 digits');
  if(config.desktopDownload?.url) {
    const download = new URL(config.desktopDownload.url);
    if(download.protocol!=='https:' || download.origin!==url.origin || !download.pathname.endsWith('.zip')) throw new Error('Desktop download must be a same-origin HTTPS ZIP URL');
    const checksum = new URL(config.desktopDownload.sha256Url);
    if(checksum.origin!==url.origin || checksum.href!==download.href+'.sha256') throw new Error('Desktop checksum URL must match the ZIP URL');
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(config.updatedAt)) throw new Error('Invalid policy update date');
}
export function header(current='index.html') {
  const item = (file,label) => `<a href="./${file==='index.html'?'':file}"${file===current?' aria-current="page"':''}>${label}</a>`;
  return `<a class="skip-link" href="#conteudo">Pular para o conteúdo</a><header class="site-header"><a class="brand" href="./" aria-label="PauseCut, início">▥ <span>Pause<span class="accent">Cut</span></span></a><nav aria-label="Navegação principal">${item('index.html','Editor')}<a href="./#download-desktop">Desktop</a>${item('guias.html','Guias')}${item('sobre.html','Sobre')}${item('contato.html','Contato')}</nav><span class="local"><i></i> NO SEU NAVEGADOR</span></header>`;
}
export function footer(config) {
  const github=config.githubUrl?`<a href="${escapeHtml(config.githubUrl)}" rel="me external">GitHub</a>`:'';
  return `<footer class="site-footer"><div><strong>PauseCut / ${escapeHtml(config.brand)}</strong><p>Pré-edição de vídeo com processamento no seu dispositivo.</p></div><nav aria-label="Informações do site"><a href="./sobre.html">Sobre</a><a href="./contato.html">Contato</a>${github}<a href="./privacidade.html">Privacidade</a><a href="./termos.html">Termos de uso</a></nav></footer>`;
}
export function metadata(config, file, title, description, schema) {
  const canonical = new URL(file==='index.html'?'':file,config.baseUrl).href;
  return `<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow"><meta name="theme-color" content="#15161b">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="PauseCut">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">
${config.adsensePublisherId?`<meta name="google-adsense-account" content="${escapeHtml(config.adsensePublisherId)}">`:''}
${schema?`<script type="application/ld+json">${jsonScript(schema)}</script>`:''}`;
}
export function guideCards() {
  return `<div class="guide-grid">${guides.map((g,i)=>`<a class="guide-card" href="./${g.file}"><span class="guide-number">GUIA 0${i+1}</span><h3>${g.title}</h3><p>${g.description}</p><span class="guide-more">Ler o guia →</span></a>`).join('')}</div>`;
}
export function desktopDownload(config) {
  const download=config.desktopDownload;
  if(!download?.url) return '';
  const available=download.available!==false;
  const details=[`v${escapeHtml(download.version || '1.0.0')}`,download.sizeMiB?`${escapeHtml(download.sizeMiB)} MB`:'Windows 64 bits'].join(' · ');
  const action=available
    ? `<a class="desktop-cta" href="${escapeHtml(download.url)}" download>Baixar PauseCut Desktop <span>↓</span></a>`
    : `<span class="desktop-cta disabled" aria-disabled="true">Pacote em preparação</span>`;
  return `<section id="download-desktop" class="desktop-download" aria-labelledby="desktop-title"><div class="desktop-copy"><span class="desktop-kicker">MAIS VELOCIDADE, MESMA PRIVACIDADE</span><h2 id="desktop-title">Use toda a potência do seu PC.</h2><p>A versão desktop executa o FFmpeg nativo, detecta aceleração NVIDIA, Intel ou AMD e volta automaticamente para todos os processadores da CPU quando necessário. O vídeo continua no seu computador.</p><ul><li>Windows 10/11 de 64 bits</li><li>Sem instalar .NET ou FFmpeg</li><li>Sem limite de memória do navegador</li></ul></div><div class="desktop-action"><span class="desktop-badge">WINDOWS</span>${action}<strong>${details}</strong><small>Extraia o ZIP e abra PauseCut.Desktop.exe.</small>${available&&download.sha256Url?`<a class="checksum-link" href="${escapeHtml(download.sha256Url)}">Ver SHA-256</a>`:''}</div></section>`;
}
export function editorContent() {
  return `<section class="editor-guide" aria-labelledby="entenda"><h2 id="entenda">Cortes melhores começam com uma revisão</h2><p>O PauseCut identifica intervalos de baixo volume na primeira faixa de áudio e recorta imagem e som juntos. Também converte o MP4 para 9:16, 1:1, 4:5 ou 16:9, com foco manual, fundo desfocado ou bordas pretas.</p>${guideCards()}<div class="faq"><h2>Perguntas frequentes</h2><details><summary>Meu vídeo é enviado ao servidor?</summary><p>Não. O MP4 é aberto e processado no navegador. A hospedagem entrega a página e o motor de vídeo, mas não recebe o arquivo selecionado. Veja os detalhes na <a href="./privacidade.html">política de privacidade</a>.</p></details><details><summary>Posso apenas converter, sem remover pausas?</summary><p>Sim. Selecione o formato desejado e use Converter vídeo original. Para aplicar o formato depois dos cortes, analise as pausas e use a exportação sem pausas.</p></details><details><summary>O arquivo comprimido terá exatamente o tamanho informado?</summary><p>O valor funciona como limite máximo aproximado. O resultado pode ficar menor conforme o conteúdo. O editor reserva margem para áudio, estrutura do MP4 e variações da codificação.</p></details><details><summary>Funciona com música e ruído?</summary><p>A detecção é baseada em volume. Música e ruído constantes podem esconder os intervalos silenciosos. Fala baixa pode ser confundida com silêncio se o limite estiver alto demais. Confira o <a href="./ajustar-silencio.html">guia de ajustes</a> antes de exportar.</p></details><details><summary>O relatório JSON abre como projeto no CapCut?</summary><p>Não. O relatório registra os parâmetros e os intervalos de corte. Importe o MP4 exportado como uma nova mídia no seu editor.</p></details><details><summary>Posso fechar a aba durante a exportação?</summary><p>Mantenha a aba aberta. O processamento não continua no servidor e os resultados não baixados são perdidos ao recarregar ou fechar. Vídeos longos ou de alta resolução podem exceder a memória disponível, mesmo abaixo do limite de 1 GB.</p></details></div></section>`;
}
export function createPages(config, indexTemplate) {
  validateConfig(config);
  const pages = new Map();
  const software = {'@context':'https://schema.org','@type':'WebApplication',name:'PauseCut',url:config.baseUrl,applicationCategory:'MultimediaApplication',operatingSystem:'Navegador com WebAssembly',inLanguage:'pt-BR',description:'Pré-edição local de MP4 com remoção de pausas, conversão de formato e compressão por tamanho.',offers:{'@type':'Offer',price:'0',priceCurrency:'BRL'}};
  const index = indexTemplate.replace('<!-- SITE_METADATA -->',metadata(config,'index.html','PauseCut · Remover pausas, converter e comprimir vídeos','Remova pausas, converta vídeos MP4 para formatos sociais e limite o tamanho do arquivo diretamente no navegador.',software))
    .replace('<!-- SITE_HEADER -->',header()).replace('<!-- DESKTOP_DOWNLOAD -->',desktopDownload(config)).replace('<!-- EDITOR_GUIDES -->',editorContent()).replace('<!-- SITE_FOOTER -->',footer(config));
  pages.set('index.html',index);
  const all = [...guides, ...institutional(config,escapeHtml), {file:'guias.html', title:'Guias de pré-edição de vídeo', description:'Aprenda a revisar cortes de silêncio, ajustar o ritmo da fala e continuar a edição do MP4.', body:`<p>Estes guias acompanham o uso do PauseCut, da primeira análise até a importação do resultado. Use um trecho curto para experimentar os ajustes e mantenha o vídeo original.</p>${guideCards()}`}];
  for(const page of all) {
    const isGuide = guides.some(g=>g.file===page.file);
    const schema = isGuide ? {'@context':'https://schema.org','@type':'Article',headline:page.title,description:page.description,inLanguage:'pt-BR',author:{'@type':'Organization',name:config.brand},publisher:{'@type':'Organization',name:config.brand},mainEntityOfPage:new URL(page.file,config.baseUrl).href} : null;
    pages.set(page.file, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(page.title)} · PauseCut</title>${metadata(config,page.file,page.title,page.description,schema)}<link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./site.css"></head><body>${header(page.file)}<main id="conteudo" class="reading-page"><article><p class="breadcrumb"><a href="./">Editor</a> / ${isGuide?'<a href="./guias.html">Guias</a>':'Informações'}</p><h1>${escapeHtml(page.title)}</h1>${page.body}${isGuide?'<aside class="article-next"><a href="./">Abrir o editor →</a><a href="./guias.html">Ver todos os guias</a></aside>':''}</article>${footer(config)}</main></body></html>`);
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages.keys()].map(file=>`<url><loc>${escapeHtml(new URL(file==='index.html'?'':file,config.baseUrl).href)}</loc></url>`).join('')}</urlset>`;
  pages.set('sitemap.xml',sitemap);
  pages.set('robots.txt',`User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml',config.baseUrl).href}\n`);
  return pages;
}
