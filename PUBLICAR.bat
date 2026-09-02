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

rem --- Freno de mano: GitHub rechaza archivos de mas de 100 MB, y
rem     todo lo que entra queda para siempre en el historial. ---
powershell -NoProfile -Command "$g=git diff --cached --name-only; $b=$g ^| Where-Object { Test-Path -LiteralPath $_ } ^| Where-Object { (Get-Item -LiteralPath $_).Length -gt 47185920 }; if($b){ $b ^| ForEach-Object { Write-Host ('   ' + $_ + '  (' + [math]::Round((Get-Item -LiteralPath $_).Length/1MB) + ' MB)') }; exit 1 }; exit 0"
if errorlevel 1 goto MUY_GRANDE

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

:MUY_GRANDE
echo.
echo ===========================================
echo    FRENO: HAY ARCHIVOS DEMASIADO GRANDES
echo ===========================================
echo.
echo Los archivos de arriba pesan mas de 45 MB y NO deben ir al
echo repositorio: GitHub rechaza todo lo que pase de 100 MB, y lo
echo que se sube queda para siempre en el historial.
echo.
echo Que hacer:
echo   1. Sacalos de la carpeta img
echo   2. Arrastralos sobre SUBIR-VIDEO.bat
echo   3. Pega en el editor la URL que te queda copiada
echo.
git reset -q
echo (No se subio nada. Los archivos siguen en tu disco.)
echo.
pause
exit /b

:ERROR
echo.
echo Algo fallo. Leé el mensaje de arriba.
echo.
pause
