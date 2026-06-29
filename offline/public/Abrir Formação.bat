@echo off
REM Abre a app em modo "app" (sem barra do browser) a partir desta pasta.
REM Funciona com Chrome ou Edge.

set "URL=file://%~dp0index.html"

where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --app="%URL%"
  exit /b
)

where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --app="%URL%"
  exit /b
)

REM Fallbacks: caminhos típicos de instalação
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  exit /b
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%"
  exit /b
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%URL%"
  exit /b
)

echo Nao foi possivel encontrar o Chrome nem o Edge. Abre o index.html manualmente.
pause
