param(
  [ValidateSet('all', 'chrome', 'edge', 'firefox', 'whale')]
  [string]$Target = 'all'
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DistDir = Join-Path $RootDir 'dist'
$BaseManifestPath = Join-Path $RootDir 'manifest.json'
$BaseManifestJson = Get-Content -Raw -Encoding UTF8 $BaseManifestPath
$BaseManifest = $BaseManifestJson | ConvertFrom-Json
$Version = $BaseManifest.version

if (-not (Test-Path $DistDir)) {
  New-Item -ItemType Directory -Path $DistDir | Out-Null
}

$Targets = if ($Target -eq 'all') { @('chrome', 'edge', 'firefox', 'whale') } else { @($Target) }

$RuntimeFiles = @()
foreach ($top in @('LICENSE', 'PRIVACY.md', 'README.md')) {
  $p = Join-Path $RootDir $top
  if (-not (Test-Path $p)) { throw "Missing runtime file: $top" }
  $RuntimeFiles += $top
}
foreach ($icon in @('icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png')) {
  $p = Join-Path $RootDir $icon
  if (-not (Test-Path $p)) { throw "Missing runtime icon: $icon" }
  $RuntimeFiles += $icon
}
$RuntimeFiles += 'data/koreaVariants.json'

$SrcRoot = Join-Path $RootDir 'src'
Get-ChildItem -Path $SrcRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($RootDir.Length + 1).Replace('\', '/')
  $RuntimeFiles += $rel
}

function Get-ManifestTextForTarget([string]$TargetName) {
  $obj = $BaseManifestJson | ConvertFrom-Json
  if ($TargetName -eq 'firefox') {
    $obj.background = [PSCustomObject]@{
      scripts = @(
        'src/shared/constants.js',
        'src/shared/storage.js',
        'src/background/serviceWorker.js'
      )
    }
    $gecko = [PSCustomObject]@{
      id = 'korea-finder@astraleud.github.io'
      strict_min_version = '109.0'
    }
    $obj | Add-Member -NotePropertyName 'browser_specific_settings' -NotePropertyValue ([PSCustomObject]@{ gecko = $gecko }) -Force
  }
  return ($obj | ConvertTo-Json -Depth 12) + "`n"
}

function New-ExtensionArchive([string]$OutPath, [string]$ManifestText) {
  if (Test-Path $OutPath) { Remove-Item -Force $OutPath }
  $zip = [System.IO.Compression.ZipFile]::Open($OutPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $mEntry = $zip.CreateEntry('manifest.json', [System.IO.Compression.CompressionLevel]::Optimal)
    $writer = New-Object System.IO.StreamWriter($mEntry.Open(), (New-Object System.Text.UTF8Encoding($false)))
    try {
      $writer.Write($ManifestText)
    } finally {
      $writer.Dispose()
    }

    foreach ($rel in $RuntimeFiles) {
      $abs = Join-Path $RootDir ($rel.Replace('/', '\'))
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $abs,
        $rel,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally {
    $zip.Dispose()
  }
}

$CreatedFiles = @()
foreach ($t in $Targets) {
  $manifestText = Get-ManifestTextForTarget $t
  $zipName = "korea-finder-v$Version-$t.zip"
  $zipPath = Join-Path $DistDir $zipName
  New-ExtensionArchive -OutPath $zipPath -ManifestText $manifestText
  $CreatedFiles += $zipName

  if ($t -eq 'firefox') {
    $xpiName = "korea-finder-v$Version-firefox.xpi"
    $xpiPath = Join-Path $DistDir $xpiName
    Copy-Item -Force $zipPath $xpiPath
    $CreatedFiles += $xpiName
  }
}

$SumLines = @()
foreach ($f in $CreatedFiles) {
  $full = Join-Path $DistDir $f
  $hash = (Get-FileHash -Path $full -Algorithm SHA256).Hash.ToLowerInvariant()
  $SumLines += "$hash  $f"
}
$SumPath = Join-Path $DistDir 'SHA256SUMS.txt'
[System.IO.File]::WriteAllText($SumPath, ($SumLines -join "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Packaged Korea Finder v${Version}:"
foreach ($f in $CreatedFiles) {
  $sizeKb = [math]::Round((Get-Item (Join-Path $DistDir $f)).Length / 1KB, 1)
  Write-Host "  - $f ($sizeKb KB)"
}
Write-Host "  - SHA256SUMS.txt"
