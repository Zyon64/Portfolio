@echo off
title Publicador del portafolio
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicador.ps1"
echo.
echo El publicador se detuvo. Cerra esta ventana o volve a abrirlo.
pause
