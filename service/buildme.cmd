@echo off

cd "%~dp0watchdog"
call npm prune --production --ignore-scripts

cd "%~dp0updater"
call npm prune --production --ignore-scripts