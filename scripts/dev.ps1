$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  Write-Host "Backend virtual environment is missing. Run: npm run setup" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
  Write-Host "Frontend dependencies are missing. Run: npm run setup" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting QuantTrader AI..." -ForegroundColor Cyan
Write-Host "Backend:  http://127.0.0.1:5000" -ForegroundColor DarkGray
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor DarkGray
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
    Receive-Job $backendJob
    Receive-Job $frontendJob

    if ($backendJob.State -ne "Running") {
      Receive-Job $backendJob
      throw "Backend server stopped unexpectedly."
    }

    if ($frontendJob.State -ne "Running") {
      Receive-Job $frontendJob
      throw "Frontend server stopped unexpectedly."
    }

    Start-Sleep -Seconds 1
  }
}
finally {
  Write-Host ""
  Write-Host "Stopping QuantTrader AI..." -ForegroundColor Cyan
  Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
  Remove-Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
}
