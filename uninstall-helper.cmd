@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helper\uninstall.ps1"
echo.
pause
