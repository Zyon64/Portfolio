@echo off
title Publicar portafolio
cd /d "%~dp0"

echo ===========================================
echo    PUBLICANDO EL PORTAFOLIO
echo ===========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicador.ps1" -UnaVez
if errorlevel 1 (
    echo.
    echo Algo fallo. Revisa el mensaje de arriba o subir\_publicador.log
    echo.
    pause
    exit /b 1
)

echo.
echo ===========================================
echo    LISTO
echo ===========================================
echo.
pause
exit /b 0
