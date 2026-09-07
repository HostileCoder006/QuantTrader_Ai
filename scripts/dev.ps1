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

Write-Host ""
Write-Host "  QuantTrader AI - Market Intelligence Platform" -ForegroundColor Cyan
Write-Host "  Backend:  http://127.0.0.1:5000" -ForegroundColor DarkGray
Write-Host "  Frontend: http://127.0.0.1:5173" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor DarkGray
Write-Host ""

$backendProc = Start-Process -FilePath $python `
  -ArgumentList "app.py" `
  -WorkingDirectory $backend `
  -PassThru -NoNewWindow

$frontendProc = Start-Process -FilePath "npm.cmd" `
  -ArgumentList "run", "dev", "--", "--port", "5173" `
  -WorkingDirectory $frontend `
  -PassThru -NoNewWindow

Write-Host "  Backend PID:  $($backendProc.Id)" -ForegroundColor DarkGray
Write-Host "  Frontend PID: $($frontendProc.Id)" -ForegroundColor DarkGray
Write-Host ""

try {
  while ($true) {
    if ($backendProc.HasExited) {
      throw "Backend stopped unexpectedly (exit $($backendProc.ExitCode)). Is port 5000 in use?"
    }
    if ($frontendProc.HasExited) {
      throw "Frontend stopped unexpectedly (exit $($frontendProc.ExitCode)). Is port 5173 in use?"
    }
    Start-Sleep -Seconds 2
  }
}
finally {
  Write-Host ""
  Write-Host "Stopping QuantTrader AI..." -ForegroundColor Cyan
  if (-not $backendProc.HasExited)  { $backendProc.Kill()  }
  if (-not $frontendProc.HasExited) { $frontendProc.Kill() }
}
