# PauseCut

Aplicação web local em **C# / ASP.NET Core .NET 8** para remover pausas de um MP4 antes da edição no CapCut ou em outro editor.

## Versão desktop para Windows

A versão desktop usa o **FFmpeg nativo de 64 bits**, testa automaticamente a aceleração de vídeo **NVIDIA NVENC, Intel Quick Sync e AMD AMF** e, quando não há GPU compatível, usa a CPU nativa com todos os processadores lógicos detectados. Ela é autocontida: o usuário não precisa instalar .NET nem FFmpeg, e o vídeo não sai do computador.

Para gerar o instalador e o pacote portátil:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/Build-Desktop.ps1
```

Os resultados são `artifacts/PauseCut-Setup-Windows-x64.exe` e `artifacts/PauseCut-Desktop-Windows-x64.zip`, ambos acompanhados por `.sha256`. O instalador cria o atalho do Menu Iniciar, oferece um atalho opcional na Área de Trabalho e registra a desinstalação por usuário. A janela dedicada usa Microsoft Edge ou Google Chrome; ao fechá-la, o motor local é encerrado. Temporários e logs ficam em `%LOCALAPPDATA%\PauseCut`.

O primeiro empacotamento usa `NuGet.Desktop.Config` para baixar do NuGet.org somente os pacotes oficiais do runtime .NET 8 para Windows x64. Os builds comuns continuam usando `NuGet.Config` sem fontes externas.

O instalador é compilado com Inno Setup 7. Instale o compilador oficial com `winget install --id JRSoftware.InnoSetup.7 -e -s winget` ou informe seu caminho em `-InnoCompiler`.

### Microsoft Store (MSIX)

Depois de reservar **PauseCut** no Partner Center, copie os três valores da página **Identidade do produto** para um arquivo local:

```powershell
Copy-Item deploy/msix/store-identity.example.json deploy/msix/store-identity.json
```

Preencha `identityName`, `publisher` e `publisherDisplayName` exatamente como exibidos no Partner Center. O arquivo real fica ignorado pelo Git. Com o Windows SDK instalado, gere o pacote x64 da Store. O script também aceita a ferramenta portátil oficial `winapp.exe` em `artifacts/winappcli/bin` como alternativa ao SDK completo:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/Build-MSIX.ps1
```

O resultado é `artifacts/PauseCut-1.1.0.0-Windows-x64.msix`, acompanhado do SHA-256. Para submissões MSIX, o Partner Center substitui a assinatura depois que o aplicativo passa pela certificação. O MSIX usa a identidade reservada, inclui os recursos visuais, os executáveis autocontidos e os avisos/licenças do FFmpeg.

O build do site detecta o instalador e mostra versão e tamanho na seção **Desktop**. `deploy/Build-SharedHosting.ps1` inclui o EXE e o checksum em `downloads/`, disponibilizando o botão de download em `https://pausecut.homeforgelab.com/`.

## Executar no Windows

O SDK .NET 8 e os executáveis FFmpeg/FFprobe são necessários. Nesta máquina, os executáveis já foram baixados para `tools/bin` e os caminhos estão em `appsettings.json`.

Abra `iniciar.cmd` ou execute, na pasta do projeto:

```powershell
dotnet run --project PauseCut.csproj
```

Abra **http://localhost:5080**. Carregue o MP4, escolha os ajustes, clique em **Analisar pausas**, confira os cortes e clique em **Exportar vídeo sem pausas**. Após a exportação, baixe o MP4. Para mudar os cortes, ajuste os parâmetros e analise novamente.

## Ajustes

| Ajuste | Inicial | Efeito |
| --- | --- | --- |
| Limite de silêncio | -35 dB | Volume abaixo desse limite é considerado silêncio. -45 dB preserva sons mais baixos; -25 dB remove sons mais altos. |
| Pausa mínima | 180 ms | Ignora pausas mais curtas. |
| Margem de fala | 40 ms | Preserva áudio em cada borda interna do silêncio. Se a pausa for menor que as margens, não há corte. |

Os presets Suave, Equilibrado e Ágil são pontos de partida. Reduzir o limite em dB ou aumentar a margem ajuda quando finais de palavras estão sendo removidos. Aumentar o limite ou reduzir a pausa mínima ajuda quando nenhuma pausa é encontrada.

## Como funciona

1. O servidor grava o upload diretamente em disco. No desktop e no uso local não há limite fixo de tamanho; espaço em disco, duração e formato continuam sendo limites práticos.
2. FFprobe verifica vídeo, áudio, duração e taxa de quadros.
3. FFmpeg `silencedetect` encontra intervalos abaixo do volume configurado na primeira faixa de áudio.
4. `Core/CutPlanner.cs` calcula em C# as partes preservadas e removidas, protege as margens e arredonda os cortes para dentro das pausas, respeitando os quadros.
5. `Services/MediaTools.cs` recorta áudio e vídeo juntos com `trim`, `atrim` e `concat`. Processa até 24 trechos por lote, para limitar o tamanho do grafo de filtros.
6. Os lotes têm vídeo H.264 e áudio PCM; a montagem final copia o vídeo e codifica o áudio uma única vez em AAC, evitando inserir padding AAC em cada pequeno corte. O MP4 recebe `faststart`.

