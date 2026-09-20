param([switch]$NoRestore)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskArtifacts = Join-Path $taskRoot 'artifacts'
$taskStage = Join-Path $taskArtifacts ('desktop-' + [Guid]::NewGuid().ToString('N'))
$taskZip = Join-Path $taskArtifacts 'PauseCut-Desktop-Windows-x64.zip'
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
        foreach ($taskRequired in @('PauseCut.exe', 'PauseCut.Desktop.exe', 'wwwroot/index.html', 'tools/bin/ffmpeg.exe', 'tools/bin/ffprobe.exe', 'LEIA-ME.txt')) {
            if (-not $taskRead.GetEntry($taskRequired)) { throw "Arquivo ausente no pacote desktop: $taskRequired" }
        }
        Write-Host "Pacote desktop verificado: $($taskRead.Entries.Count) arquivos."
    } finally { $taskRead.Dispose() }

    $taskHash = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
    # Use LF so the published checksum works with sha256sum on Linux hosts too.
    [IO.File]::WriteAllText(($taskZip + '.sha256'), "$taskHash  PauseCut-Desktop-Windows-x64.zip`n", [Text.Encoding]::ASCII)
    Get-Item -LiteralPath $taskZip | Select-Object FullName, Length
    Write-Host "SHA-256: $taskHash"
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $taskStage) { Remove-Item -LiteralPath $taskStage -Recurse -Force }
}
