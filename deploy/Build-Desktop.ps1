param([switch]$NoRestore, [string]$InnoCompiler)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskArtifacts = Join-Path $taskRoot 'artifacts'
$taskStage = Join-Path $taskArtifacts ('desktop-' + [Guid]::NewGuid().ToString('N'))
$taskZip = Join-Path $taskArtifacts 'PauseCut-Desktop-Windows-x64.zip'
$taskInstaller = Join-Path $taskArtifacts 'PauseCut-Setup-Windows-x64.exe'
$taskProject = [xml](Get-Content -LiteralPath (Join-Path $taskRoot 'desktop/PauseCut.Desktop.csproj') -Raw)
$taskVersion = [string]$taskProject.Project.PropertyGroup.Version
if ([string]::IsNullOrWhiteSpace($taskVersion)) { throw 'A versão do aplicativo desktop não foi definida.' }
if ([string]::IsNullOrWhiteSpace($InnoCompiler)) {
    $taskInnoCandidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 7/ISCC.exe'),
        'C:\Program Files\Inno Setup 7\ISCC.exe',
        'C:\Program Files (x86)\Inno Setup 7\ISCC.exe',
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
    )
    $InnoCompiler = $taskInnoCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($InnoCompiler) -or -not (Test-Path -LiteralPath $InnoCompiler)) {
    throw 'Inno Setup não encontrado. Instale com: winget install --id JRSoftware.InnoSetup.7 -e -s winget'
}
New-Item -ItemType Directory -Path $taskStage -Force | Out-Null
Push-Location $taskRoot
try {
    $taskCommon = @('-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', $taskStage, '-p:DebugType=None', '-p:DebugSymbols=false')
    $taskServerArgs = @('publish', 'PauseCut.csproj') + $taskCommon
    $taskDesktopArgs = @('publish', 'desktop/PauseCut.Desktop.csproj') + $taskCommon
    if ($NoRestore) {
        $taskServerArgs += '--no-restore'
        $taskDesktopArgs += '--no-restore'
    } else {
        $taskServerArgs += @('--configfile', 'NuGet.Desktop.Config')
        $taskDesktopArgs += @('--configfile', 'NuGet.Desktop.Config')
    }
    & dotnet @taskServerArgs
    if ($LASTEXITCODE -ne 0) { throw 'A publicação do motor local falhou.' }
    & dotnet @taskDesktopArgs
    if ($LASTEXITCODE -ne 0) { throw 'A publicação do inicializador desktop falhou.' }

    $taskTools = Join-Path $taskStage 'tools/bin'
    New-Item -ItemType Directory -Path $taskTools -Force | Out-Null
    Copy-Item -LiteralPath 'tools/bin/ffmpeg.exe' -Destination $taskTools
    Copy-Item -LiteralPath 'tools/bin/ffprobe.exe' -Destination $taskTools
    Copy-Item -LiteralPath 'desktop/LEIA-ME.txt' -Destination (Join-Path $taskStage 'LEIA-ME.txt')
    $taskLicenses = Join-Path $taskStage 'licenses'
    New-Item -ItemType Directory -Path $taskLicenses -Force | Out-Null
    Copy-Item -LiteralPath 'tools/LICENSE' -Destination (Join-Path $taskLicenses 'FFmpeg-GPLv3.txt')
    Copy-Item -LiteralPath 'THIRD-PARTY-NOTICES.txt' -Destination $taskStage

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $taskZipStream = [IO.File]::Open($taskZip, [IO.FileMode]::Create)
    $taskArchive = [IO.Compression.ZipArchive]::new($taskZipStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($taskFile in Get-ChildItem -LiteralPath $taskStage -Recurse -File) {
            $taskRelative = $taskFile.FullName.Substring($taskStage.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, $taskFile.FullName, $taskRelative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $taskArchive.Dispose()
        $taskZipStream.Dispose()
    }

    $taskRead = [IO.Compression.ZipFile]::OpenRead($taskZip)
    try {
        foreach ($taskRequired in @('PauseCut.exe', 'PauseCut.Desktop.exe', 'wwwroot/index.html', 'tools/bin/ffmpeg.exe', 'tools/bin/ffprobe.exe', 'LEIA-ME.txt', 'THIRD-PARTY-NOTICES.txt', 'licenses/FFmpeg-GPLv3.txt')) {
            if (-not $taskRead.GetEntry($taskRequired)) { throw "Arquivo ausente no pacote desktop: $taskRequired" }
        }
        Write-Host "Pacote desktop verificado: $($taskRead.Entries.Count) arquivos."
    } finally { $taskRead.Dispose() }

    $taskHash = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
    # Use LF so the published checksum works with sha256sum on Linux hosts too.
    [IO.File]::WriteAllText(($taskZip + '.sha256'), "$taskHash  PauseCut-Desktop-Windows-x64.zip`n", [Text.Encoding]::ASCII)
    Get-Item -LiteralPath $taskZip | Select-Object FullName, Length
    Write-Host "SHA-256: $taskHash"

    if (Test-Path -LiteralPath $taskInstaller) { Remove-Item -LiteralPath $taskInstaller -Force }
    & $InnoCompiler "--define=BuildDir=$taskStage" "--define=OutputDir=$taskArtifacts" "--define=AppVersion=$taskVersion" (Join-Path $taskRoot 'deploy/PauseCut.iss')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $taskInstaller)) { throw 'A compilação do instalador falhou.' }
    if ((Get-Item -LiteralPath $taskInstaller).Length -lt 50MB) { throw 'O instalador gerado parece incompleto.' }
    $taskInstallerHash = (Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($taskInstaller + '.sha256'), "$taskInstallerHash  PauseCut-Setup-Windows-x64.exe`n", [Text.Encoding]::ASCII)
    Get-Item -LiteralPath $taskInstaller | Select-Object FullName, Length
    Write-Host "SHA-256 do instalador: $taskInstallerHash"
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $taskStage) { Remove-Item -LiteralPath $taskStage -Recurse -Force }
}
