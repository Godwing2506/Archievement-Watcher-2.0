@echo off
rem npm install -g asar
rem npm install -g json
cd "%~dp0"
rmdir "{{app}}\resources" /s /q 2>nul
mkdir "{{app}}\resources"
rmdir ..\temp /s /q 2>nul
mkdir ..\temp
rem Copy source app into temp and exclude build-only files and directories.
rem /MT:8 usa 8 hilos para copiar más rápido en discos SSD/NVMe
robocopy ..\app ..\temp /MIR /COPY:DAT /R:1 /W:1 /MT:8 /XF runme.cmd "locale\README.md" /XD .git patches
if %ERRORLEVEL% GEQ 8 exit /b %ERRORLEVEL%
echo CLEANING FOR PRODUCTION
echo -----------------------
cd "..\temp\"

rem Use inline Node scripts instead of the external 'json' CLI tool.
call node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.name='Achievement-Watcher';fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

call npm prune --production --no-audit --ignore-scripts 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo WARN: npm prune encountered issues ^(EPERM is common on Windows^). Continuing with full node_modules.
)

call node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.name='Achievement Watcher';fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

if not exist "node_modules\@electron\remote\dist\src\common\get-electron-binding.js" (
  echo ERROR: @electron/remote is incomplete ^(missing get-electron-binding.js^). Run npm install.cmd from the project root and rebuild.
  exit /b 1
)
if not exist "node_modules\@electron\remote\dist\src\renderer\callbacks-registry.js" (
  echo ERROR: @electron/remote is incomplete ^(missing callbacks-registry.js^). Run npm install.cmd from the project root and rebuild.
  exit /b 1
)
if not exist "resources\font\fontawesome\fa-solid-900.woff2" (
  echo ERROR: Font Awesome webfonts are missing. Copy fa-*.woff2 into app\resources\font\fontawesome\ and rebuild.
  exit /b 1
)
if not exist "util\aes.js" (
  echo ERROR: util\aes.js is missing. Restore it before building the installer.
  exit /b 1
)

echo PACKING TO ASAR
echo ---------------
call node -e "const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json','utf8'));p.config.debug=false;fs.writeFileSync('package.json',JSON.stringify(p,null,2));"
cd "..\setup\{{app}}"
call "..\..\app\node_modules\.bin\asar.cmd" pack ../../temp/ resources/app.asar --unpack "{*.node,*.dll}"
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: asar pack failed.
  exit /b 1
)
echo CLEANING TEMP
echo -------------
rmdir "..\..\temp\" /s /q 2>nul
