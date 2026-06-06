$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venvPython = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host "Setting up QuantTrader AI..." -ForegroundColor Cyan

if (-not (Test-Path $venvPython)) {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
  }
  if (-not $pythonCommand) {
    throw "Python was not found. Install Python 3.10+ or create backend\.venv manually."
  }

  Set-Location $backend
  & $pythonCommand.Source -m venv .venv
}

Set-Location $backend
& $venvPython -m pip install -r requirements.txt

Set-Location $frontend
& npm.cmd install

Write-Host "Setup complete. Run: npm run dev" -ForegroundColor Green
