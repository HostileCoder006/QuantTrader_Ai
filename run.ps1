$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonCommand) { $pythonCommand = Get-Command py -ErrorAction SilentlyContinue }
  if (-not $pythonCommand) { throw "Python was not found. Install Python 3.10+ and try again." }

  Write-Host "Creating backend virtual environment..." -ForegroundColor Yellow
  & $pythonCommand.Source -m venv (Join-Path $backend ".venv")
  $python = Join-Path $backend ".venv\Scripts\python.exe"
}

if (-not (Test-Path (Join-Path $backend ".venv\Lib\site-packages\flask"))) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
  & $python -m pip install -r (Join-Path $backend "requirements.txt") --quiet
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
  Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  & npm.cmd install --prefix $frontend
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
  Set-Location $root
}
