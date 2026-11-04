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

echo [INFO] Checking and installing workspace dependencies...
call pnpm install --no-frozen-lockfile
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  pause
  exit /b 1
)

echo [INFO] Generating Prisma Client from the current database schema...
call pnpm db:generate
if errorlevel 1 (
  echo [ERROR] Prisma Client generation failed.
  pause
  exit /b 1
)

echo.
echo [INFO] Starting user web, admin web and API directly on Windows...
echo [INFO] No Docker Desktop is required for this UI/API development mode.
echo [INFO] Database-backed features remain unavailable until PostgreSQL and Redis are configured separately.
echo.
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
