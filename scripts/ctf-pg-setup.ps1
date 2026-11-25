# Portable PostgreSQL setup for local CTF Intelligence development.
#
# Downloads the zonky embedded PostgreSQL binaries (small, fast mirror) and
# extracts them into a tools directory outside the repo so Next.js never traces
# them into a build. No Administrator rights required.
#
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File scripts\ctf-pg-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\ctf-pg-setup.ps1 -ToolsDir D:\ctf-tools
#
# Default location: %LOCALAPPDATA%\ctf-intelligence\tools

param(
  [string]$ToolsDir = (Join-Path $env:LOCALAPPDATA "ctf-intelligence\tools")
)

$ErrorActionPreference = "Stop"

$url = "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/16.4.0/embedded-postgres-binaries-windows-amd64-16.4.0.jar"
$jar = Join-Path $ToolsDir "pg.jar"
$stage = Join-Path $ToolsDir "pg-stage"
$target = Join-Path $ToolsDir "pgsql"

New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

if (Test-Path (Join-Path $target "bin\pg_ctl.exe")) {
  Write-Host "PostgreSQL portable sudah ada di $target"
  exit 0
}

if (-not (Test-Path $jar)) {
  Write-Host "Mengunduh PostgreSQL portable dari mirror Maven (~21 MB)…"
  Invoke-WebRequest -Uri $url -OutFile $jar -UseBasicParsing
}

Write-Host "Mengekstrak arsip…"
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null

# The jar is a ZIP archive containing postgres-windows-x86_64.txz.
& tar.exe -xf $jar -C $stage
if ($LASTEXITCODE -ne 0) { throw "Ekstraksi jar gagal (tar.exe)." }

$txz = Get-ChildItem -Path $stage -Filter "*.txz" -Recurse | Select-Object -First 1
if (-not $txz) { throw "Tidak menemukan berkas .txz di dalam jar PostgreSQL." }

Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $target | Out-Null

# Windows 10+ ships bsdtar as tar.exe, which understands .txz.
& tar.exe -xf $txz.FullName -C $target
if ($LASTEXITCODE -ne 0) { throw "Ekstraksi .txz gagal (tar.exe)." }

if (-not (Test-Path (Join-Path $target "bin\pg_ctl.exe"))) {
  $nested = Get-ChildItem -Path $target -Recurse -Directory | Where-Object {
    Test-Path (Join-Path $_.FullName "bin\pg_ctl.exe")
  } | Select-Object -First 1
  if (-not $nested) { throw "Struktur arsip PostgreSQL tidak dikenali." }
  $flatten = Join-Path $ToolsDir "pg-flatten"
  Remove-Item $flatten -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item $nested.FullName $flatten -Force
  Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
  Move-Item $flatten $target -Force
}

Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Selesai. Jalankan: npm run ctf:pg:start"
