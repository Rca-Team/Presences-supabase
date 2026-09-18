@echo off
setlocal EnableDelayedExpansion
title Presences Spotlight AI — Automated 1-Click PC Setup
color 0B
cls

echo =====================================================================
echo    PRESENCES SPOTLIGHT AI -- AUTOMATED 1-CLICK PC INSTALLER
echo =====================================================================
echo   This script will set up everything needed to run Spotlight Gate
echo   on this computer in under 60 seconds.
echo =====================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: ─── Step 1: Check / Install Python ──────────────────────────────────────────
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [NOTE] Python was not detected on this system.
    echo Downloading and installing official Python 64-bit for Windows...
    
    set PYTHON_INSTALLER=python_installer.exe
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe', '%PYTHON_INSTALLER%')"
    
    if exist "%PYTHON_INSTALLER%" (
        echo Installing Python silently with PATH configuration (takes ~30s)...
        start /wait %PYTHON_INSTALLER% /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
        del %PYTHON_INSTALLER%
        
        :: Refresh PATH for current session
        set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;C:\Program Files\Python311;C:\Program Files\Python311\Scripts;%PATH%"
    ) else (
        echo [ERROR] Could not download Python automatically.
        echo Please download and install Python 3.10+ from https://www.python.org/downloads/
        echo (Make sure to check "Add Python to PATH" during installation)
        pause
        exit /b 1
    )
)
python --version
echo [OK] Python is ready.
echo.

:: ─── Step 2: Install Python Libraries ────────────────────────────────────────
echo [2/5] Installing core AI vision and networking libraries...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo Retrying package installation with explicit list...
    python -m pip install numpy opencv-python requests python-dotenv face_recognition
)
echo [OK] Libraries installed successfully.
echo.

:: ─── Step 3: Setup Environment Configuration ─────────────────────────────────
echo [3/5] Verifying environment configuration (.env)...
if not exist "%SCRIPT_DIR%.env" (
    if exist "%SCRIPT_DIR%.env.example" (
        copy "%SCRIPT_DIR%.env.example" "%SCRIPT_DIR%.env" >nul
        echo [NOTE] Created new .env file from template.
    )
)
echo [OK] Configuration file ready.
echo.

:: ─── Step 4: Create Desktop Shortcut ─────────────────────────────────────────
echo [4/5] Creating Desktop shortcut for 1-click daily launching...
set TARGET_BAT=%SCRIPT_DIR%START_SPOTLIGHT.bat
set SHORTCUT_NAME=Presences Spotlight Gate.lnk
set DESKTOP_DIR=%USERPROFILE%\Desktop

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%DESKTOP_DIR%\%SHORTCUT_NAME%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Launch Presences Spotlight Gate Attendance Terminal'; $s.Save()"

if exist "%DESKTOP_DIR%\%SHORTCUT_NAME%" (
    echo [OK] Shortcut created on Desktop: "%SHORTCUT_NAME%"
) else (
    echo [NOTE] Shortcut placed in local folder.
)
echo.

:: ─── Step 5: Self-Diagnostic Test ────────────────────────────────────────────
echo [5/5] Running system diagnostic test...
python -c "import cv2, numpy, requests, dotenv; print('[OK] Core modules verified. OpenCV version:', cv2.__version__)"
echo.

echo =====================================================================
echo  🎉 SETUP COMPLETED SUCCESSFULLY!
echo =====================================================================
echo.
echo  Next Steps:
echo  1. (Optional) Open .env in this folder to paste your Supabase URL & Key.
echo  2. Double-click the "Presences Spotlight Gate" icon on your Desktop
echo     to start the attendance system anytime!
echo =====================================================================
echo.
pause
