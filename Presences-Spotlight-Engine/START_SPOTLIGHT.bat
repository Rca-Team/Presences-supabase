@echo off
title Presences Spotlight AI — Gate Terminal Launcher
color 0A
cls

echo =====================================================================
echo           PRESENCES SPOTLIGHT AI -- GATE ATTENDANCE LAUNCHER
echo =====================================================================
echo.
echo [1/3] Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ from python.org and check "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

echo [2/3] Checking requirements and local cache...
cd /d "%~dp0"

echo [3/3] Launching Presences Spotlight Gate Terminal...
echo.
echo =====================================================================
echo   Terminal is starting. Press 'Q' inside the camera window to close.
echo =====================================================================
echo.

python spotlight_engine.py

if %errorlevel% neq 0 (
    echo.
    echo [NOTE] Engine stopped or encountered an issue.
    pause
)
