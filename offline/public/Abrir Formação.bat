@echo off
REM Sobe um mini servidor HTTP em PowerShell na pasta atual e abre o Chrome/Edge
REM em modo "app". Necessario porque a File System Access API e os ES modules
REM nao funcionam quando se abre o index.html como file://.

setlocal
set "ROOT=%~dp0"
set "PORT=5180"

REM ---- arranca o servidor em background (janela minimizada) -----------------
start "FormacaoER-server" /min powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root='%ROOT%'; $port=%PORT%; Add-Type -AssemblyName System.Web; $l=New-Object System.Net.HttpListener; $l.Prefixes.Add(\"http://localhost:$port/\"); $l.Start(); $mt=@{'.html'='text/html';'.js'='application/javascript';'.mjs'='application/javascript';'.css'='text/css';'.json'='application/json';'.wasm'='application/wasm';'.svg'='image/svg+xml';'.png'='image/png';'.jpg'='image/jpeg';'.ico'='image/x-icon';'.woff2'='font/woff2';'.woff'='font/woff';'.ttf'='font/ttf'}; while($l.IsListening){ try { $c=$l.GetContext(); $p=[System.Web.HttpUtility]::UrlDecode($c.Request.Url.AbsolutePath); if($p -eq '/' -or $p -eq ''){$p='/index.html'}; $f=Join-Path $root ($p.TrimStart('/').Replace('/','\\')); if(Test-Path $f -PathType Leaf){ $ext=[IO.Path]::GetExtension($f).ToLower(); $ct=$mt[$ext]; if(-not $ct){$ct='application/octet-stream'}; $b=[IO.File]::ReadAllBytes($f); $c.Response.ContentType=$ct; $c.Response.ContentLength64=$b.Length; $c.Response.OutputStream.Write($b,0,$b.Length); } else { $b=[IO.File]::ReadAllBytes((Join-Path $root 'index.html')); $c.Response.ContentType='text/html'; $c.Response.ContentLength64=$b.Length; $c.Response.OutputStream.Write($b,0,$b.Length); } $c.Response.OutputStream.Close(); } catch {} }"

REM ---- espera que o porto responda ----------------------------------------
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%PORT%/' -TimeoutSec 1; if($r.StatusCode){break}}catch{Start-Sleep -Milliseconds 150}}" >nul 2>nul

set "URL=http://localhost:%PORT%/"

where chrome >nul 2>nul && ( start "" chrome --app="%URL%" & goto :eof )
where msedge >nul 2>nul && ( start "" msedge --app="%URL%" & goto :eof )

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" ( start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%URL%" & goto :eof )
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" ( start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%" & goto :eof )
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" ( start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%URL%" & goto :eof )

echo Nao encontrei o Chrome nem o Edge. Abre manualmente: %URL%
pause
