@echo off
rem ReferralFlow - i referti PDF della prova da sforzo (CubeStress) arrivano al Mac dello studio.
rem Si COPIANO: gli originali restano su questo PC, dove li mette CubeStress.
rem La copia lavora NASCOSTA: nessuna finestra, nessuna icona. Riparte da sola a ogni accensione.
set "ORIG=%USERPROFILE%\Documents\Cubestress\report"
set "MAC=\\192.168.0.188\Ciclo da leggere"
set "DEST=%MAC%\referti"
set "REG=%MAC%\registro-collegamento.txt"
set "AVVIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%MAC%" (
  echo Non riesco a raggiungere la cartella del Mac:
  echo   %MAC%
  echo Controlla che il disco di rete sia collegato. Non ho cambiato niente.
  pause
  exit /b 1
)
rem Il registro NON contiene nomi di file ne' di pazienti: solo conteggi ed esiti.
> "%REG%" echo %DATE% %TIME% avvio utente=%USERNAME%
if not exist "%ORIG%" (
  >> "%REG%" echo cartella dei referti NON trovata in Documents\Cubestress\report
  echo Non trovo la cartella dei referti di CubeStress:
  echo   %ORIG%
  echo Non ho cambiato niente.
  pause
  exit /b 1
)
for /f %%n in ('dir /b /a-d "%ORIG%\*.pdf" 2^>nul ^| find /c /v ""') do set N=%%n
>> "%REG%" echo cartella dei referti trovata, pdf presenti=%N%
echo Copio i referti gia' presenti (%N%)...
robocopy "%ORIG%" "%DEST%" *.pdf /XO /R:2 /W:5 /NP /NJH /NDL /NFL >> "%REG%" 2>&1
>> "%REG%" echo esito prima copia=%ERRORLEVEL%
if exist "%AVVIO%\ReferralFlow-ciclo.bat" del "%AVVIO%\ReferralFlow-ciclo.bat"
> "%AVVIO%\ReferralFlow-ciclo.vbs" echo If WScript.Arguments.Count = 0 Then WScript.Sleep 60000
>> "%AVVIO%\ReferralFlow-ciclo.vbs" echo CreateObject("WScript.Shell").Run "robocopy ""%ORIG%"" ""%DEST%"" *.pdf /XO /MOT:1 /R:2 /W:10 /NP /NJH /NJS /NDL /NFL", 0, False
wscript "%AVVIO%\ReferralFlow-ciclo.vbs" subito
>> "%REG%" echo copia nascosta avviata, esito=%ERRORLEVEL%
if exist "%AVVIO%\ReferralFlow-ciclo.vbs" ( >> "%REG%" echo avvio automatico: presente ) else ( >> "%REG%" echo avvio automatico: NON scritto )
echo.
echo Fatto. I referti PDF di CubeStress vengono copiati sul Mac dello studio,
echo adesso e ogni volta che ne nasce uno nuovo. Non resta aperto niente:
echo la copia lavora nascosta e riparte da sola a ogni accensione del PC.
echo.
echo Per toglierla: doppio clic su "Scollega i referti della ciclo" nello stesso disco.
echo.
pause
