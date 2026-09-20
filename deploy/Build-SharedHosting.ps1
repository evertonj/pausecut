param([string]$NodePath = 'node', [switch]$Ready)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
    if ($Ready) { & $NodePath browser-app/scripts/build.mjs --ready }
    else { & $NodePath browser-app/scripts/build.mjs }
    if ($LASTEXITCODE -ne 0) { throw 'O build estático falhou.' }
    $taskArtifacts = Join-Path $taskRoot 'artifacts'
    New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
    $taskZip = Join-Path $taskArtifacts 'PauseCut-Hostinger-Subdominio.zip'
    $taskDist = Join-Path $taskRoot 'browser-app/dist'
    $taskDesktopZip = Join-Path $taskArtifacts 'PauseCut-Setup-Windows-x64.exe'
    $taskDesktopHash = $taskDesktopZip + '.sha256'
    if (-not (Test-Path -LiteralPath $taskDesktopZip) -or -not (Test-Path -LiteralPath $taskDesktopHash)) {
        throw 'Instalador desktop ausente. Execute deploy/Build-Desktop.ps1 antes de montar o site.'
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $taskZipStream = [IO.File]::Open($taskZip, [IO.FileMode]::Create)
    $taskArchive = [IO.Compression.ZipArchive]::new($taskZipStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($taskFile in Get-ChildItem -LiteralPath $taskDist -Recurse -File -Force) {
            $taskRelative = $taskFile.FullName.Substring($taskDist.Length+1).Replace('\','/')
            if ($taskRelative -match '(^|/)(App_Data|exports|tests|tools|node_modules)(/|$)' -or $taskRelative -eq '.env') { throw "Arquivo proibido: $taskRelative" }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,$taskFile.FullName,$taskRelative) | Out-Null
        }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,$taskDesktopZip,'downloads/PauseCut-Setup-Windows-x64.exe',[IO.Compression.CompressionLevel]::NoCompression) | Out-Null
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,$taskDesktopHash,'downloads/PauseCut-Setup-Windows-x64.exe.sha256') | Out-Null
    } finally { $taskArchive.Dispose(); $taskZipStream.Dispose() }
    $taskRead = [IO.Compression.ZipFile]::OpenRead($taskZip)
    try {
        foreach ($taskRequired in @('index.html','.htaccess','robots.txt','app.js','engine.js','performance.js','threaded-core.js','vendor/core/ffmpeg-core.wasm','vendor/core-mt/ffmpeg-core.wasm','vendor/core-mt/ffmpeg-core.worker.js','vendor/ffmpeg/worker.js','guias.html','privacidade.html','contato.html','termos.html','sitemap.xml','downloads/PauseCut-Setup-Windows-x64.exe','downloads/PauseCut-Setup-Windows-x64.exe.sha256')) {
            if (-not $taskRead.GetEntry($taskRequired)) { throw "Arquivo ausente: $taskRequired" }
        }
        if ($taskRead.GetEntry('pausecut/index.html')) { throw 'O pacote do subdomínio não pode ter uma pasta pausecut extra.' }
        Write-Host "ZIP verificado: $($taskRead.Entries.Count) arquivos."
    } finally { $taskRead.Dispose() }
    Get-Item -LiteralPath $taskZip | Select-Object FullName,Length
} finally { Pop-Location }
