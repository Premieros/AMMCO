$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env. Edit BRIDGE_TOKEN, then run this script again."
  exit 1
}

Get-Content ".env" | ForEach-Object {
  if ($_ -match "^([^#][^=]*)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}

node server.mjs
