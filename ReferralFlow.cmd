@echo off
rem Avvia ReferralFlow in locale e la apre in finestra dedicata.
cd /d "%~dp0"

rem Se il server non e' gia' attivo sulla porta 3000, avvialo in background.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 (
  start "ReferralFlow server" /min cmd /c "npm run dev"
  timeout /t 8 /nobreak >nul
)

rem Apri l'app in finestra propria (senza barra del browser).
start "" msedge --app=http://localhost:3000
