# Instala a Ponte Dev como tarefa nativa do Agendador do Windows.
# Por que assim: iniciar via wscript/.vbs no Startup dispara heuristica de
# antivirus (padrao de malware). Tarefa apontando DIRETO pro node.exe, com
# reinicio automatico em falha pelo proprio Windows, e o caminho limpo.
# Rodar como administrador (o instalador pede UAC).
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:LOCALAPPDATA 'agente-dev-bridge-instalacao.log'
try {
    $node = (Get-Command node).Source
    $action = New-ScheduledTaskAction -Execute $node -Argument 'scripts\agente-dev-bridge.mjs' -WorkingDirectory 'F:\Projetos\Desktop\web-bula'
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -Hidden
    Register-ScheduledTask -TaskName 'AgenteDevBridge' -Action $action -Trigger $trigger -Settings $settings -Description 'Ponte Dev do agente WhatsApp da Bula (node, repo web-bula)' -Force | Out-Null

    # derruba a instancia antiga (loop do .cmd) pra tarefa assumir
    $conn = Get-NetTCPConnection -LocalPort 47821 -State Listen -ErrorAction SilentlyContinue
    if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -Confirm:$false }
    # o launcher .vbs do Startup sai de cena (era o gatilho da heuristica)
    $vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'agente-dev-bridge.vbs'
    if (Test-Path $vbs) { Remove-Item $vbs -Force -Confirm:$false }

    Start-ScheduledTask -TaskName 'AgenteDevBridge'
    Start-Sleep -Seconds 6
    $estado = (Get-ScheduledTask -TaskName 'AgenteDevBridge').State
    $porta = Get-NetTCPConnection -LocalPort 47821 -State Listen -ErrorAction SilentlyContinue
    "OK | tarefa=$estado | porta47821=$(if ($porta) { 'ouvindo (pid ' + $porta.OwningProcess + ')' } else { 'SEM LISTENER' })" | Out-File $log -Encoding utf8
} catch {
    "ERRO | $($_.Exception.Message)" | Out-File $log -Encoding utf8
    exit 1
}
