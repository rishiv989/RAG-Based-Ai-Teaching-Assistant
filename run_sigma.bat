@echo off
title Sigma Web Dev - Auto Starter

echo ===========================================
echo        STARTING SIGMA AI ASSISTANT
echo ===========================================
echo.

REM ---------- START SIGMA BACKEND ----------
echo Starting Sigma Backend (FastAPI @8000)...
start cmd /k "cd /d C:\Users\rishu\OneDrive\Desktop\Rag Based Ai Teaching Assistant && uvicorn server:app --reload --port 8000"
echo.

REM ---------- WAIT ----------
timeout /t 2 >nul

REM ---------- START SIGMA FRONTEND ----------
echo Starting Sigma Frontend (Vite @5173)...
start cmd /k "cd /d C:\Users\rishu\OneDrive\Desktop\sigma-assistant && npm run dev -- --port 5173"
echo.

REM ---------- OPEN BROWSER ----------
echo Opening Sigma Web App...
start http://localhost:5173

echo ===========================================
echo     SIGMA AI ASSISTANT IS RUNNING! 🚀
echo ===========================================

pause
