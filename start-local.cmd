@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo WhatsApp Task Platform - Local Development
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22 is required. Install Node.js 22 first.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  where pnpm.cmd >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] pnpm is not available. Enable Corepack or install pnpm 10.34.9.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo [INFO] Creating local .env from .env.example
  copy ".env.example" ".env" >nul
  if errorlevel 1 (
    echo [ERROR] Could not create .env.
    pause
    exit /b 1
  )
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker Desktop is not running.
  echo Start Docker Desktop, wait for the engine to become ready, then double-click this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\concurrently.cmd" (
  echo [INFO] Installing project dependencies. This is required only on first launch or after dependency changes.
  call pnpm install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo [INFO] Starting PostgreSQL, Redis, user web, admin web and API...
echo [INFO] User web:  http://localhost:3000
echo [INFO] Admin web: http://localhost:3001
echo [INFO] API health: http://localhost:3002/api/v1/health
echo.
call pnpm dev:local
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Local development process stopped with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
