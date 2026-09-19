@echo off
title Presences-AI — Self-Hosted Supabase Launcher
echo =================================================================
echo   Presences-AI: Starting Local Self-Hosted Supabase Stack
echo =================================================================

if not exist ".env" (
    echo [.env file not found, copying from .env.example...]
    copy .env.example .env
)

echo Checking Docker status...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running or not installed!
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

echo Launching Supabase Containers...
docker compose up -d

echo =================================================================
echo   Supabase is running!
echo   • API URL:    http://localhost:8000
echo   • Studio UI:  http://localhost:3001
echo =================================================================
pause
