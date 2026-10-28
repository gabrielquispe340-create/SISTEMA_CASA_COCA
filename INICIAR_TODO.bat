@echo off
title CASA COCA - Iniciador Completo del Sistema
chcp 65001 >nul
color 0A

echo ============================================================
echo         INICIANDO SISTEMA CASA COCA (COCA MACHUCADA)        
echo ============================================================
echo.
echo [1/3] Iniciando Servidor Backend (FastAPI en http://127.0.0.1:8000)...
start "CASA COCA - Backend API" cmd /k "cd /d "%~dp0backend" && color 0B && python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo [2/3] Iniciando Servidor Frontend (Angular en http://localhost:4200)...
start "CASA COCA - Frontend Web" cmd /k "cd /d "%~dp0frontend" && color 0E && npm start"

echo [3/3] Esperando que inicien los servicios para abrir el navegador...
timeout /t 6 /nobreak >nul

echo Abriendo navegador en http://localhost:4200 ...
start http://localhost:4200

echo.
echo ============================================================
echo     SISTEMA EN LINEA Y LISTO PARA TRABAJAR.
echo.
echo     - Backend API : http://127.0.0.1:8000/docs
echo     - Frontend Web: http://localhost:4200
echo.
echo     Para apagar el sistema, solo cierra las ventanas negras.
echo ============================================================
echo.
pause
