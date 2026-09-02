@echo off
setlocal enabledelayedexpansion
title Publicador del portafolio
cd /d "%~dp0"

rem --- ffmpeg: optimiza los videos antes de subirlos ---
set "FFMPEG=C:\Users\MXD\Documents\ffmpeg-20190701-e51cc7e-win64-static\bin\ffmpeg.exe"
set "FFPROBE=C:\Users\MXD\Documents\ffmpeg-20190701-e51cc7e-win64-static\bin\ffprobe.exe"
if not exist "%FFMPEG%" set "FFMPEG=ffmpeg"
if not exist "%FFPROBE%" set "FFPROBE=ffprobe"

echo ===========================================
echo    PUBLICADOR - ACTIVO
echo ===========================================
echo.
echo Cuando le des Guardar en el editor, esto:
echo   1. optimiza los videos ^(720p + arranque rapido^)
echo   2. los sube a Releases
echo   3. publica la pagina
echo.
echo Podes minimizar esta ventana.
echo.
echo -------------------------------------------
echo.

:BUCLE
timeout /t 3 /nobreak >nul

set "HAYQUE="
if exist "subir\_publicar.flag" set "HAYQUE=1"
for %%F in ("subir\*.*") do (
    if /i not "%%~nxF"=="_subiendo.txt" if /i not "%%~nxF"=="_publicar.flag" if /i not "%%~nxF"=="_progreso.txt" set "HAYQUE=1"
)
if not defined HAYQUE (
    git status --porcelain >"%TEMP%\pf_estado.txt" 2>nul
    for %%A in ("%TEMP%\pf_estado.txt") do if %%~zA gtr 0 set "HAYQUE=1"
)
if not defined HAYQUE goto BUCLE

if exist "subir\_publicar.flag" del "subir\_publicar.flag"

if exist "subir\*.*" call :PROCESAR_MEDIOS

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

echo [%time:~0,8%] Publicando pagina...
git commit -q -m "Actualizacion del portafolio"
git push -q
if errorlevel 1 (
    echo [%time:~0,8%] Fallo el envio, se reintenta.
) else (
    echo [%time:~0,8%] LISTO. En 1 o 2 minutos se ve en la pagina.
)
goto BUCLE


rem ===========================================================
rem  Optimiza y sube cada archivo de subir\
rem ===========================================================
:PROCESAR_MEDIOS
where gh >nul 2>&1
if errorlevel 1 (
    echo [%time:~0,8%] Falta el CLI de GitHub: winget install --id GitHub.cli
    exit /b
)
gh release view media >nul 2>&1
if errorlevel 1 gh release create media --title "Media" --notes "Videos del portafolio." >nul 2>&1

for %%F in ("subir\*.*") do (
    if /i not "%%~nxF"=="_subiendo.txt" if /i not "%%~nxF"=="_publicar.flag" if /i not "%%~nxF"=="_progreso.txt" (
        call :UNO "%%F" "%%~nxF" "%%~xF"
    )
)
if exist "subir\_subiendo.txt" del "subir\_subiendo.txt"
if exist "subir\_progreso.txt" del "subir\_progreso.txt"
exit /b


:UNO
set "RUTA=%~1"
set "NOMBRE=%~2"
set "EXT=%~3"

rem --- Optimizar si es video y hay ffmpeg ---
set "SUBIR=%RUTA%"
if /i "%EXT%"==".mp4" call :OPTIMIZAR "%RUTA%" "%NOMBRE%"
if /i "%EXT%"==".mov" call :OPTIMIZAR "%RUTA%" "%NOMBRE%"
if /i "%EXT%"==".mkv" call :OPTIMIZAR "%RUTA%" "%NOMBRE%"
if /i "%EXT%"==".avi" call :OPTIMIZAR "%RUTA%" "%NOMBRE%"

echo [%time:~0,8%] Subiendo %NOMBRE%...
> "subir\_subiendo.txt" echo %NOMBRE%^|subiendo^|0
gh release upload media "%SUBIR%" --clobber
if errorlevel 1 (
    echo [%time:~0,8%] Fallo %NOMBRE%, se reintenta despues.
) else (
    del "%RUTA%" 2>nul
    if not "%SUBIR%"=="%RUTA%" del "%SUBIR%" 2>nul
    echo [%time:~0,8%] %NOMBRE% publicado.
)
exit /b


:OPTIMIZAR
set "ENT=%~1"
set "NOM=%~2"
where "%FFMPEG%" >nul 2>&1 || if not exist "%FFMPEG%" exit /b

rem duracion, para que el editor calcule el porcentaje
for /f "tokens=*" %%D in ('"%FFPROBE%" -v error -show_entries format^=duration -of csv^=p^=0 "%ENT%" 2^>nul') do set "DUR=%%D"
if not defined DUR set "DUR=0"

echo [%time:~0,8%] Optimizando %NOM% ^(720p + arranque rapido^)...
> "subir\_subiendo.txt" echo %NOM%^|optimizando^|%DUR%

"%FFMPEG%" -y -v error -nostats -progress "subir\_progreso.txt" -i "%ENT%" ^
  -vf "scale=-2:min(720\,ih)" -c:v libx264 -preset veryfast -crf 28 ^
  -maxrate 2000k -bufsize 4000k -movflags +faststart ^
  -c:a aac -b:a 96k "%ENT%.opt.mp4"

if exist "%ENT%.opt.mp4" (
    set "SUBIR=%ENT%.opt.mp4"
    echo [%time:~0,8%] %NOM% optimizado.
) else (
    echo [%time:~0,8%] No se pudo optimizar %NOM%, se sube tal cual.
)
if exist "subir\_progreso.txt" del "subir\_progreso.txt"
exit /b
