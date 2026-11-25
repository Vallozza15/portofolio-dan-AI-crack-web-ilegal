<#
  Stops the CTF Intelligence local stack started by ctf-start-all.ps1.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\ctf-stop-all.ps1
    powershell -ExecutionPolicy Bypass -File scripts\ctf-stop-all.ps1 -KeepDatabase
#>
param(
  [switch]$KeepDatabase
)

$ErrorActionPreference = "SilentlyContinue"
$Repo = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $env:LOCALAPPDATA "ctf-intelligence\tools"
$RunDir = Join-Path $Tools "run"
$Node = Join-Path $Tools "node\node.exe"
$TsxCli = Join-Path $Repo "node_modules\tsx\dist\cli.mjs"

function Stop-PidFile([string]$name) {
  $file = Join-Path $RunDir "$name.pid"
  if (Test-Path $file) {
    $procId = [int](Get-Content $file -Raw).Trim()
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      Write-Host "dihentikan: $name (PID $procId)"
    }
    Remove-Item $file -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "== tunnel =="
Stop-PidFile "tunnel"
Write-Host "== server =="
Stop-PidFile "server"
Write-Host "== python backend =="
Stop-PidFile "python-backend"

Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "== llama.cpp =="
Get-Process "llama-server" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; "dihentikan: llama-server (PID $($_.Id))" }

if (-not $KeepDatabase -and (Test-Path $Node)) {
  Write-Host "== PostgreSQL =="
  & $Node $TsxCli "scripts/ctf-pg-stop.ts"
}

Write-Host "Selesai."
