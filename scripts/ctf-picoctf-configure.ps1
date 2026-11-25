param(
  [string]$AllowedHosts = "",
  [string]$AllowedPorts = ""
)

$ErrorActionPreference = "Stop"
$project = (Get-Location).Path
$envPath = Join-Path $project ".env.local"
$workspace = "C:\CTF-AI"

if (-not (Test-Path -LiteralPath $workspace)) {
  New-Item -ItemType Directory -Path $workspace -Force | Out-Null
}
foreach ($name in @("challenges", "evidence", "reports")) {
  New-Item -ItemType Directory -Path (Join-Path $workspace $name) -Force | Out-Null
}

$values = [ordered]@{
  "CTF_WORKSPACE_ROOT" = $workspace
  "CTF_PICOCTF_MODE" = "1"
  "CTF_PICOCTF_STRICT_ENDPOINTS" = "1"
  "CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION" = "1"
  "CTF_PICOCTF_ALLOWED_HOSTS" = $AllowedHosts
  "CTF_PICOCTF_ALLOWED_PORTS" = $AllowedPorts
}

$existing = @()
if (Test-Path -LiteralPath $envPath) {
  $existing = Get-Content -LiteralPath $envPath
}
$filtered = @()
foreach ($line in $existing) {
  $skip = $false
  foreach ($key in $values.Keys) {
    if ($line -match ("^\s*(?:#\s*)?" + [regex]::Escape($key) + "\s*=")) {
      $skip = $true
      break
    }
  }
  if (-not $skip) { $filtered += $line }
}
foreach ($key in $values.Keys) {
  $filtered += ("{0}={1}" -f $key, $values[$key])
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, ($filtered -join "`n") + "`n", $encoding)

Write-Host "PICOCTF_CONFIG_WRITTEN=true"
Write-Host ("PICOCTF_WORKSPACE=" + $workspace)
Write-Host ("PICOCTF_ALLOWED_HOST_COUNT=" + ($AllowedHosts.Split(",") | Where-Object { $_.Trim() }).Count)
Write-Host "RESTART_REQUIRED=true"
