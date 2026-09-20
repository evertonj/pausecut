# Publicar PauseCut na Hostinger

Esta versão mantém o backend em C# / ASP.NET Core e processa vídeos com FFmpeg **no servidor**. O pacote é para **VPS Linux com Docker**, não para a pasta `public_html` de hospedagem compartilhada ou WordPress. A própria [Hostinger orienta usar VPS para ASP.NET Core](https://support.hostinger.com/en/articles/1583610-is-asp-and-asp-net-supported-at-hostinger).

## Conteúdo do pacote

`artifacts/PauseCut-Hostinger-VPS.zip` contém:

- `app/`: aplicação compilada em Release, com HTML/CSS/JS e configurações de produção.
- `Dockerfile`: runtime .NET 8, FFmpeg e FFprobe para Linux. A compilação C# já está no pacote.
- `compose.yaml`: aplicação, proxy HTTPS Caddy e volumes.
- `deploy/Caddyfile`: HTTPS automático, acesso por usuário/senha e uploads de até 2 GiB.
- `.env.example`: configuração do domínio e do acesso.

Vídeos pessoais, temporários, executáveis Windows, código de testes e senhas **não** entram no pacote.

## 1. Preparar o VPS e o subdomínio

Use um VPS Linux com Docker e o plugin Docker Compose disponíveis. O [template Docker da Hostinger](https://support.hostinger.com/en/articles/8306612-how-to-use-the-docker-vps-template) é uma opção para um VPS novo. Não reinstale o sistema de um VPS que já contenha seu site só para instalar o template.

É mais simples usar um subdomínio próprio, por exemplo `video.seudominio.com.br`, mantendo o site principal onde já está. Crie um registro DNS **A** desse subdomínio apontando para o IPv4 do VPS. Se existir registro AAAA, ele deve apontar ao IPv6 correto do mesmo VPS ou ser removido. O domínio precisa resolver para o VPS antes da emissão do certificado.

As portas TCP 80 e 443 devem estar disponíveis e liberadas no firewall. O Compose usa essas portas para Caddy; se o VPS já tiver Nginx, Apache ou outro proxy nelas, adapte o proxy existente em vez de iniciar este Caddy em conflito. A aplicação foi preparada para rodar na raiz do subdomínio, não em uma subpasta como `/pausecut`.

## 2. Enviar e extrair o ZIP

Envie o ZIP por SFTP (por exemplo, FileZilla) para uma pasta do VPS como `/opt/pausecut`. No terminal SSH do VPS:

```bash
mkdir -p /opt/pausecut
cd /opt/pausecut
unzip PauseCut-Hostinger-VPS.zip
cp .env.example .env
```

Se `unzip` não estiver instalado, instale-o pelo gerenciador de pacotes do sistema.

## 3. Configurar domínio e senha

Gere o hash da senha com o comando abaixo. Ele pede a senha de forma interativa; a senha não precisa aparecer no histórico do shell:

```bash
docker run --rm -it caddy:2 caddy hash-password
```

Edite `.env`:

```bash
nano .env
```

Preencha seu domínio e usuário e cole o hash bcrypt gerado. **Mantenha as aspas simples ao redor do hash**, pois ele contém `$`:

```dotenv
PAUSECUT_DOMAIN=video.seudominio.com.br
PAUSECUT_USER=editor
PAUSECUT_PASSWORD_HASH='COLE_O_HASH_BCRYPT_GERADO'
```

Não use a senha em texto puro nesse campo. Não compartilhe nem publique o arquivo `.env`.

O proxy protege toda a interface e os endpoints de vídeo. Esta versão é uma ferramenta privada com um acesso compartilhado; não é um serviço com contas individuais e arquivos isolados por usuário.

## 4. Iniciar

Ainda em `/opt/pausecut`:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 pausecut caddy
```

A primeira execução baixa as imagens e instala FFmpeg no container. Quando o serviço estiver saudável, acesse:

```text
https://video.seudominio.com.br
```

O navegador pedirá o usuário e a senha que você configurou. Carregue um MP4 pequeno, analise e exporte para verificar o processamento no VPS. A interface deve mostrar **PROCESSAMENTO NO SERVIDOR**.

O [Docker Manager da Hostinger](https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/) também permite acompanhar containers. Para este pacote, o terminal na pasta extraída é o caminho mais direto, pois o Compose precisa do `Dockerfile`, de `app/`, de `.env` e de `deploy/Caddyfile`; colar somente o YAML no painel não envia esses arquivos.

## Uso e operação

- A saída continua sendo MP4 H.264/AAC, com os mesmos parâmetros de corte.
- Um vídeo é processado por vez. CPU, memória e disco do VPS determinam a velocidade; os lotes intermediários consomem disco. Não execute múltiplas réplicas usando o mesmo volume de vídeos.
- O app está acessível somente dentro da rede Docker; apenas o proxy publica portas. Os headers de HTTPS são confiados somente ao IP interno configurado para Caddy.
- A rede interna usa `172.31.248.0/24`. Se conflitar com outra rede do VPS, altere o subnet, os IPs dos dois containers e `Deployment__TrustedProxy` juntos.
- Upload limitado a 2 GiB no app e no Caddy. Para mudar, ajuste `Video__MaxUploadBytes` em `compose.yaml` e `max_size` em `deploy/Caddyfile`. Proxies/CDNs adicionais podem impor limites menores.
- Os arquivos são temporários: expiram após 24 h, com limpeza a cada 10 min. **Reiniciar/atualizar o app limpa os trabalhos e arquivos da execução anterior**, mesmo com o volume Docker. Baixe os resultados antes de reiniciar. O volume preserva os arquivos apenas durante recriações até a limpeza de inicialização; ele não oferece recuperação de tarefas.
- A senha protege todos os arquivos, mas qualquer pessoa com esse mesmo acesso vê a mesma lista de vídeos. Para oferecer acesso a clientes distintos, é necessária uma versão com contas e isolamento por usuário.

Comandos úteis:

```bash
docker compose logs --tail=100 -f pausecut
docker compose stop
docker compose start
```

Para atualizar, aguarde o fim dos trabalhos, baixe os vídeos, substitua o conteúdo de `app/` pelo novo pacote e execute `docker compose up -d --build`. Preserve seu `.env` e as configurações do domínio.

## Gerar um novo pacote nesta máquina

Na pasta do código-fonte, com o SDK .NET 8 instalado:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/Build-Package.ps1
```

O script publica em Release, gera o ZIP e verifica a lista de arquivos permitidos. O ZIP contém assemblies .NET portáveis; o Docker fornece o runtime Linux e o FFmpeg. Ele não contém um runtime Windows.

## Hospedagem compartilhada

Se seu plano só oferece `public_html`/WordPress/PHP, este backend em C# não roda nesse espaço. É possível manter seu site principal nesse plano e apontar somente o subdomínio do editor para um VPS. Se quiser rodar sem VPS, precisaremos mudar a arquitetura (por exemplo, processamento no navegador), com limitações diferentes para tamanho e desempenho dos vídeos.

Referências: [Hostinger ASP.NET](https://support.hostinger.com/en/articles/1583610-is-asp-and-asp-net-supported-at-hostinger), [containers .NET 8](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-8/containers), [Caddy basic_auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth), [forwarded headers ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-8.0).
