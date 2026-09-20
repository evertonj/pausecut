param(
    [string]$IdentityFile = 'deploy/msix/store-identity.json',
    [string]$MakeAppx,
    [string]$WinAppCli = 'artifacts/winappcli/bin/winapp.exe',
    [ValidateRange(0, 65535)]
    [int]$Revision = 1,
    [switch]$NoRestore
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskIdentityPath = if ([IO.Path]::IsPathRooted($IdentityFile)) { $IdentityFile } else { Join-Path $taskRoot $IdentityFile }

if (-not (Test-Path -LiteralPath $taskIdentityPath)) {
    throw "Identidade da Store ausente. Copie deploy/msix/store-identity.example.json para deploy/msix/store-identity.json e preencha os três valores exibidos pelo Partner Center."
}

$taskIdentity = Get-Content -LiteralPath $taskIdentityPath -Raw | ConvertFrom-Json
foreach ($taskField in @('identityName', 'publisher', 'publisherDisplayName')) {
    if ([string]::IsNullOrWhiteSpace([string]$taskIdentity.$taskField) -or [string]$taskIdentity.$taskField -like 'VALOR_*') {
        throw "Valor inválido em '$taskField' no arquivo de identidade da Store."
    }
}

if ([string]::IsNullOrWhiteSpace($MakeAppx)) {
    $taskSdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
    if (Test-Path -LiteralPath $taskSdkRoot) {
        $MakeAppx = Get-ChildItem -LiteralPath $taskSdkRoot -Filter makeappx.exe -Recurse -File |
            Where-Object { $_.FullName -match '\\x64\\makeappx\.exe$' } |
            Sort-Object FullName -Descending |
            Select-Object -ExpandProperty FullName -First 1
    }
}
$taskWinAppPath = if ([IO.Path]::IsPathRooted($WinAppCli)) { $WinAppCli } else { Join-Path $taskRoot $WinAppCli }
$taskUseWinAppCli = [string]::IsNullOrWhiteSpace($MakeAppx) -or -not (Test-Path -LiteralPath $MakeAppx)
if ($taskUseWinAppCli -and -not (Test-Path -LiteralPath $taskWinAppPath)) {
    throw 'Nenhum empacotador foi encontrado. Instale o Windows SDK e informe -MakeAppx, ou disponibilize a ferramenta oficial winapp.exe em artifacts/winappcli/bin.'
}

$taskProject = [xml](Get-Content -LiteralPath (Join-Path $taskRoot 'desktop/PauseCut.Desktop.csproj') -Raw)
$taskVersion = [string]$taskProject.Project.PropertyGroup.Version
if ($taskVersion -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') { throw 'A versão do aplicativo desktop é inválida.' }
if (($taskVersion.Split('.')).Count -eq 3) { $taskVersion += ".$Revision" }

$taskArtifacts = Join-Path $taskRoot 'artifacts'
$taskStage = Join-Path $taskArtifacts ('msix-' + [Guid]::NewGuid().ToString('N'))
$taskOutput = Join-Path $taskArtifacts "PauseCut-$taskVersion-Windows-x64.msix"
$taskAssets = Join-Path $taskStage 'Assets'
$taskTools = Join-Path $taskStage 'tools/bin'
$taskLicenses = Join-Path $taskStage 'licenses'

function ConvertTo-XmlAttribute([string]$Value) {
    return [Security.SecurityElement]::Escape($Value)
}

function New-PauseCutAsset([string]$Path, [int]$Width, [int]$Height, [switch]$Wordmark) {
    Add-Type -AssemblyName System.Drawing
    $taskBitmap = [Drawing.Bitmap]::new($Width, $Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $taskGraphics = [Drawing.Graphics]::FromImage($taskBitmap)
    try {
        $taskGraphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $taskGraphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $taskGraphics.Clear([Drawing.Color]::FromArgb(255, 17, 18, 22))

        $taskScale = [Math]::Min($Width, $Height)
        $taskBarWidth = [Math]::Max(2, [int]($taskScale * 0.13))
        $taskBarHeight = [Math]::Max(6, [int]($taskScale * 0.52))
        $taskGap = [Math]::Max(2, [int]($taskScale * 0.09))
        $taskMarkWidth = ($taskBarWidth * 2) + $taskGap
        $taskMarkX = if ($Wordmark) { [int]($Width * 0.12) } else { [int](($Width - $taskMarkWidth) / 2) }
        $taskMarkY = [int](($Height - $taskBarHeight) / 2)
        $taskBrush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255, 182, 160, 255))
        try {
            $taskGraphics.FillRectangle($taskBrush, $taskMarkX, $taskMarkY, $taskBarWidth, $taskBarHeight)
            $taskGraphics.FillRectangle($taskBrush, $taskMarkX + $taskBarWidth + $taskGap, $taskMarkY, $taskBarWidth, $taskBarHeight)
        } finally { $taskBrush.Dispose() }

        if ($Wordmark) {
            $taskFontSize = [Math]::Max(12, [single]($Height * 0.23))
            $taskFont = [Drawing.Font]::new('Segoe UI', $taskFontSize, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
            $taskTextBrush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255, 238, 238, 242))
            try {
                $taskTextX = $taskMarkX + $taskMarkWidth + [int]($Height * 0.12)
                $taskTextY = [int](($Height - $taskFont.GetHeight($taskGraphics)) / 2)
                $taskGraphics.DrawString('PauseCut', $taskFont, $taskTextBrush, $taskTextX, $taskTextY)
            } finally {
                $taskTextBrush.Dispose()
                $taskFont.Dispose()
            }
        }
        $taskBitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $taskGraphics.Dispose()
        $taskBitmap.Dispose()
    }
}

