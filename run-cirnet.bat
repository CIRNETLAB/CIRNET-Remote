@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-cirnet.ps1" %*
set "result=%errorlevel%"
if not "%result%"=="0" if "%~1"=="" (
    echo Press any key to close this window . . .
    pause >nul
)
exit /b %result%
