param([switch]$NoRestore)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskArtifactsRoot = Join-Path $taskProjectRoot 'artifacts'
$taskStage = Join-Path $taskArtifactsRoot ('package-' + [Guid]::NewGuid().ToString('N'))
$taskApp = Join-Path $taskStage 'app'
$taskZip = Join-Path $taskArtifactsRoot 'PauseCut-Hostinger-VPS.zip'
New-Item -ItemType Directory -Path $taskApp -Force | Out-Null
Push-Location $taskProjectRoot
try {
    $taskPublishArgs = @('publish', 'PauseCut.csproj', '-c', 'Release', '-o', $taskApp, '-p:UseAppHost=false')
    if ($NoRestore) { $taskPublishArgs += '--no-restore' }
    else { $taskPublishArgs += @('--configfile', 'NuGet.Config') }
    & dotnet @taskPublishArgs
    if ($LASTEXITCODE -ne 0) { throw 'A publicação .NET falhou.' }
    New-Item -ItemType Directory -Path (Join-Path $taskStage 'deploy') | Out-Null
    Copy-Item -LiteralPath 'deploy/Dockerfile.published' -Destination (Join-Path $taskStage 'Dockerfile')
    Copy-Item -LiteralPath 'deploy/Caddyfile' -Destination (Join-Path $taskStage 'deploy/Caddyfile')
    foreach ($taskName in @('compose.yaml', '.env.example', 'PUBLICAR-HOSTINGER.md')) {
        Copy-Item -LiteralPath $taskName -Destination (Join-Path $taskStage $taskName)
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    # Include dotfiles explicitly; ZIP entry separators must work on Linux.
    $taskZipStream = [IO.File]::Open($taskZip, [IO.FileMode]::Create)
    $taskArchive = [IO.Compression.ZipArchive]::new($taskZipStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($taskFile in Get-ChildItem -LiteralPath $taskStage -Recurse -File -Force) {
            $taskRelative = $taskFile.FullName.Substring($taskStage.Length + 1).Replace('\', '/')
            if ($taskRelative -match '(^|/)(App_Data|exports|tools|tests|obj|bin|\.git)(/|$)' -or $taskRelative -eq '.env') {
                throw "Arquivo proibido no pacote: $taskRelative"
            }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, $taskFile.FullName, $taskRelative) | Out-Null
        }
    } finally { $taskArchive.Dispose(); $taskZipStream.Dispose() }
    $taskReadArchive = [IO.Compression.ZipFile]::OpenRead($taskZip)
    try {
        $taskRequired = @('app/PauseCut.dll', 'app/PauseCut.runtimeconfig.json', 'app/appsettings.Production.json', 'app/wwwroot/index.html', '.env.example', 'Dockerfile', 'compose.yaml', 'deploy/Caddyfile', 'PUBLICAR-HOSTINGER.md')
        foreach ($taskEntry in $taskRequired) {
            if (-not $taskReadArchive.GetEntry($taskEntry)) { throw "Arquivo ausente: $taskEntry" }
        }
        Write-Host "Pacote verificado: $($taskReadArchive.Entries.Count) arquivos."
    } finally { $taskReadArchive.Dispose() }
    Get-Item -LiteralPath $taskZip | Select-Object FullName, Length
} finally { Pop-Location }
