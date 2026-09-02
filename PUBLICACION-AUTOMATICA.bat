@echo off
title Publicacion automatica del portafolio
cd /d "%~dp0"

echo ===========================================
echo    PUBLICACION AUTOMATICA - ACTIVA
echo ===========================================
echo.
echo Deja esta ventana abierta (podes minimizarla).
echo.
echo Cada vez que guardes en el editor, los cambios se
echo suben solos en menos de un minuto.
echo.
echo Para apagarlo, cerra esta ventana.
echo.
echo -------------------------------------------
echo.

:BUCLE
timeout /t 15 /nobreak >nul

rem żHay algo nuevo?
git status --porcelain >"%TEMP%\pf_estado.txt" 2>nul
for %%A in ("%TEMP%\pf_estado.txt") do if %%~zA equ 0 goto BUCLE

rem Esperar a que termine de escribirse el archivo
timeout /t 3 /nobreak >nul

git add .

rem Freno: nada pesado al repositorio
powershell -NoProfile -Command "$g=git diff --cached --name-only; $b=$g ^| Where-Object { Test-Path -LiteralPath $_ } ^| Where-Object { (Get-Item -LiteralPath $_).Length -gt 47185920 }; if($b){ exit 1 }; exit 0"
if errorlevel 1 (
    echo [%time:~0,8%] FRENO: hay un archivo de mas de 45 MB. Usa SUBIR-VIDEO.bat.
    git reset -q
    goto BUCLE
)

git diff --cached --quiet
if %errorlevel% equ 0 goto BUCLE

echo [%time:~0,8%] Subiendo cambios...
git commit -q -m "Actualizacion del portafolio"
git push -q
if errorlevel 1 (
    echo [%time:~0,8%] Fallo el envio. Se reintenta en el proximo ciclo.
) else (
    echo [%time:~0,8%] Listo. En 1 o 2 minutos se ve en la pagina.
)

goto BUCLE
