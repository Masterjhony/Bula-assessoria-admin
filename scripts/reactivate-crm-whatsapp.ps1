$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverDir = Join-Path $projectRoot 'whatsapp-crm-server'
$logDir = Join-Path $projectRoot 'qa-screenshots'
$localStatusUrl = 'http://localhost:3001/status'
$adminStatusUrl = 'https://admin.bulaassessoria.com/api/whatsapp/status'

function Write-Step($message) {
    Write-Host "[crm-whatsapp] $message"
}

function Test-StatusHasQr($url, $timeoutSec = 8) {
    try {
        $res = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec $timeoutSec
        return ($res.StatusCode -eq 200 -and $res.Content -like '*data:image/png*')
    } catch {
        return $false
    }
}

function Get-CloudflaredPath {
    $dir = Join-Path $env:LOCALAPPDATA 'cloudflared'
    $exe = Join-Path $dir 'cloudflared.exe'

    if (-not (Test-Path $exe)) {
        Write-Step "baixando cloudflared..."
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Invoke-WebRequest `
            -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
            -OutFile $exe
    }

    return $exe
}

function Ensure-BaileysServer {
    if (Test-StatusHasQr $localStatusUrl) {
        Write-Step "Baileys local ja esta respondendo em $localStatusUrl"
        return
    }

    Write-Step "iniciando Baileys local..."
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
        Write-Step "instalando dependencias do servidor WhatsApp..."
        npm install --prefix $serverDir
    }

    $out = Join-Path $logDir 'crm-whatsapp-server.out.log'
    $err = Join-Path $logDir 'crm-whatsapp-server.err.log'
    Start-Process `
        -FilePath 'node' `
        -ArgumentList @('server.js') `
        -WorkingDirectory $serverDir `
        -RedirectStandardOutput $out `
        -RedirectStandardError $err `
        -WindowStyle Hidden | Out-Null

    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if (Test-StatusHasQr $localStatusUrl 5) {
            Write-Step "Baileys local ficou pronto."
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "Baileys local nao respondeu com QR em $localStatusUrl. Veja $out e $err."
}

function Start-QuickTunnel {
    Write-Step "reiniciando tunnel Cloudflare para localhost:3001..."
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*tunnel*--url*localhost:3001*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    $cloudflared = Get-CloudflaredPath
    $out = Join-Path $logDir 'cloudflared-crm.out.log'
    $err = Join-Path $logDir 'cloudflared-crm.err.log'
    Remove-Item -LiteralPath $out, $err -Force -ErrorAction SilentlyContinue

    Start-Process `
        -FilePath $cloudflared `
        -ArgumentList @('tunnel', '--url', 'http://localhost:3001', '--no-autoupdate') `
        -RedirectStandardOutput $out `
        -RedirectStandardError $err `
        -WindowStyle Hidden | Out-Null

    $deadline = (Get-Date).AddSeconds(45)
    $tunnelUrl = $null

    while ((Get-Date) -lt $deadline -and -not $tunnelUrl) {
        Start-Sleep -Seconds 2
        $text = ''
        if (Test-Path $out) { $text += Get-Content $out -Raw }
        if (Test-Path $err) { $text += Get-Content $err -Raw }
        $tunnelUrl = [regex]::Match($text, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com').Value
    }

    if (-not $tunnelUrl) {
        throw "Nao consegui localizar a URL do tunnel. Veja $out e $err."
    }

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if (Test-StatusHasQr "$tunnelUrl/status" 10) {
            Write-Step "tunnel pronto: $tunnelUrl"
            return $tunnelUrl
        }
        Start-Sleep -Seconds 2
    }

    throw "Tunnel foi criado ($tunnelUrl), mas nao respondeu com QR em /status."
}

function Publish-TunnelToVercel($tunnelUrl) {
    Write-Step "atualizando WHATSAPP_SERVER_URL na Vercel..."
    vercel env add WHATSAPP_SERVER_URL production --value $tunnelUrl --yes --force

    Write-Step "redeployando producao..."
    vercel deploy --prod --yes

    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
        if (Test-StatusHasQr $adminStatusUrl 20) {
            Write-Step "dominio pronto: $adminStatusUrl ja retorna QR."
            return
        }
        Start-Sleep -Seconds 5
    }

    throw "Deploy terminou, mas $adminStatusUrl ainda nao retornou QR."
}

Set-Location $projectRoot
Ensure-BaileysServer
$tunnelUrl = Start-QuickTunnel
Publish-TunnelToVercel $tunnelUrl

Write-Host ""
Write-Host "Pronto. Abra ou atualize:"
Write-Host "https://admin.bulaassessoria.com/sistema/crm?view=whatsapp"
