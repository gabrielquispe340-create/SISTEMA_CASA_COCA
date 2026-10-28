@echo off
title CASA COCA - Frontend Web
chcp 65001 >nul
color 0E

echo ============================================================
echo            CASA COCA - SERVIDOR FRONTEND (WEB)             
echo ============================================================
echo.
cd /d "%~dp0frontend"
echo Iniciando Angular en http://localhost:4200 ...
start http://localhost:4200
npm start
pause
