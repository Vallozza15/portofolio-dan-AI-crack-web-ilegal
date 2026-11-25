# Portable Ollama setup for local AI without any API key.
# Extracts Ollama into .tools/ollama and starts the server on 127.0.0.1:11434.
# Run from the project root:  powershell -ExecutionPolicy Bypass -File scripts\ctf-ollama-setup.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root ".tools"
$zip = Join-Path $tools "ollama.zip"
$target = Join-Path $tools "ollama"
$model = if ($env:CTF_OLLAMA_MODEL) { $env:CTF_OLLAMA_MODEL } else { "llama3.2:3b" }

New-Item -ItemType Directory -Force -Path $tools | Out-Null

if (-not (Test-Path $zip)) {
  Write-Host "Mengunduh Ollama portable (~1.6 GB)…"
  Invoke-WebRequest -Uri "https://ollama.com/download/ollama-windows-amd64.zip" -OutFile $zip -UseBasicParsing
}

if (-not (Test-Path (Join-Path $target "ollama.exe"))) {
  Write-Host "Mengekstrak…"
  Expand-Archive -Path $zip -DestinationPath $target -Force
}

$exe = Join-Path $target "ollama.exe"
if (-not (Test-Path $exe)) { throw "ollama.exe tidak ditemukan setelah ekstraksi." }

Write-Host "Menjalankan server Ollama di 127.0.0.1:11434…"
$env:OLLAMA_HOST = "127.0.0.1:11434"
$server = Start-Process -FilePath $exe -ArgumentList "serve" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5

Write-Host "Mengunduh model $model (sekali saja, butuh waktu)…"
& $exe pull $model
if ($LASTEXITCODE -ne 0) { throw "Gagal mengunduh model $model." }

Write-Host ""
Write-Host "Ollama siap (PID $($server.Id))."
Write-Host "Model: $model"
Write-Host "Di AI Settings, aktifkan provider Ollama dengan base URL http://127.0.0.1:11434 dan model $model."
