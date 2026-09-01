@echo off
REM Contradiction screen reader access mod -- uninstaller
REM Restores the original index.html and removes the mod.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -Uninstall
echo.
pause
