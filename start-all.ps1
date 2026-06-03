$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "backend_py"
$frontendPath = Join-Path $repoRoot "frontend"
$backendVenvActivate = Join-Path $backendPath "venv\Scripts\Activate.ps1"

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
Write-Host "Backend: Python FastAPI (Integrated ML, WebSockets, DB, Signals)." -ForegroundColor DarkCyan
Write-Host "Frontend: Vite React client." -ForegroundColor DarkCyan

if (-not (Test-Path $backendPath)) {
    throw "Backend path not found: $backendPath"
}

if (-not (Test-Path $frontendPath)) {
    throw "Frontend path not found: $frontendPath"
}

if (-not (Test-CommandAvailable "npm.cmd")) {
    throw "npm.cmd is not available in PATH."
}

if (Test-Path $backendVenvActivate) {
    Start-TerminalProcess `
        -Title "AnalisAI Backend (Python)" `
        -WorkingDirectory $backendPath `
        -Command ". '$backendVenvActivate'; uvicorn app.main:app --host 127.0.0.1 --port 5000 --reload"
} else {
    Write-Host "Backend virtual environment not found at $backendVenvActivate" -ForegroundColor Yellow
    Write-Host "Create it with:" -ForegroundColor Yellow
    Write-Host "  cd backend_py" -ForegroundColor Cyan
    Write-Host "  python -m venv venv" -ForegroundColor Cyan
    Write-Host "  venv\Scripts\activate" -ForegroundColor Cyan
    Write-Host "  pip install -r requirements.txt" -ForegroundColor Cyan
}

Start-TerminalProcess `
    -Title "AnalisAI Frontend" `
    -WorkingDirectory $frontendPath `
    -Command "npm.cmd run dev"

Write-Host ""
Write-Host "Started backend and frontend terminals." -ForegroundColor Green
Write-Host "Python backend is available at http://127.0.0.1:5000." -ForegroundColor Green
