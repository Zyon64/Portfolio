@echo off
setlocal enabledelayedexpansion
title Publicador del portafolio
cd /d "%~dp0"

echo ===========================================
echo    PUBLICADOR - ACTIVO
echo ===========================================
echo.
echo No hace falta tocar nada: cuando le des Guardar
echo en el editor, esto sube todo solo.
echo.
echo Podes minimizar esta ventana o cerrarla; si la
echo cerras, se vuelve a abrir sola al reiniciar.
echo.
echo -------------------------------------------
echo.

:BUCLE
timeout /t 3 /nobreak >nul

rem żPidio publicar el editor, o quedo algo a medio subir?
set "HAYQUE="
if exist "subir\_publicar.flag" set "HAYQUE=1"
for %%F in ("subir\*.*") do if /i not "%%~nxF"=="_subiendo.txt" if /i not "%%~nxF"=="_publicar.flag" set "HAYQUE=1"
if not defined HAYQUE (
    rem tambien publica si hay cambios sueltos en el repo
    git status --porcelain >"%TEMP%\pf_estado.txt" 2>nul
    for %%A in ("%TEMP%\pf_estado.txt") do if %%~zA gtr 0 set "HAYQUE=1"
)
if not defined HAYQUE goto BUCLE

if exist "subir\_publicar.flag" del "subir\_publicar.flag"

rem --- 1) los videos, a Releases ---
if exist "subir\*.*" call :SUBIR_MEDIOS

rem --- 2) el resto, al repositorio ---
timeout /t 2 /nobreak >nul
git add .

powershell -NoProfile -Command "$g=git diff --cached --name-only; $b=$g ^| Where-Object { Test-Path -LiteralPath $_ } ^| Where-Object { (Get-Item -LiteralPath $_).Length -gt 47185920 }; if($b){ $b ^| ForEach-Object { Write-Host ('   DEMASIADO GRANDE: ' + $_) }; exit 1 }; exit 0"
if errorlevel 1 (
    echo [%time:~0,8%] Freno: hay un archivo de mas de 45 MB sin ignorar.
    git reset -q
    goto BUCLE
)

git diff --cached --quiet
if %errorlevel% equ 0 goto BUCLE

echo [%time:~0,8%] Publicando...
git commit -q -m "Actualizacion del portafolio"
git push -q
if errorlevel 1 (
    echo [%time:~0,8%] Fallo el envio, se reintenta.
) else (
    echo [%time:~0,8%] LISTO. En 1 o 2 minutos se ve en la pagina.
)
goto BUCLE


rem ===========================================================
:SUBIR_MEDIOS
where gh >nul 2>&1
if errorlevel 1 (
    echo [%time:~0,8%] Falta el CLI de GitHub: winget install --id GitHub.cli
    exit /b
)
gh release view media >nul 2>&1
if errorlevel 1 gh release create media --title "Media" --notes "Videos del portafolio." >nul 2>&1

for %%F in ("subir\*.*") do (
    if /i not "%%~nxF"=="_subiendo.txt" if /i not "%%~nxF"=="_publicar.flag" (
        echo [%time:~0,8%] Subiendo %%~nxF...
        >"subir\_subiendo.txt" echo %%~nxF
        gh release upload media "%%F" --clobber
        if errorlevel 1 (
            echo [%time:~0,8%] Fallo %%~nxF, se reintenta despues.
        ) else (
            del "%%F"
            echo [%time:~0,8%] %%~nxF publicado.
        )
    )
)
if exist "subir\_subiendo.txt" del "subir\_subiendo.txt"
exit /b
