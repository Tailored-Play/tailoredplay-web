@echo off
title TailoredPlay Web Platform (Debug / Developer - Port 3001)
color 0A
cd /d "%~dp0"

echo =========================================================
echo   TailoredPlay Web Platform [DEBUG / STUDIO DEV MODE]
echo   Enforces 1-player solo launch, F1 Studio, ^& dev tools.
echo   URL: http://localhost:3001
echo =========================================================
echo.

set PORT=3001
set NEXT_PUBLIC_APP_MODE=debug

:: 1. Check if node_modules exists
if not exist "%~dp0node_modules" (
    echo [!] ERROR: Dependencies not found in node_modules.
    echo [!] Please install dependencies first by running: npm install
    echo.
    pause
    exit /b 1
)

:: 2. Free port 3001 if already in use (language-agnostic PowerShell)
echo [*] Ensuring port 3001 is free...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 3001 -ErrorAction Stop | ForEach-Object { if ($_.OwningProcess -gt 0) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } } catch { }; exit 0"

:: 3. Schedule browser launch after server spins up
start "" cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:3001"

:: 4. Launch Next.js dev server on port 3001 via Webpack
echo [*] Starting Next.js Dev Server (Webpack) on http://localhost:3001...
echo [*] The browser will open shortly at http://localhost:3001
echo [*] Press Ctrl+C to stop the platform.
echo.

call npm.cmd run dev:debug

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Server exited with error code: %ERRORLEVEL%
)

echo.
echo [*] Platform process ended.
pause
