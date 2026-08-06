@echo off
rem Ponte Dev do agente WhatsApp — iniciada no logon (Startup) ou manualmente.
cd /d F:\Projetos\Desktop\web-bula
node scripts\agente-dev-bridge.mjs >> "%LOCALAPPDATA%\agente-dev-bridge.log" 2>&1
