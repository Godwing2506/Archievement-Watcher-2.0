@echo off
setlocal EnableDelayedExpansion

echo Building service
echo ================
call "%~dp0service\buildme.cmd"
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Service build failed.
  exit /b 1
)

echo Building Setup
echo ==============
call "%~dp0setup\rcedit\rcedit.cmd"
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: rcedit failed.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\prepare_watchdog.ps1"
if %ERRORLEVEL% NEQ 0 (
  echo WARN: prepare_watchdog.ps1 returned an error. Continuing anyway...
)

call "%~dp0setup\mkasar.cmd"
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: ASAR packaging failed.
  exit /b 1
)

echo COMPILE SETUP
echo -------------

rem Cerrar instancias previas para evitar bloqueo del .exe de salida (error 110 de Inno Setup)
echo Cerrando instancias previas de AchievementWatcher...
taskkill /f /im AchievementWatcher.exe >nul 2>&1
taskkill /f /im node.exe /t >nul 2>&1
ping -n 2 127.0.0.1 >nul

rem Search for Inno Setup compiler in common locations
set "ISCC="
set "ISCC_CANDIDATES[0]=C:\Program Files (x86)\Inno Setup 6\iscc.exe"
set "ISCC_CANDIDATES[1]=C:\Program Files\Inno Setup 6\iscc.exe"
set "ISCC_CANDIDATES[2]=C:\Program Files (x86)\Inno Setup 5\iscc.exe"
set "ISCC_CANDIDATES[3]=C:\Program Files\Inno Setup 5\iscc.exe"

for /L %%i in (0,1,3) do (
  if exist "!ISCC_CANDIDATES[%%i]!" (
    set "ISCC=!ISCC_CANDIDATES[%%i]!"
    goto :found_iscc
  )
)

rem Also check PATH
for %%p in (iscc.exe) do (
  if not "%%~$PATH:p"=="" (
    set "ISCC=%%~$PATH:p"
    goto :found_iscc
  )
)

echo ERROR: Inno Setup compiler ^(iscc.exe^) not found.
echo Please install Inno Setup 6 from https://jrsoftware.org/isdl.php
echo After installation, make sure iscc.exe is in one of the standard paths or in your PATH.
exit /b 1

:found_iscc
echo Found Inno Setup compiler: !ISCC!
"!ISCC!" "%~dp0setup\AchievementWatcher.iss"
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Installer compilation failed.
  exit /b 1
)

echo.
echo BUILD SUCCESSFUL
echo Output should be in setup\_dist_\
endlocal
PAUSE
