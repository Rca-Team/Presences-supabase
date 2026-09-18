@echo off
title Create Desktop Shortcut for Presences Spotlight
cls
echo Creating desktop shortcut for Presences Spotlight AI...

set SCRIPT_DIR=%~dp0
set TARGET_BAT=%SCRIPT_DIR%START_SPOTLIGHT.bat
set SHORTCUT_NAME=Presences Spotlight Gate.lnk
set DESKTOP_DIR=%USERPROFILE%\Desktop

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%DESKTOP_DIR%\%SHORTCUT_NAME%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Launch Presences Spotlight Gate Attendance Terminal'; $s.Save()"

if exist "%DESKTOP_DIR%\%SHORTCUT_NAME%" (
    echo.
    echo =====================================================================
    echo [SUCCESS] Shortcut "Presences Spotlight Gate" created on your Desktop!
    echo You can now simply double-click the icon on your desktop anytime!
    echo =====================================================================
) else (
    echo.
    echo [NOTE] Could not create shortcut automatically. You can right-click START_SPOTLIGHT.bat and select "Send to -> Desktop (create shortcut)".
)

echo.
