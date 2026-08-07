@echo off
rem Ponte Dev do agente WhatsApp — iniciada no logon (Startup) ou manualmente.
rem Loop-watchdog: se o node cair, volta em 30s. A trava de porta (47821)
rem dentro da bridge impede instancia duplicada.
cd /d F:\Projetos\Desktop\web-bula
:loop
node scripts\agente-dev-bridge.mjs >> "%LOCALAPPDATA%\agente-dev-bridge.log" 2>&1
timeout /t 30 /nobreak >nul
goto loop
