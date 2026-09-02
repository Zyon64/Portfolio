@echo off
title Activar publicacion automatica
cd /d "%~dp0"

echo ===========================================
echo    PUBLICACION AUTOMATICA
echo ===========================================
echo.
echo Esto hace que el publicador arranque solo cada vez
echo que inicies sesion en Windows, en segundo plano.
echo.
echo A partir de ahi, el boton Guardar del editor publica
echo directo: no hay que abrir ningun archivo.
echo.
echo   1 = Activar
echo   2 = Desactivar
echo   3 = Salir
echo.
set /p op="Elegi una opcion (1-3): "

if "%op%"=="1" goto ACTIVAR
if "%op%"=="2" goto DESACTIVAR
exit /b

:ACTIVAR
rem Lanzador invisible: evita que quede una ventana negra abierta
> "%~dp0publicador-oculto.vbs" echo CreateObject("WScript.Shell").Run """%~dp0PUBLICADOR.bat""", 0, False

schtasks /create /tn "PortafolioPublicador" /tr "wscript.exe \"%~dp0publicador-oculto.vbs\"" /sc onlogon /rl limited /f
if errorlevel 1 goto ERROR

echo.
echo ===========================================
echo    ACTIVADO
echo ===========================================
echo.
echo Arranca solo al iniciar sesion. Lo arranco ahora
echo tambien para que no tengas que reiniciar.
start "" wscript.exe "%~dp0publicador-oculto.vbs"
echo.
echo Ya podes cerrar esto y usar el editor normalmente.
echo.
pause
exit /b

:DESACTIVAR
schtasks /delete /tn "PortafolioPublicador" /f
taskkill /fi "WINDOWTITLE eq Publicador del portafolio*" /f >nul 2>&1
echo.
echo Desactivado. Para publicar vas a tener que abrir
echo PUBLICADOR.bat a mano cuando quieras.
echo.
pause
exit /b

:ERROR
echo.
echo No se pudo crear la tarea. Proba abriendo este archivo
echo con boton derecho ^> Ejecutar como administrador.
echo.
pause
