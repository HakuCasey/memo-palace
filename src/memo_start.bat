@echo off
cd /d "%~dp0"

echo === MemoPalace ===

echo [1/3] Starting server...
start /b npx tsx server/index.ts > nul 2>&1
timeout /t 3 /nobreak > nul

echo [2/3] Self-check...
npx tsx clients/cli/index.ts self-check
if errorlevel 1 echo [WARN] Self-check failed

echo [3/3] Status...
npx tsx clients/cli/index.ts status
if errorlevel 1 echo [WARN] Status check failed

echo.
echo Starting Web Console...
cd web
start /b npm run dev
cd ..

echo.
echo Server:      http://localhost:5678
echo Web Console: http://localhost:5173
echo.
echo Press any key to stop all...
pause > nul
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /nh 2^>nul') do taskkill /pid %%a /f > nul 2>&1
