# Publicar o PauseCut no subdomínio da Hostinger

Use **`artifacts/PauseCut-Hostinger-Subdominio.zip`** para publicar em **https://pausecut.homeforgelab.com/**. Este pacote contém o editor diretamente na raiz, sem uma pasta `pausecut` adicional. Os ZIPs anteriores para subpasta ou VPS não são o pacote desta instalação.

O app processa vídeos no navegador. Seu plano hospeda a página e o motor de vídeo; não executa o backend C# e não recebe os MP4 selecionados pelos usuários.

## Criar o subdomínio e enviar os arquivos

1. No hPanel, crie **pausecut.homeforgelab.com**. A Hostinger permite adicioná-lo como um site independente no mesmo plano ou criá-lo em **Domínios → Subdomínios** do site principal. Para uma aplicação independente, a orientação da Hostinger é usar a primeira opção.
2. Abra o gerenciador de arquivos e identifique a **pasta raiz atribuída ao subdomínio**. Se ele foi criado como site independente, use o `public_html` desse novo site. Se foi criado como subdomínio do site principal, o painel pode indicar uma pasta como `public_html/pausecut`. Use a pasta exibida no painel, sem presumir que é a raiz do WordPress.
3. Envie **PauseCut-Hostinger-Subdominio.zip** e extraia **nessa pasta raiz do subdomínio**. `index.html`, `.htaccess`, `app.js` e a pasta `vendor` devem ficar diretamente nela. Não crie outra pasta `pausecut` dentro da raiz.
4. Confira se os arquivos `vendor/core/ffmpeg-core.wasm` e `vendor/ffmpeg/worker.js` foram extraídos completamente. São obrigatórios.
   O modo paralelo também precisa de `vendor/core-mt/ffmpeg-core.wasm`, `ffmpeg-core.js` e `ffmpeg-core.worker.js` nessa mesma pasta `core-mt`.
5. Confira o DNS do subdomínio e ative/aguarde o certificado SSL no painel. Se o DNS for gerenciado fora da Hostinger, siga os registros indicados para o novo site; não copie registros sem conferir o destino mostrado no painel.
6. Abra **https://pausecut.homeforgelab.com/**. Escolha um MP4 pequeno, analise, confira os cortes, exporte e baixe o resultado.

Não substitua os arquivos do WordPress em `homeforgelab.com`. O `.htaccess` do pacote pertence à raiz do editor. Não é necessário banco de dados, instalação de Node.js ou comando de inicialização no servidor.

Por FTP/SFTP, copie o conteúdo de `browser-app/dist` diretamente para a pasta raiz do subdomínio, incluindo `.htaccess` e `vendor`.

## Preparação para AdSense

O pacote inclui guias, Sobre, Contato, Privacidade e Termos. Veja **PREPARAR-ADSENSE.md** no repositório antes de conectar a conta.

Antes de solicitar análise, confirme nome do responsável e e-mail público funcional em `browser-app/site.config.json` e gere novamente o ZIP. O endereço já está configurado para o subdomínio. O ID do AdSense pode ser preenchido depois.

O cadastro no AdSense continua sendo de **homeforgelab.com**. A meta tag de identificação é incluída nas páginas do editor quando há ID válido; a verificação do domínio principal e a configuração de ads.txt continuam exigindo integração na raiz de `homeforgelab.com`. Os materiais gerados ficam localmente em `artifacts/adsense-integration` e não são publicados no subdomínio. Nenhum anúncio é carregado por esta versão.

## Uso e limites

- Comece em Equilibrado: pausas de pelo menos 180 ms abaixo de −35 dB, com margens de 40 ms.
- A detecção é por volume. Música e ruído podem esconder pausas; revise o resultado.
- A exportação padrão é até 720p, com opções até 1080p e original.
- Em Uso de CPU, **Usar todos** é o padrão e atribui ao encoder a quantidade de processadores lógicos informada pelo navegador. O texto abaixo mostra a quantidade detectada e o modo disponível. Há opções Equilibrado (até 8), 2/4/8 e Compatível. Mais threads também exigem mais memória e não garantem menor tempo em qualquer vídeo.
- Use preferencialmente um navegador atual em um computador e teste primeiro um vídeo pequeno.
- O limite de entrada é 1 GB (1.024 MB, ou 1.073.741.824 bytes). Memória, resolução, duração e quantidade de cortes podem impedir o processamento mesmo abaixo desse tamanho. Para arquivos grandes, é necessária a leitura por partes oferecida pelo navegador; se ela falhar, o app não tenta copiar o MP4 inteiro para a memória.
- Mantenha a aba aberta e baixe o resultado antes de fechar ou atualizar. O processamento não continua no servidor.
- Cada usuário processa apenas seus próprios arquivos locais. Não há lista compartilhada de vídeos no servidor.

## Atualizações e problemas de carregamento

O pacote inclui dois motores de aproximadamente 31 MB cada. Normalmente só o motor selecionado é carregado na primeira análise. Se o paralelo falhar, o app carrega o compatível. O navegador pode reaproveitar o cache nas visitas seguintes.

Para atualizar, substitua os arquivos apenas na raiz atribuída ao subdomínio. Se aparecer a versão antiga, faça uma atualização forçada no navegador.

- Confira se `https://pausecut.homeforgelab.com/vendor/core/ffmpeg-core.wasm` entrega o arquivo, sem erro 404 ou página de login.
- O `.htaccess` configura MIME para WASM e JavaScript. Se uma diretiva provocar erro 500, confira os logs ou peça ao suporte a configuração desses tipos MIME.
- Para o modo paralelo, a página precisa responder com `Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Embedder-Policy: require-corp`, configurados no `.htaccess` do pacote. Sem esses headers, o editor funciona com uma thread. Use HTTPS na hospedagem.
- Uma CSP personalizada precisa permitir módulos/Workers da própria origem e compilação WebAssembly, usando `wasm-unsafe-eval` onde suportado. Não desative toda a política.
- Se o editor estiver numa pasta do WordPress, confira se regras herdadas de manutenção, segurança ou redirecionamento não interceptam os arquivos. O site independente facilita manter essas configurações separadas.
- Confira a compatibilidade do isolamento com scripts e iframes de publicidade antes de ativar AdSense. Se uma integração exigir retirar COOP/COEP, o modo compatível continua disponível.

O pacote foi conferido localmente. A publicação só estará concluída após criar o subdomínio, enviar os arquivos e testar o endereço público.

Referência: [Como criar um subdomínio na Hostinger](https://www.hostinger.com/support/1583405-how-to-create-and-delete-subdomains-in-hostinger/).
