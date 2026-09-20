# PauseCut para navegador / Hostinger

Esta é a versão adaptada para o plano gerenciado da Hostinger. HTML, CSS e módulos JavaScript estáticos, com FFmpeg WebAssembly executado no dispositivo. O modo multithread aproveita vários núcleos; o modo de uma thread continua disponível quando necessário. Não usa ASP.NET, PHP, Node no servidor, Docker, banco de dados nem API de upload. O app original C# continua na raiz do repositório para uso local/VPS.

## Desenvolvimento

Com Node.js 20 ou superior, a partir de `browser-app`:

```bash
npm run dev
```

Abra `http://127.0.0.1:5090/pausecut/`. O mesmo conjunto de arquivos funciona em um subdomínio ou em uma subpasta. Não abra `index.html` por `file://`: os módulos e workers precisam de HTTP/HTTPS.

Os arquivos oficiais de `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/core` 0.12.10 e `@ffmpeg/core-mt` 0.12.10 estão em `vendor`. Os downloads foram conferidos contra o SHA512 informado pelo registro npm; `versions.json` registra a origem. `asset-sha256.json` permite validar os assets copiados antes de gerar o build. A execução usa URLs locais explícitas e não depende de CDN. Avisos de licença estão em `vendor`.

## Build e ZIP

```bash
node --test tests/planner.test.mjs
node scripts/build.mjs
```

O script gera `dist/` apenas com os arquivos públicos necessários. Na pasta raiz do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/Build-SharedHosting.ps1
```

O resultado é `artifacts/PauseCut-Hostinger-Subdominio.zip`. Veja `PUBLICAR-HOSTINGER-COMPARTILHADA.md`.

Para publicar também o download do aplicativo Windows, gere primeiro `artifacts/PauseCut-Desktop-Windows-x64.zip` com `deploy/Build-Desktop.ps1`. O empacotador da hospedagem inclui o ZIP e seu SHA-256 na pasta pública `downloads/`; a página inicial mostra automaticamente a versão e o tamanho do pacote.

## Como o processamento funciona

- O arquivo selecionado fica como um `File`/Blob do navegador. A prévia usa uma URL Blob.
- O FFmpeg é carregado somente ao analisar, a partir dos próprios arquivos hospedados.
- WORKERFS lê o MP4 conforme necessário, sem uma cópia integral de entrada na memória WebAssembly. Quando a montagem falha, o fallback para MEMFS fica limitado a 512 MiB; arquivos maiores recebem uma mensagem orientando usar um navegador compatível ou dividir o arquivo, sem tentar uma cópia integral.
- FFprobe identifica duração, FPS e os índices reais das faixas de vídeo e áudio, ignorando imagem de capa.
- `silencedetect` analisa o volume da primeira faixa de áudio. O planejador protege margens e arredonda os cortes para dentro do silêncio, em limites de quadros.
- O conversor pode trabalhar diretamente sobre o vídeo original ou sobre a sequência sem pausas. Os presets geram 9:16, 1:1, 4:5 e 16:9 por recorte central, encaixe com bordas ou composição sobre fundo desfocado.
- A compressão opcional calcula uma taxa de vídeo a partir da duração e do limite informado, usa áudio AAC de 128 kbps e reserva margem para o contêiner. O valor é um máximo aproximado; conteúdo simples pode resultar em um arquivo menor.
- O tratamento de áudio é aplicado uma vez sobre a saída completa. O modo de normalização usa alvo de −16 LUFS; o modo de voz acrescenta passa-altas em 80 Hz, passa-baixas, redução espectral leve de ruído e a mesma normalização.
- Até 12 trechos por lote são recortados com filtros de áudio/vídeo juntos. O vídeo é H.264 CRF 23/preset ultrafast e os intermediários usam PCM; AAC é codificado uma única vez na montagem final.
- A saída é copiada para um Blob e os intermediários são apagados. A interface termina o worker para liberar a memória WebAssembly após a exportação.
- Cancelar termina o worker. Uma nova tentativa recria o processador. Relatório JSON e vídeo são baixados diretamente dos Blobs, sem upload.

## Conteúdo público e preparação do AdSense

O build gera HTML estático a partir de `scripts/site-content.mjs` e `scripts/site-pages.mjs`, com guias, FAQ, Sobre, Contato, Privacidade, Termos e sitemap. A configuração pública fica em `site.config.json`; ela não é copiada para a hospedagem. O preview serve `dist`, portanto execute `npm run dev` ou faça o build antes de chamar `scripts/serve.mjs` diretamente.

O endereço de publicação é `https://pausecut.homeforgelab.com/`. O ZIP `PauseCut-Hostinger-Subdominio.zip` instala os arquivos diretamente na raiz atribuída a esse subdomínio. `adsenseSiteDomain` mantém o cadastro de publicidade em `homeforgelab.com`.

Confirme nome do responsável e e-mail real antes de publicar. `node scripts/build.mjs --ready` impede gerar uma versão final sem essas informações. Um ID AdSense válido gera apenas meta tags e materiais de integração em `../artifacts/adsense-integration`. Nenhuma requisição de publicidade é ativada. Veja `../PREPARAR-ADSENSE.md` para verificação no domínio, ads.txt na raiz e CMP antes de anúncios.

## Limites de processamento

