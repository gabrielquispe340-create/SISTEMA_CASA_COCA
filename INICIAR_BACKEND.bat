@echo off
title CASA COCA - Backend API
chcp 65001 >nul
color 0B

echo ============================================================
echo             CASA COCA - SERVIDOR BACKEND (API)              
echo ============================================================
echo.
cd /d "%~dp0backend"
echo Iniciando FastAPI en http://127.0.0.1:8000 ...
echo Documentacion Swagger en: http://127.0.0.1:8000/docs
echo.
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
pause
