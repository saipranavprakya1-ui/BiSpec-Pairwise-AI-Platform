@echo off
title BiSpec Pairwise AI - Full-Stack App Runner (Ports 8000 + 5173)
cd /d "%~dp0"

echo ============================================================================
echo   BiSpec Pairwise AI - Starting Full-Stack Platform (Ports 8000 + 5173)
echo ============================================================================
echo.

:: Pick Python interpreter (prefer C:\Python314\python.exe where all ML deps live)
set "PY_CMD=C:\Python314\python.exe"
if not exist "%PY_CMD%" set "PY_CMD=python"

:: 1. Free ports 8000 and 5173 if already occupied
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

:: 2. Start FastAPI Backend (Port 8000: 9 Live ML Models + NVIDIA NIM RAG + SQLite)
echo [1/3] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "BiSpec Backend (Port 8000)" cmd /k ""%PY_CMD%" run.py"

:: 3. Start Vite Frontend Dev Server (Port 5173 -> proxied to Port 8000)
echo [2/3] Starting Vite Frontend on http://127.0.0.1:5173 ...
start "BiSpec Frontend (Port 5173)" cmd /k "npm run dev -- --host 0.0.0.0 --port 5173"

:: 4. Wait for Backend health check, then open browser
echo [3/3] Waiting for both ports to connect...
timeout /t 5 /nobreak >nul

echo.
echo ============================================================================
echo   BOTH SERVERS CONNECTED AND RUNNING!
echo   - Frontend (Hot Reload) : http://127.0.0.1:5173
echo   - Unified App + API     : http://127.0.0.1:8000
echo   - Swagger API Docs      : http://127.0.0.1:8000/docs
echo ============================================================================
start "" "http://127.0.0.1:5173"
pause