- Limite do app: 1 GiB (1.073.741.824 bytes), exibido como 1 GB, por arquivo. Isso não garante que todo vídeo até esse tamanho caiba na memória; duração, codec, resolução, quantidade de cortes e recursos do dispositivo também importam. Intermediários e saída ainda usam memória durante a exportação; a montagem evita a cópia integral da entrada, mas não torna toda a exportação um processo de memória constante.
- Padrão até 720p, com opções até 1080p e resolução original. O formato Original mantém a proporção e não amplia; os formatos sociais usam dimensões fixas de 720p ou 1080p e podem ampliar para preencher o quadro. Dimensões são pares, conforme exigido pelo encoder.
- Processamento WebAssembly é mais lento que FFmpeg nativo. Use preferencialmente um computador, mantenha a aba aberta e evite suspender o dispositivo.
- Um vídeo por sessão. Recarregar/fechar a aba perde a análise e o resultado não baixado. Nenhum arquivo é gravado no servidor.
- Detecção por volume, sem reconhecimento de palavras. Música, ruído e fala baixa afetam os cortes. Revise o resultado.
- Saída AAC estéreo 48 kHz/192 kbps, vídeo CFR com base na taxa média da entrada (fallback 30 fps). HDR, metadados especiais, legendas e faixas adicionais não são preservados.
- O modo paralelo precisa de `SharedArrayBuffer` e `crossOriginIsolated`. A prévia e o `.htaccess` configuram COOP `same-origin` e COEP `require-corp`. Se os recursos não estiverem disponíveis, o app usa o núcleo padrão com uma thread; se o carregamento do núcleo paralelo falhar, ele é encerrado e o padrão é carregado.
- O domínio precisa servir os arquivos JS/WASM e o worker de pthread corretamente e permitir Worker/WebAssembly nas políticas CSP, caso você tenha configurado alguma.

## Uso de CPU

**Usar todos** é o padrão: detecta `navigator.hardwareConcurrency` e atribui ao encoder essa quantidade de threads, sem o teto de oito. A interface mostra os processadores lógicos informados pelo navegador e a quantidade atribuída à exportação. O navegador pode informar menos processadores que o total real; a API não é uma leitura absoluta do hardware. Se não houver informação válida, o app indica essa ausência e usa uma estimativa de duas threads quando o modo paralelo está disponível.

**Equilibrado** escolhe até oito threads para o encoder, respeitando os núcleos informados pelo navegador. Deixa um núcleo lógico fora desse orçamento em computadores com mais de dois núcleos e limita a duas threads quando o navegador informa até 4 GB de memória. As opções manuais 2/4/8 são limitadas ao número de núcleos informado; Compatível força uma thread.

A decodificação usa até quatro threads e os filtros até duas, dentro do mesmo comando; os lotes continuam sequenciais para conter o uso de memória. O número mostrado é o orçamento do encoder, não a quantidade total de workers: o núcleo oficial pré-aloca seu pool de pthreads, muitos deles ociosos. `threaded-core.js` é um inicializador próprio sobre o núcleo inalterado; ele amplia e carrega o pool antes da execução síncrona quando o orçamento de threads exige mais que os 32 workers iniciais. Não são criadas várias instâncias independentes do processador para o mesmo vídeo.

O encoder usa `lookahead-threads=1` porque a pré-análise auxiliar do x264 do pacote apresentou erro de assinatura de função ao usar várias threads nessa etapa, em testes com 12 ou mais threads no encoder. A codificação de quadros mantém o orçamento completo. As verificações reais do WASM incluem exportação com 16/32 threads e sincronização com múltiplos cortes. Usar todos pode exigir mais memória e não garante ganho sobre uma contagem menor, especialmente em vídeos pequenos.

A análise de silêncio trabalha sobretudo com áudio e não deve ocupar todos os núcleos. A exportação de vídeo é a etapa que mais pode aproveitar paralelismo. Nenhum modo garante uso de 100% da CPU ou aceleração por GPU.

O isolamento também afeta recursos externos, como scripts e iframes de terceiros. Antes de ativar publicidade ou incorporar serviços externos, confira sua compatibilidade com esses headers. Se a integração exigir removê-los, o editor volta ao modo de uma thread; o pacote não usa um service worker para contornar as políticas do navegador.

## Verificação do WASM

Depois de gerar as fixtures pelo verificador C# da raiz:

```bash
node tests/wasm-check.mjs
node tests/wasm-check.mjs --mt
node tests/wasm-check.mjs --mt --cores=32
```

Esse teste executa o binário WebAssembly realmente distribuído, com um driver mínimo adaptado para Node, usando o mesmo `engine.js` e os mesmos filtros da produção. Verifica análise de pausas, exportação em vários lotes, timestamps deslocados, silêncio total, duração, sincronização A/V, codecs, decodificação e as três formas de enquadramento vertical em 720 × 1280. Não é um teste de interface nem substitui a conferência final de publicação no navegador.

Com `--mt`, usa os workers do núcleo paralelo por meio de uma adaptação da API de Worker para `worker_threads` no teste. Os assets distribuídos não são modificados. `tests/performance-check.mjs` compara os núcleos usando o MP4 sintético de `artifacts/performance/input.mp4`; os resultados incluem tempo de exportação e tempo de CPU do processo, sem incluir a inicialização do núcleo.

Para verificar o encoder com todas as threads de uma configuração simulada de 32 processadores, execute `node tests/performance-check.mjs --mt --all --cores=32`. É um teste de orçamento do motor, não uma comprovação de que a máquina de testes possui 32 processadores. Referência da detecção: [hardwareConcurrency](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency).

Referências: [FFmpeg.wasm API](https://ffmpegwasm.netlify.app/docs/api/ffmpeg/classes/ffmpeg/), [WORKERFS e uso](https://ffmpegwasm.netlify.app/docs/getting-started/usage/), [limites e desempenho](https://ffmpegwasm.netlify.app/docs/faq/).
