@echo off
setlocal
title Subir video al portafolio
cd /d "%~dp0"

echo ===========================================
echo    SUBIR ARCHIVO PESADO AL PORTAFOLIO
echo ===========================================
echo.

if "%~1"=="" goto USO

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicador.ps1" -SubirArchivo "%~f1"
if errorlevel 1 (
    echo.
    echo Algo fallo. Revisa el mensaje de arriba.
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

:USO
echo Como se usa:
echo.
echo    Arrastra un video ^(o cualquier archivo pesado^) y soltalo
echo    ENCIMA de este archivo SUBIR-VIDEO.bat
echo.
echo El archivo se optimiza y sube a GitHub Releases automaticamente,
echo y te deja la URL copiada para pegar en el editor.
echo.
pause
exit /b 0
