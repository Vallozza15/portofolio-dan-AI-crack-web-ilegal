# Local AI without any API key: llama.cpp server + a small GGUF model.
#
# Downloads the llama.cpp Windows CPU build and Qwen2.5 0.5B Instruct (Q4_K_M),
# then starts an OpenAI-compatible server on 127.0.0.1:8080.
#
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File scripts\ctf-ai-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\ctf-ai-setup.ps1 -Model qwen2.5-1.5b-instruct-q4_k_m.gguf
#
# After it is running, enable the OpenAI-compatible provider in AI Settings with:
#   Base URL: http://127.0.0.1:8080/v1
#   Model:    qwen2.5-0.5b-instruct-q4_k_m

param(
  [string]$ToolsDir = (Join-Path $env:LOCALAPPDATA "ctf-intelligence\tools"),
  [string]$Model = "qwen2.5-0.5b-instruct-q4_k_m.gguf",
  [int]$Port = 8080,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$llamaDir = Join-Path $ToolsDir "llama"
$modelsDir = Join-Path $ToolsDir "models"
$llamaZip = Join-Path $ToolsDir "llama.zip"
New-Item -ItemType Directory -Force -Path $llamaDir, $modelsDir | Out-Null

function Download($url, $out) {
  if (Test-Path $out) { return }
  Write-Host "Mengunduh $(Split-Path -Leaf $out)…"
  & curl.exe -L --retry 5 --retry-delay 2 -C - -o $out $url
  if ($LASTEXITCODE -ne 0) { throw "Unduhan gagal: $url" }
}

if (-not (Test-Path (Join-Path $llamaDir "llama-server.exe"))) {
  if (-not (Test-Path $llamaZip)) {
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest" -UseBasicParsing
    $asset = $rel.assets | Where-Object { $_.name -match "bin-win-cpu-x64\.zip$" } | Select-Object -First 1
    if (-not $asset) { throw "Aset llama.cpp win-cpu-x64 tidak ditemukan." }
    Download $asset.browser_download_url $llamaZip
  }
  Write-Host "Mengekstrak llama.cpp…"
  & tar.exe -xf $llamaZip -C $llamaDir
  if ($LASTEXITCODE -ne 0) { throw "Ekstraksi llama.cpp gagal." }
}

$modelFile = Join-Path $modelsDir $Model
if (-not (Test-Path $modelFile)) {
  $repo = switch -Wildcard ($Model) {
    "qwen2.5-1.5b*" { "Qwen/Qwen2.5-1.5B-Instruct-GGUF" }
    "qwen2.5-3b*"   { "Qwen/Qwen2.5-3B-Instruct-GGUF" }
    default         { "Qwen/Qwen2.5-0.5B-Instruct-GGUF" }
  }
  Download "https://huggingface.co/$repo/resolve/main/$Model" $modelFile
}

$server = Join-Path $llamaDir "llama-server.exe"
if (-not (Test-Path $server)) {
  $found = Get-ChildItem $llamaDir -Recurse -Filter "llama-server.exe" | Select-Object -First 1
  if (-not $found) { throw "llama-server.exe tidak ditemukan setelah ekstraksi." }
  $server = $found.FullName
}

Write-Host ""
Write-Host "Model : $modelFile"
Write-Host "Server: $server"

if ($NoStart) {
  Write-Host "Lewati start (-NoStart). Jalankan manual:"
  Write-Host "  `"$server`" -m `"$modelFile`" --host 127.0.0.1 --port $Port -c 4096"
  exit 0
}

$running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "Port $Port sudah dipakai. Server mungkin sudah berjalan."
} else {
  Write-Host "Menjalankan llama-server di 127.0.0.1:$Port…"
  Start-Process -FilePath $server `
    -ArgumentList "-m", "`"$modelFile`"", "--host", "127.0.0.1", "--port", "$Port", "-c", "4096", "-t", "4" `
    -WindowStyle Hidden
  Start-Sleep -Seconds 5
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 10
  Write-Host "Health: $($health.status)"
} catch {
  Write-Host "Server belum merespons /health; beri waktu beberapa detik lagi."
}

Write-Host ""
Write-Host "Aktifkan di CTF Intelligence → AI Settings:"
Write-Host "  Provider : OpenAI-compatible"
Write-Host "  Base URL : http://127.0.0.1:$Port/v1"
Write-Host "  Model    : $([System.IO.Path]::GetFileNameWithoutExtension($Model))"
Write-Host ""
Write-Host "Atau lewat .env.local:"
Write-Host "  OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:$Port/v1"
Write-Host "  OPENAI_COMPATIBLE_MODEL=$([System.IO.Path]::GetFileNameWithoutExtension($Model))"
