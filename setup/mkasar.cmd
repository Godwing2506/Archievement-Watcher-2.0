@echo off
rem npm install -g asar
rem npm install -g json
cd "%~dp0"
rmdir "{{app}}\resources" /s /q
mkdir "{{app}}\resources"
rmdir ..\temp /s /q
mkdir ..\temp
rem Copy source app into temp and exclude build-only files and directories.
rem xcopy can fail on scoped package directories like @electron, so use robocopy for reliability.
robocopy ..\app ..\temp /MIR /COPY:DAT /R:1 /W:1 /XF runme.cmd "locale\README.md" /XD .git patches
if %ERRORLEVEL% GEQ 8 exit /b %ERRORLEVEL%
echo CLEANING FOR PRODUCTION
echo -----------------------
cd "..\temp\"
call json -I -f package.json -e "this.name='Achievement-Watcher'"
call npm prune --production
call json -I -f package.json -e "this.name='Achievement Watcher'"
if not exist "node_modules\@electron\remote\dist\src\common\get-electron-binding.js" (
  echo ERROR: @electron/remote is incomplete. Run npm install.cmd from the project root and rebuild.
  exit /b 1
)
echo PACKING TO ASAR
echo ---------------
call json -I -f package.json -e "this.config.debug=false"
cd "..\setup\{{app}}"
call asar pack ../../temp/ resources/app.asar --unpack {*.node,*.dll}
echo CLEANING TEMP
echo -------------
rmdir "..\..\temp\" /s /q