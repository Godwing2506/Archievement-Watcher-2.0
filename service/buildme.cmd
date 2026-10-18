@echo off

cd "%~dp0updater"
call npm prune --production --ignore-scripts