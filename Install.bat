@echo off
REM Contradiction screen reader access mod -- installer
REM Runs install.ps1 without changing your PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
