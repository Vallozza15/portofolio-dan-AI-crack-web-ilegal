<#
  Starts the optional Python/FastAPI artifact-analysis sidecar on port 3131.
  It uses a Python installation that actually has fastapi/uvicorn installed.
#>
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo

$RunDir = Join-Path $env:LOCALAPPDATA "ctf-intelligence\run"
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

$candidates = @(
  (Join-Path $env:LOCALAPPDATA "Python\bin\python.exe"),
  (Join-Path $env:LOCALAPPDATA "Python\pythoncore-3.14-64\python.exe"),
  "python"
)
$python = $null
foreach ($candidate in $candidates) {
  if (-not $candidate) { continue }
  try {
    $probe = & $candidate -c "import fastapi, uvicorn" 2>&1
    if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
  } catch { }
}
if (-not $python) {
  Write-Host "   PERINGATAN: Python dengan fastapi/uvicorn tidak ditemukan; sidecar dilewati." -ForegroundColor Yellow
  exit 0
}

$listener = Get-NetTCPConnection -LocalPort 3131 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Host "   Python backend sudah berjalan di 3131." -ForegroundColor Green
  exit 0
}

$out = Join-Path $RunDir "python-backend.log"
$err = Join-Path $RunDir "python-backend.err.log"
$p = Start-Process -FilePath $python `
  -ArgumentList @("-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "3131") `
  -WorkingDirectory $Repo -RedirectStandardOutput $out -RedirectStandardError $err `
  -WindowStyle Hidden -PassThru
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3131/health" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      $p.Id | Set-Content (Join-Path $RunDir "python-backend.pid")
      Write-Host "   Python backend siap di 3131." -ForegroundColor Green
      exit 0
    }
  } catch { }
}
Write-Host "   PERINGATAN: Python backend belum merespons. Lihat $err" -ForegroundColor Yellow
