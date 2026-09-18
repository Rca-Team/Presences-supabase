@echo off
title Presences Spotlight AI — 1-Click Dependency Installer
color 0B
cls

echo =====================================================================
echo    PRESENCES SPOTLIGHT AI -- 1-CLICK DEPENDENCY INSTALLER
echo =====================================================================
echo.
echo Installing required Python libraries for high-speed edge attendance...
echo.

python -m pip install --upgrade pip
python -m pip install numpy opencv-python requests python-dotenv

echo.
echo Installing pre-compiled Windows face recognition binaries (dlib-bin)...
python -m pip install dlib-bin
python -m pip install --no-deps face_recognition

echo.
echo Verifying AI Face Recognition modules...
python -c "import cv2, numpy, dlib, face_recognition; print('[OK] Face recognition engine verified! dlib version:', dlib.__version__)"

echo.
echo =====================================================================
echo [SUCCESS] Dependencies installation completed without C++ compiler!
echo You can now run START_SPOTLIGHT.bat or click the desktop shortcut.
echo =====================================================================
echo.
pause
