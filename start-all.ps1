$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"
$mlServicePath = Join-Path $backendPath "ml_service"
$mlVenvActivate = Join-Path $mlServicePath ".venv\Scripts\Activate.ps1"

function Start-TerminalProcess {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $script = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location '$WorkingDirectory'
$Command
"@

    Start-Process powershell -ArgumentList "-NoExit", "-Command", $script
}

function Test-CommandAvailable {
    param(
        [string]$CommandName
    )

    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

Write-Host "Starting current AnalisAI stack..." -ForegroundColor Cyan
Write-Host "Backend: Express API, manual/on-demand signal flow, signal resolution job, ML retraining job." -ForegroundColor DarkCyan
Write-Host "Frontend: Vite React client." -ForegroundColor DarkCyan
Write-Host "ML Service: calibrated probability and walk-forward validation service." -ForegroundColor DarkCyan

if (-not (Test-Path $backendPath)) {
    throw "Backend path not found: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Frontend path not found: $frontendPath"
}

if (-not (Test-CommandAvailable "npm.cmd")) {
    throw "npm.cmd is not available in PATH."
}

Start-TerminalProcess `
    -Title "AnalisAI Backend" `
    -WorkingDirectory $backendPath `
    -Command "npm.cmd run dev"

Start-TerminalProcess `
    -Title "AnalisAI Frontend" `
    -WorkingDirectory $frontendPath `
    -Command "npm.cmd run dev"

if (Test-Path $mlVenvActivate) {
    Start-TerminalProcess `
        -Title "AnalisAI ML Service" `
        -WorkingDirectory $mlServicePath `
        -Command ". '$mlVenvActivate'; uvicorn app:app --host 127.0.0.1 --port 8001 --reload"
} else {
    Write-Host "ML service virtual environment not found at $mlVenvActivate" -ForegroundColor Yellow
    Write-Host "Create it with:" -ForegroundColor Yellow
    Write-Host "  cd backend\ml_service" -ForegroundColor Cyan
    Write-Host "  python -m venv .venv" -ForegroundColor Cyan
    Write-Host "  .venv\Scripts\activate" -ForegroundColor Cyan
    Write-Host "  pip install -r requirements.txt" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Started backend and frontend terminals." -ForegroundColor Green
Write-Host "No background LLM auto-signal generator is started in the current system." -ForegroundColor Green
Write-Host "If the ML service terminal opened successfully, calibrated signal validation is available at http://127.0.0.1:8001." -ForegroundColor Green
