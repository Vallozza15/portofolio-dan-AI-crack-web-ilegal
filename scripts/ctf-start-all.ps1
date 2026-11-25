<#
  Starts the full CTF Intelligence local stack:
    1. Docker Desktop (for the sandbox)
    2. Portable PostgreSQL (port 5433)
    3. llama.cpp local AI server (port 8080)
    4. Python/FastAPI artifact backend (port 3131)
    5. Next.js production server with WebSocket terminal (port 3130)
    6. Cloudflare Quick Tunnel -> public HTTPS URL

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\ctf-start-all.ps1
    powershell -ExecutionPolicy Bypass -File scripts\ctf-start-all.ps1 -Port 3130 -NoTunnel
    powershell -ExecutionPolicy Bypass -File scripts\ctf-start-all.ps1 -Rebuild
#>
param(
  [int]$Port = 3130,
  [switch]$NoTunnel,
  [switch]$NoDocker,
  [switch]$Rebuild,
  [switch]$BuildKali
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo

$Tools = Join-Path $env:LOCALAPPDATA "ctf-intelligence\tools"
$NodeDir = Join-Path $Tools "node"
$Node = Join-Path $NodeDir "node.exe"
$NpmCli = Join-Path $NodeDir "node_modules\npm\bin\npm-cli.js"
$TsxCli = Join-Path $Repo "node_modules\tsx\dist\cli.mjs"
$Cloudflared = Join-Path $Tools "cloudflared.exe"
$LlamaServer = Join-Path $Tools "llama\llama-server.exe"
$LlamaModel = Join-Path $Tools "models\qwen2.5-0.5b-instruct-q4_k_m.gguf"
$RunDir = Join-Path $Tools "run"
$DockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$KaliImage = "ctf-kali-remote:latest"

if (Test-Path $NodeDir) { $env:Path = "$NodeDir;$env:Path" }

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Port-Open([int]$p) {
  try {
    return (Test-NetConnection -ComputerName 127.0.0.1 -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue)
  } catch { return $false }
}

function Wait-Port([int]$p, [int]$Seconds) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Port-Open $p) { return $true }
    Start-Sleep -Seconds 1
  }
  return (Port-Open $p)
}

if (-not (Test-Path $Node)) {
  throw "Node.js portable tidak ditemukan di $Node. Jalankan setup ulang atau salin Node ke folder itu."
}

Write-Host "== 1/5 Docker ==" -ForegroundColor Cyan
if ($NoDocker) {
  Write-Host "   dilewati (-NoDocker)"
} else {
  $daemonUp = $false
  if (Test-Path $DockerExe) {
    # Native stderr can emit an ErrorRecord even with 2>$null; keep EAP
    # non-stopping around the probe so an offline daemon is only a warning.
    $probePreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $info = & $DockerExe info --format "{{.ServerVersion}}" 2>$null
    $ErrorActionPreference = $probePreference
    $daemonUp = [bool]($info -and $info.Trim())
  }
  if (-not $daemonUp) {
    $desktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $desktop) {
      Write-Host "   menjalankan Docker Desktop..."
      Start-Process -FilePath $desktop -WindowStyle Hidden
      for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 2
        $ErrorActionPreference = "Continue"
        $info = & $DockerExe info --format "{{.ServerVersion}}" 2>$null
        $ErrorActionPreference = $probePreference
        if ($info -and $info.Trim()) { $daemonUp = $true; break }
      }
    }
  }
  if ($daemonUp) {
    Write-Host "   Docker daemon siap." -ForegroundColor Green
    $ErrorActionPreference = "Continue"
    $kali = & $DockerExe image inspect $KaliImage --format "{{.Id}}" 2>$null
    $ErrorActionPreference = $probePreference
    if (-not $kali -and $BuildKali) {
      Write-Host "   membangun image Kali (bisa memakan waktu beberapa menit)..."
      & $DockerExe build -t $KaliImage docker/ctf-kali-remote
      if ($LASTEXITCODE -ne 0) { Write-Host "   PERINGATAN: build Kali gagal; terminal akan menolak dengan pesan jujur." -ForegroundColor Yellow }
      else { Write-Host "   image Kali siap." -ForegroundColor Green }
    } elseif (-not $kali) {
      Write-Host "   PERINGATAN: image $KaliImage belum ada. Jalankan: npm run ctf:kali:remote:build" -ForegroundColor Yellow
    } else {
      Write-Host "   image Kali terdeteksi." -ForegroundColor Green
    }
    $ErrorActionPreference = "Continue"
    $fixture = & $DockerExe image inspect "ctf-ssh-fixture:latest" --format "{{.Id}}" 2>$null
    $ErrorActionPreference = $probePreference
    if (-not $fixture) {
      Write-Host "   membangun image fixture SSH untuk acceptance..." -ForegroundColor Yellow
      & $DockerExe build -t ctf-ssh-fixture:latest docker/ctf-ssh-fixture
      if ($LASTEXITCODE -ne 0) { Write-Host "   PERINGATAN: build fixture gagal; jalankan npm run ctf:fixture:build" -ForegroundColor Yellow }
      else { Write-Host "   image fixture SSH siap." -ForegroundColor Green }
    }
  }
  else { Write-Host "   PERINGATAN: Docker tidak siap; sandbox akan menolak dengan pesan jujur." -ForegroundColor Yellow }
}

