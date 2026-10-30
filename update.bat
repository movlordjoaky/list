@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM === 1. Bump sw.js version ===
for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /value') do set "dt=%%a"
set "VERSION=!dt:~0,4!-!dt:~4,2!-!dt:~6,2!_!dt:~8,2!-!dt:~10,2!-!dt:~12,2!"
endlocal & set "VERSION=%VERSION%"

powershell -Command "(Get-Content sw.js) -replace 'const CACHE = ''list-[^'']*'';', 'const CACHE = ''list-%VERSION%'';' | Set-Content sw.js -Encoding UTF8"
echo.
echo [OK] sw.js -^> list-%VERSION%
echo.

REM === 2. Stage all changes ===
git add -A

echo === Staged changes ===
git status --short
echo.

REM === 3. Commit message ===
set "MSG="
set /p "MSG=Commit message (Enter to abort): "
if "%MSG%"=="" (
    echo [ABORT] Empty message. Nothing committed.
    pause
    exit /b 1
)

REM === 4. Commit + push ===
git commit -m "%MSG%"
if errorlevel 1 (
    echo [FAIL] git commit failed.
    pause
    exit /b 1
)

git push
if errorlevel 1 (
    echo [FAIL] git push failed - commit is local, push manually.
    pause
    exit /b 1
)

echo.
echo [OK] Done: list-%VERSION% ^| "%MSG%"
exit /b 0