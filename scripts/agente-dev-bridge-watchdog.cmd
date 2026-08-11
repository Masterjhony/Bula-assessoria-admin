@echo off
rem Sobe a Ponte Dev se ela NAO estiver de pe. O Agendador do Windows chama
rem isto no logon E a cada 5 minutos: gatilho so-no-logon deixava a ponte
rem morta ate o proximo login (foi o que aconteceu em 09/08/2026).
rem Se a porta-trava 47821 ja esta ouvindo, sai calado — assim o log guarda
rem so o que interessa, em vez de "ja esta rodando" a cada ciclo.
cd /d F:\Projetos\Desktop\web-bula
netstat -ano | findstr /c:"LISTENING" | findstr /c:":47821" >nul
if not errorlevel 1 exit /b 0
echo [watchdog] %date% %time% ponte fora do ar, subindo >> "%LOCALAPPDATA%\agente-dev-bridge.log"
node scripts\agente-dev-bridge.mjs >> "%LOCALAPPDATA%\agente-dev-bridge.log" 2>&1
echo [watchdog] %date% %time% ponte caiu (exit %errorlevel%) >> "%LOCALAPPDATA%\agente-dev-bridge.log"
