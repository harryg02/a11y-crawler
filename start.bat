@echo off
setlocal
cd /d "%~dp0"

echo.
echo   A11y Crawler
echo   -----------------------------
echo.

:: ── Node.js check ──────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   Node.js is not installed.
    echo.
    echo   Download and install it from: https://nodejs.org
    echo   Use the LTS version, then double-click this file again.
    echo.
    pause
    exit /b 1
)

for /f %%v in ('node -v') do set NODE_VER=%%v
for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_MAJOR=%%a
set NODE_MAJOR=%NODE_MAJOR:v=%
if "%NODE_MAJOR%"=="" (
    echo   Could not read Node.js version. Please reinstall from https://nodejs.org
    pause
    exit /b 1
)
if %NODE_MAJOR% lss 18 (
    echo   Node.js %NODE_VER% is too old ^(need v18 or newer^).
    echo.
    echo   Update at: https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js %NODE_VER%

:: ── Install dependencies ───────────────────────────────────────────────────
echo   Checking dependencies...
call npm install --silent 2>>start-error.log
if %errorlevel% neq 0 (
    echo.
    echo   Could not install dependencies.
    echo   Details in start-error.log — try running: npm install
    echo.
    pause
    exit /b 1
)
echo [OK] Dependencies ready

:: ── Install Playwright browser ─────────────────────────────────────────────
echo   Checking browser ^(may take a minute the first time^)...
call npx playwright install chromium 2>>start-error.log
if %errorlevel% neq 0 (
    echo.
    echo   Could not install Chromium.
    echo   Details in start-error.log — try running: npx playwright install chromium
    echo.
    pause
    exit /b 1
)
echo [OK] Browser ready

:: ── Preflight: trigger Windows Firewall permission dialog early ─────────────
echo   Checking browser permissions ^(approve any Windows Security popup^)...
call npx playwright test tests/preflight.spec.ts --project=chromium --reporter=dot >nul 2>&1
echo [OK] Browser permissions ready

:: ── Open browser after server starts ──────────────────────────────────────
start "" /b cmd /c "for /l %%i in (1,1,60) do (curl -s http://localhost:3000 >nul 2>&1 && start http://localhost:3000 && exit) & timeout /t 1 >nul"

echo.
echo   Starting...  http://localhost:3000
echo   Press Ctrl+C to stop.
echo.

call npm run dev
