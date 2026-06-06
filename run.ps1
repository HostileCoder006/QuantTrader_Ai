$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
  }
  if (-not $pythonCommand) {
    throw "Python was not found. Install Python 3.10+ and run this command again."
  }

  Write-Host "Creating backend virtual environment..." -ForegroundColor Yellow
  Set-Location $backend
  & $pythonCommand.Source -m venv .venv
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
  Set-Location $backend
  & $python -m pip install -r requirements.txt

  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  Set-Location $frontend
  & npm.cmd install
}

Write-Host "Starting QuantTrader AI..." -ForegroundColor Cyan
Write-Host "Backend:  http://127.0.0.1:5000" -ForegroundColor DarkGray
Write-Host "Frontend: http://127.0.0.1:5173, or the next free Vite port if 5173 is busy" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor DarkGray

$backendJob = Start-Job -Name "quanttrader-backend" -ScriptBlock {
  param($backendPath, $pythonPath)
  Set-Location $backendPath
  & $pythonPath app.py
} -ArgumentList $backend, $python

$frontendJob = Start-Job -Name "quanttrader-frontend" -ScriptBlock {
  param($frontendPath)
  Set-Location $frontendPath
  & npm.cmd run dev -- --port 5173
} -ArgumentList $frontend

try {
  while ($true) {
    Receive-Job $backendJob -ErrorAction SilentlyContinue
    Receive-Job $frontendJob -ErrorAction SilentlyContinue

    if ($backendJob.State -ne "Running") {
      Receive-Job $backendJob -ErrorAction SilentlyContinue
      throw "Backend server stopped unexpectedly. Check whether port 5000 is already in use."
    }

    if ($frontendJob.State -ne "Running") {
      Receive-Job $frontendJob -ErrorAction SilentlyContinue
      throw "Frontend server stopped unexpectedly. Check whether port 5173 is already in use."
    }

    Start-Sleep -Seconds 1
  }
}
finally {
  Write-Host ""
  Write-Host "Stopping QuantTrader AI..." -ForegroundColor Cyan
  Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
  Remove-Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
  Set-Location $root
}
