@echo off
rem ReferralFlow - toglie la copia dei referti della ciclo verso il Mac. Non cancella nessun referto.
set "AVVIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%AVVIO%\ReferralFlow-ciclo.vbs" del "%AVVIO%\ReferralFlow-ciclo.vbs"
if exist "%AVVIO%\ReferralFlow-ciclo.bat" del "%AVVIO%\ReferralFlow-ciclo.bat"
taskkill /im robocopy.exe /f >nul 2>&1
echo.
echo Tolta. I referti restano dove sono, su questo PC e sul Mac: semplicemente non se ne copiano piu'.
echo.
pause
