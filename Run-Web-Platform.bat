@echo off
title TailoredPlay Web Platform (Final / Production - Port 3000)
color 0B
cd /d "%~dp0"

echo =========================================================
echo   TailoredPlay Web Platform [FINAL / PRODUCTION]
echo   Enforces strict 2-player minimum for real party games.
echo   URL: http://localhost:3000
echo =========================================================
echo.

set PORT=3000
set NEXT_PUBLIC_APP_MODE=final

:: 1. Check if node_modules exists
if not exist "%~dp0node_modules" (
    echo [!] ERROR: Dependencies not found in node_modules.
    echo [!] Please install dependencies first by running: npm install
    echo.
    pause
    exit /b 1
)

:: 2. Free port 3000 if already in use (language-agnostic PowerShell)
echo [*] Ensuring port 3000 is free...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 3000 -ErrorAction Stop | ForEach-Object { if ($_.OwningProcess -gt 0) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } } catch { }; exit 0"

:: 3. Schedule browser launch after server spins up
start "" cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:3000"

:: 4. Launch Next.js dev server on port 3000 via Webpack
echo [*] Starting Next.js Dev Server (Webpack) on http://localhost:3000...
echo [*] The browser will open shortly at http://localhost:3000
echo [*] Press Ctrl+C to stop the platform.
echo.

call npm.cmd run dev:final

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Server exited with error code: %ERRORLEVEL%
)

echo.
echo [*] Platform process ended.
pause
