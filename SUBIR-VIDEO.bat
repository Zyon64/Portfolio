@echo off
setlocal
title Subir video al portafolio
cd /d "%~dp0"

echo ===========================================
echo    SUBIR ARCHIVO PESADO AL PORTAFOLIO
echo ===========================================
echo.

if "%~1"=="" goto USO

where gh >nul 2>&1
if errorlevel 1 goto SIN_GH

gh auth status >nul 2>&1
if errorlevel 1 goto SIN_LOGIN

rem --- nombre seguro para la URL: sin espacios ---
set "NAME=%~nx1"
set "NAME=%NAME: =-%"
set "SRC=%~f1"

if not "%NAME%"=="%~nx1" (
    echo Renombrando a "%NAME%" para que la URL funcione...
    copy /y "%~f1" "%TEMP%\%NAME%" >nul
    set "SRC=%TEMP%\%NAME%"
)

rem --- crear el release contenedor la primera vez ---
gh release view media >nul 2>&1
if errorlevel 1 (
    echo Creando el contenedor de archivos ^(solo la primera vez^)...
    gh release create media --title "Media" --notes "Videos e imagenes pesadas del portafolio. No es una version del proyecto."
    if errorlevel 1 goto ERROR
)

echo Subiendo "%NAME%"... esto puede tardar segun el peso.
echo.
gh release upload media "%SRC%" --clobber
if errorlevel 1 goto ERROR

set "URL=https://github.com/Zyon64/Portfolio/releases/download/media/%NAME%"
echo %URL%|clip

echo.
echo ===========================================
echo    LISTO
echo ===========================================
echo.
echo La URL quedo COPIADA AL PORTAPAPELES:
echo.
echo    %URL%
echo.
echo Pegala en el editor, en el campo de ruta del proyecto.
echo.
pause
exit /b

:USO
echo Como se usa:
echo.
echo    Arrastra un video ^(o cualquier archivo pesado^) y soltalo
echo    ENCIMA de este archivo SUBIR-VIDEO.bat
echo.
echo El archivo se sube a GitHub sin ocupar espacio del repositorio,
echo y te deja la URL copiada para pegar en el editor.
echo.
pause
exit /b

:SIN_GH
echo Falta instalar el CLI de GitHub ^(una sola vez^).
echo.
echo Abri PowerShell y corre:
echo.
echo    winget install --id GitHub.cli
echo.
echo Despues cerra y volve a abrir la terminal, y corre:
echo.
echo    gh auth login
echo.
pause
exit /b

:SIN_LOGIN
echo El CLI de GitHub esta instalado pero falta iniciar sesion.
echo.
echo Abri PowerShell y corre:
echo.
echo    gh auth login
echo.
echo Elegi: GitHub.com  /  HTTPS  /  autenticar con el navegador.
echo.
pause
exit /b

:ERROR
echo.
echo Algo fallo. Lee el mensaje de arriba.
echo.
pause
