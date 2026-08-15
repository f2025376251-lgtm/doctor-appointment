@echo off
cd /d "%~dp0"
set "PATH=%~dp0.tools\node;%PATH%"
if not exist "node_modules" (
  echo Installing packages...
  call "%~dp0.tools\node\npm.cmd" install
)
echo Starting Doctor Appointment at http://localhost:3000
"%~dp0.tools\node\node.exe" server.js
pause
