@echo off
title Publicar portafolio
cd /d "%~dp0"

echo ===========================================
echo    PUBLICANDO EL PORTAFOLIO
echo ===========================================
echo.

git add .

git diff --cached --quiet
if %errorlevel% equ 0 (
    echo No hay cambios nuevos para subir.
    echo.
    pause
    exit /b
)

git commit -m "Actualizacion del portafolio"
if %errorlevel% neq 0 goto ERROR

git push
if %errorlevel% neq 0 goto ERROR

echo.
echo ===========================================
echo    LISTO
echo ===========================================
echo.
echo Los cambios estan subidos.
echo En 1 o 2 minutos se ven en:
echo    https://zyon64.github.io/Portfolio/
echo.
pause
exit /b

:ERROR
echo.
echo Algo fallo. Leé el mensaje de arriba.
echo.
pause
