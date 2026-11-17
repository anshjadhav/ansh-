@echo off
title Trading Journal Server
cd /d "%~dp0"

echo ========================================================
echo   Trading Journal - Starting Backend Server
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [Notice] Node.js is not found in your system PATH.
  echo The journal works 100%% out of the box with the built-in
  echo persistent browser storage!
  echo.
  echo Opening Trading Journal in your browser...
  start "" "%~dp0index.html"
  timeout /t 3 >nul
  exit /b
)

echo Starting Node.js REST API Server on http://localhost:3000 ...
echo Database file: data\db.json
echo.
start "" "http://localhost:3000"
node server.js
pause
