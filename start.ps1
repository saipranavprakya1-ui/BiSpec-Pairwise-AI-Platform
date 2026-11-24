# ==============================================================================
# BiSpec Pairwise AI - Full-Stack App Runner (Connects Port 8000 + Port 5173)
# Usage: .\start.ps1
# ==============================================================================

$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "  BiSpec Pairwise AI - Launching Backend (8000) + Frontend (5173)" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan

# Choose Python interpreter
$PythonExe = if (Test-Path "C:\Python314\python.exe") { "C:\Python314\python.exe" } else { "python" }

# Free ports 8000 & 5173 if occupied
foreach ($port in @(8000, 5173)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# 1. Launch FastAPI Backend on Port 8000
Write-Host "[1/3] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
$BackendProc = Start-Process -FilePath $PythonExe -ArgumentList "run.py" -WorkingDirectory $ProjectRoot -PassThru

# 2. Launch Vite Frontend on Port 5173 (proxied to Port 8000 via vite.config.js)
Write-Host "[2/3] Starting Vite Frontend on http://127.0.0.1:5173 ..." -ForegroundColor Green
$FrontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173" -WorkingDirectory $ProjectRoot -PassThru

# 3. Wait until Backend /api/health responds
Write-Host "[3/3] Verifying live connection between Port 5173 <-> Port 8000 ..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 2
        if ($resp) { $ready = $true; break }
    } catch {}
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
if ($ready) {
    Write-Host "  STATUS: CONNECTED & ONLINE" -ForegroundColor Green
} else {
    Write-Host "  STATUS: STARTING UP (give it a few seconds)" -ForegroundColor Yellow
}
Write-Host "  Frontend Dev UI (5173 -> 8000) : http://127.0.0.1:5173" -ForegroundColor White
Write-Host "  Unified Production App (8000)  : http://127.0.0.1:8000" -ForegroundColor White
Write-Host "  FastAPI Swagger Docs           : http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor DarkGray

Start-Process "http://127.0.0.1:5173"

try {
    Wait-Process -Id $BackendProc.Id, $FrontendProc.Id
} finally {
    Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue
}