New-Item -ItemType Directory -Path $taskStage, $taskAssets, $taskTools, $taskLicenses -Force | Out-Null
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

    foreach ($taskRequired in @('tools/bin/ffmpeg.exe', 'tools/bin/ffprobe.exe', 'tools/LICENSE')) {
        if (-not (Test-Path -LiteralPath $taskRequired)) { throw "Dependência ausente: $taskRequired" }
    }
    Copy-Item -LiteralPath 'tools/bin/ffmpeg.exe', 'tools/bin/ffprobe.exe' -Destination $taskTools
    Copy-Item -LiteralPath 'tools/LICENSE' -Destination (Join-Path $taskLicenses 'FFmpeg-GPLv3.txt')
    Copy-Item -LiteralPath 'THIRD-PARTY-NOTICES.txt', 'desktop/LEIA-ME.txt' -Destination $taskStage

    New-PauseCutAsset (Join-Path $taskAssets 'StoreLogo.png') 50 50
    New-PauseCutAsset (Join-Path $taskAssets 'Square44x44Logo.png') 44 44
    New-PauseCutAsset (Join-Path $taskAssets 'Square150x150Logo.png') 150 150
    New-PauseCutAsset (Join-Path $taskAssets 'Wide310x150Logo.png') 310 150 -Wordmark

    $taskManifest = Get-Content -LiteralPath 'deploy/msix/AppxManifest.xml.in' -Raw
    $taskManifest = $taskManifest.Replace('@@IDENTITY_NAME@@', (ConvertTo-XmlAttribute ([string]$taskIdentity.identityName)))
    $taskManifest = $taskManifest.Replace('@@PUBLISHER@@', (ConvertTo-XmlAttribute ([string]$taskIdentity.publisher)))
    $taskManifest = $taskManifest.Replace('@@PUBLISHER_DISPLAY_NAME@@', (ConvertTo-XmlAttribute ([string]$taskIdentity.publisherDisplayName)))
    $taskManifest = $taskManifest.Replace('@@VERSION@@', $taskVersion)
    [IO.File]::WriteAllText((Join-Path $taskStage 'AppxManifest.xml'), $taskManifest, [Text.UTF8Encoding]::new($false))

    [xml](Get-Content -LiteralPath (Join-Path $taskStage 'AppxManifest.xml') -Raw) | Out-Null
    if (Test-Path -LiteralPath $taskOutput) { Remove-Item -LiteralPath $taskOutput -Force }
    if ($taskUseWinAppCli) {
        $env:WINAPP_CLI_TELEMETRY_OPTOUT = '1'
        & $taskWinAppPath tool makeappx pack /d $taskStage /p $taskOutput /o
    } else {
        & $MakeAppx pack /d $taskStage /p $taskOutput /o
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $taskOutput)) { throw 'A criação do MSIX falhou.' }

    $taskHash = (Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText(($taskOutput + '.sha256'), "$taskHash  $([IO.Path]::GetFileName($taskOutput))`n", [Text.Encoding]::ASCII)
    Get-Item -LiteralPath $taskOutput | Select-Object FullName, Length
    Write-Host "MSIX da Microsoft Store gerado. SHA-256: $taskHash"
    Write-Host 'O Partner Center substituirá a assinatura depois que o pacote passar pela certificação.'
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $taskStage) { Remove-Item -LiteralPath $taskStage -Recurse -Force }
}
