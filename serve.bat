@echo off
REM Abre o dashboard PAY4CHARGE em um servidor local usando o PowerShell do Windows.
REM Nao precisa de Python nem Node.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
