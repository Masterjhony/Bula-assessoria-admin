# Instala a Ponte Dev como tarefa nativa do Agendador do Windows.
# Por que assim: iniciar via wscript/.vbs no Startup dispara heuristica de
# antivirus (padrao de malware). Tarefa apontando pro watchdog, com reinicio
# automatico pelo proprio Windows, e o caminho limpo.
#
# 10/08/2026: a tarefa apontava direto pro node.exe e tinha gatilho SO no
# logon. Quando o processo morreu (09/08 18:23, exit 1067) a ponte ficou fora
# do ar por um dia inteiro e as tarefas pedidas no WhatsApp ficaram "pendente"
# pra sempre — o agente respondia "ja estou apurando" e nada rodava. Agora:
# gatilho no logon + repeticao a cada 5 min, chamando o watchdog (que sai
# calado se a ponte ja estiver de pe).
#
# Rodar como administrador (o instalador pede UAC).
$ErrorActionPreference = 'Stop'
$log = Join-Path $env:LOCALAPPDATA 'agente-dev-bridge-instalacao.log'
try {
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument '/c scripts\agente-dev-bridge-watchdog.cmd' -WorkingDirectory 'F:\Projetos\Desktop\web-bula'
    $tLogon = New-ScheduledTaskTrigger -AtLogOn
    $tRep = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -Hidden -MultipleInstances IgnoreNew -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
    Register-ScheduledTask -TaskName 'AgenteDevBridge' -Action $action -Trigger $tLogon, $tRep -Settings $settings -Description 'Ponte Dev do agente WhatsApp da Bula (watchdog + node, repo web-bula)' -Force | Out-Null

    # o launcher .vbs do Startup sai de cena (era o gatilho da heuristica)
    $vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'agente-dev-bridge.vbs'
    if (Test-Path $vbs) { Remove-Item $vbs -Force -Confirm:$false }

    Start-ScheduledTask -TaskName 'AgenteDevBridge'
    Start-Sleep -Seconds 8
    $estado = (Get-ScheduledTask -TaskName 'AgenteDevBridge').State
    $porta = Get-NetTCPConnection -LocalPort 47821 -State Listen -ErrorAction SilentlyContinue
    $msg = "OK | tarefa=$estado | porta47821=$(if ($porta) { 'ouvindo (pid ' + $porta.OwningProcess + ')' } else { 'SEM LISTENER' })"
    $msg | Out-File $log -Encoding utf8
    Write-Output $msg
} catch {
    "ERRO | $($_.Exception.Message)" | Out-File $log -Encoding utf8
    Write-Output "ERRO | $($_.Exception.Message)"
    exit 1
}