Write-Host "== 2/5 PostgreSQL ==" -ForegroundColor Cyan
if (Port-Open 5433) {
  Write-Host "   sudah berjalan di 5433." -ForegroundColor Green
} else {
  & $Node $TsxCli "scripts/ctf-pg-start.ts"
  if (-not (Wait-Port 5433 30)) { Write-Host "   PERINGATAN: PostgreSQL belum merespons di 5433." -ForegroundColor Yellow }
  else { Write-Host "   PostgreSQL siap." -ForegroundColor Green }
}

Write-Host "== 3/6 Local AI ==" -ForegroundColor Cyan
if (Port-Open 8080) {
  Write-Host "   sudah berjalan di 8080." -ForegroundColor Green
} elseif ((Test-Path $LlamaServer) -and (Test-Path $LlamaModel)) {
  $llamaLog = Join-Path $RunDir "llama.log"
  $llamaErr = Join-Path $RunDir "llama.err.log"
  Start-Process -FilePath $LlamaServer `
    -ArgumentList @("-m", "`"$LlamaModel`"", "--host", "127.0.0.1", "--port", "8080", "-c", "4096", "-t", "4") `
    -RedirectStandardOutput $llamaLog -RedirectStandardError $llamaErr -WindowStyle Hidden
  if (Wait-Port 8080 60) { Write-Host "   llama.cpp siap di 8080." -ForegroundColor Green }
  else { Write-Host "   PERINGATAN: llama.cpp belum merespons; AI akan fallback ke Local Analyst." -ForegroundColor Yellow }
} else {
  Write-Host "   PERINGATAN: llama.cpp/model tidak ditemukan; AI akan fallback ke Local Analyst." -ForegroundColor Yellow
}

Write-Host "== 4/6 Python backend ==" -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "ctf-py-start.ps1")

Write-Host "== 5/6 Next.js ==" -ForegroundColor Cyan
$env:CTF_TERMINAL_IMAGE = $KaliImage
$env:PORT = "$Port"
if ($Rebuild -or -not (Test-Path ".next\BUILD_ID")) {
  Write-Host "   membangun produksi..."
  & $Node $NpmCli run build *> (Join-Path $RunDir "build.log")
  if ($LASTEXITCODE -ne 0) { throw "Build gagal. Lihat $RunDir\build.log" }
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "   port $Port sudah dipakai; server dianggap berjalan."
  $serverPid = $existing[0].OwningProcess
} else {
  $serverLog = Join-Path $RunDir "server.log"
  $serverErr = Join-Path $RunDir "server.err.log"
  $p = Start-Process -FilePath $Node `
    -ArgumentList @("`"$NpmCli`"", "run", "start", "--", "--port", "$Port") `
    -WorkingDirectory $Repo -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr `
    -WindowStyle Hidden -PassThru
  if (Wait-Port $Port 60) {
    # The npm wrapper exits after spawning Next; record the real listener PID.
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    $serverPid = if ($listener) { $listener.OwningProcess } else { $p.Id }
    Write-Host "   Next.js siap di http://127.0.0.1:$Port" -ForegroundColor Green
  }
  else { throw "Next.js tidak merespons. Lihat $serverLog" }
}
$serverPid | Set-Content (Join-Path $RunDir "server.pid")

Write-Host "== 6/6 Public tunnel ==" -ForegroundColor Cyan
if ($NoTunnel) {
  Write-Host "   dilewati (-NoTunnel)"
  # Jangan tampilkan URL tunnel lama jika sesi ini sengaja lokal saja.
  $staleUrl = Join-Path $RunDir "public-url.txt"
  if (Test-Path $staleUrl) { Remove-Item $staleUrl -Force -ErrorAction SilentlyContinue }
} elseif (-not (Test-Path $Cloudflared)) {
  Write-Host "   PERINGATAN: cloudflared tidak ditemukan; hanya akses lokal." -ForegroundColor Yellow
} else {
  $tunnelLog = Join-Path $RunDir "tunnel.log"
  $tunnelErr = Join-Path $RunDir "tunnel.err.log"
  if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }
  if (Test-Path $tunnelErr) { Remove-Item $tunnelErr -Force -ErrorAction SilentlyContinue }
  $t = Start-Process -FilePath $Cloudflared `
    -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$Port", "--no-autoupdate") `
    -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr `
    -WindowStyle Hidden -PassThru
  $t.Id | Set-Content (Join-Path $RunDir "tunnel.pid")

  $url = $null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $content = ""
    if (Test-Path $tunnelLog) { $content += (Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $tunnelErr) { $content += (Get-Content $tunnelErr -Raw -ErrorAction SilentlyContinue) }
    if ($content) {
      $m = [regex]::Match($content, "https://[a-z0-9-]+\.trycloudflare\.com")
      if ($m.Success) { $url = $m.Value; break }
    }
  }
  if ($url) {
    $url | Set-Content (Join-Path $RunDir "public-url.txt")
    Write-Host ""
    Write-Host "   URL publik: $url" -ForegroundColor Green
  } else {
    Write-Host "   PERINGATAN: URL tunnel belum muncul. Cek $tunnelLog" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Selesai." -ForegroundColor Cyan
Write-Host "  Lokal  : http://127.0.0.1:$Port/ctf"
$pub = Join-Path $RunDir "public-url.txt"
if (Test-Path $pub) {
  $u = (Get-Content $pub -Raw).Trim()
  Write-Host "  Online : $u/ctf"
}
Write-Host "  Log    : $RunDir"
Write-Host "  Stop   : powershell -ExecutionPolicy Bypass -File scripts\ctf-stop-all.ps1"