O processamento ocorre em segundo plano, com fila, progresso e cancelamento. A interface permite ouvir os cortes no original, comparar a exportação e baixar um relatório JSON com os intervalos em segundos. Os cortes do relatório correspondem ao vídeo original.

## Precisão e limites

- A detecção trabalha em milissegundos, mas um vídeo de 30 fps tem quadros de aproximadamente 33 ms. Pausas menores que um quadro não oferecem um corte de vídeo confiável.
- É detecção por volume, sem reconhecimento de palavras. Música, ruído constante, respiração e voz baixa afetam o resultado. Confira antes de usar a exportação.
- O exportador preserva a resolução e normaliza a saída para taxa constante de quadros, baseada na média da entrada (fallback 30 fps para taxas inválidas ou fora de 1–120 fps).
- Saída H.264, CRF 18, pixel format yuv420p, AAC estéreo 48 kHz/192 kbps. Há recodificação de vídeo. HDR, múltiplas faixas, legendas, capítulos e metadados especiais não são preservados.
- Os temporários PCM podem consumir bastante disco. Há um processamento por vez, fila de até 8 tarefas, até 20 arquivos e limite de 10.000 trechos por análise.
- Os vídeos ficam em `App_Data/jobs`, fora da pasta pública. Os arquivos expiram após 24 h, com limpeza a cada 10 min. Reiniciar o servidor limpa os arquivos anteriores e a lista de tarefas. Baixe a exportação antes de fechar o servidor. A interface também oferece exclusão manual.
- Aplicação destinada ao uso local, sem contas de usuário. Antes de disponibilizar em rede pública, adicione autenticação, cotas de disco e isolamento dos trabalhos.

## FFmpeg em outra máquina

Baixe uma distribuição com **FFmpeg 5 ou superior, FFprobe e libx264** pelos links de Windows na [página oficial de download](https://ffmpeg.org/download.html). A pasta `tools` não entra no Git. Configure `Video:FfmpegPath` e `Video:FfprobePath` em `appsettings.json` com caminhos absolutos, ou com `ffmpeg` e `ffprobe` se estiverem no PATH. No Linux/macOS, use os respectivos executáveis.

Também é possível sobrescrever por variáveis de ambiente `Video__FfmpegPath` e `Video__FfprobePath`. `Video:MaxUploadBytes` igual a `0` remove o teto configurado; um valor positivo aplica esse limite em bytes. Em uma publicação remota, o proxy, CDN ou IIS ainda pode impor um limite próprio. O servidor padrão é Kestrel em localhost.

## Publicar na Hostinger

Para o plano gerenciado com `public_html`, use a **versão para navegador** em [browser-app](browser-app/README.md) e o pacote **`artifacts/PauseCut-Hostinger-Subdominio.zip`**, configurado para **https://pausecut.homeforgelab.com/**. Extraia diretamente na pasta raiz atribuída ao subdomínio. Veja [instruções para seu plano atual](PUBLICAR-HOSTINGER-COMPARTILHADA.md). O vídeo é processado localmente no navegador, sem backend nem upload.

Antes de gerar o pacote da Hostinger, execute `deploy/Build-Desktop.ps1`; o pacote do site inclui o instalador em `downloads/PauseCut-Setup-Windows-x64.exe`.

Se usar VPS, veja [PUBLICAR-HOSTINGER.md](PUBLICAR-HOSTINGER.md). O pacote `artifacts/PauseCut-Hostinger-VPS.zip` é a versão ASP.NET Release para VPS Linux com Docker, FFmpeg, HTTPS e senha. A hospedagem compartilhada comum não executa o backend ASP.NET. A configuração de produção usa FFmpeg pelo PATH; a configuração de desenvolvimento mantém os executáveis Windows locais.

## Verificação

Sem pacotes NuGet externos:

```powershell
dotnet build PauseCut.csproj
dotnet run --project tests/PauseCut.Checks.csproj -- tools/bin/ffmpeg.exe tools/bin/ffprobe.exe
```

O verificador testa o planejamento de cortes, margens, silêncio total e sobreposições. Com os caminhos dos executáveis, também gera vídeos sintéticos com pausas conhecidas, muitos cortes em vários lotes, taxa fracionária e timestamps deslocados, exporta e confere duração, alinhamento A/V e decodificação.

Referências: [filtros FFmpeg](https://ffmpeg.org/ffmpeg-filters.html) e [uploads no ASP.NET Core](https://learn.microsoft.com/aspnet/core/mvc/models/file-uploads?view=aspnetcore-8.0).
