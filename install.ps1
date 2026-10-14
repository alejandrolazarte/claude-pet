# Instalador de claude-pet: deja el plugin y la ventana flotante listos para usar en Claude Code.
# Se puede volver a correr para actualizar: saltea lo que ya está hecho.
param([switch] $NoPause)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$minimumClaude = [version]'2.1.293'
$app = Join-Path $env:LOCALAPPDATA 'claude-pet\app'
$characters = Join-Path $env:LOCALAPPDATA 'claude-pet\characters'

function Step($text) { Write-Host "`n> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  ok: $text" -ForegroundColor Green }
function Confirm-Step($question) { (Read-Host "  $question [S/n]") -notmatch '^\s*[nN]' }
function Stop-Install($text) {
    Write-Host "`n  $text" -ForegroundColor Red
    if (-not $NoPause) { Read-Host "`nEnter para cerrar" | Out-Null }
    exit 1
}
function Version-Of($exe) {
    $text = & $exe --version 2>$null | Out-String
    if ($text -match '(\d+\.\d+\.\d+)') { [version]$Matches[1] } else { $null }
}
function Install-WithWinget($id, $name) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Stop-Install "Falta $name y no hay winget para instalarlo. Instalalo a mano y volvé a correr el instalador."
    }
    winget install --id $id --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { Stop-Install "No se pudo instalar $name con winget." }
}

try {
    Step 'Claude Code'
    $candidates = @()
    $onPath = Get-Command claude -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }
    $candidates += Get-ChildItem (Join-Path $env:APPDATA 'Claude\claude-code\*\*\claude.exe') -ErrorAction SilentlyContinue | ForEach-Object FullName
    $claude = $candidates | ForEach-Object { [pscustomobject]@{ Path = $_; Version = (Version-Of $_) } } |
        Where-Object { $_.Version -and $_.Version -ge $minimumClaude } | Sort-Object Version -Descending | Select-Object -First 1
    if (-not $claude -and $onPath) {
        Write-Host "  El claude del PATH es $(Version-Of $onPath.Source); hace falta $minimumClaude o superior."
        if (Confirm-Step 'Actualizarlo con "claude update"?') {
            & $onPath.Source update
            $version = Version-Of $onPath.Source
            if ($version -and $version -ge $minimumClaude) { $claude = [pscustomobject]@{ Path = $onPath.Source; Version = $version } }
        }
    }
    if (-not $claude) { Stop-Install "Hace falta Claude Code $minimumClaude o superior (https://claude.com/claude-code)." }
    Ok "$($claude.Version) en $($claude.Path)"

    Step '.NET 10 Desktop Runtime'
    $runtimes = if (Get-Command dotnet -ErrorAction SilentlyContinue) { dotnet --list-runtimes 2>$null | Out-String } else { '' }
    if ($runtimes -notmatch 'Microsoft\.WindowsDesktop\.App 10\.') {
        if (-not (Confirm-Step 'No está instalado. Instalarlo con winget?')) { Stop-Install 'La ventana flotante necesita el .NET 10 Desktop Runtime.' }
        Install-WithWinget 'Microsoft.DotNet.DesktopRuntime.10' '.NET 10 Desktop Runtime'
    }
    Ok 'instalado'

    Step 'WebView2 Runtime'
    $webView2 = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    $hasWebView2 = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$webView2",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$webView2",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$webView2"
    ) | Where-Object { (Get-ItemProperty $_ -ErrorAction SilentlyContinue).pv } | Select-Object -First 1
    if (-not $hasWebView2) {
        if (-not (Confirm-Step 'No está instalado. Instalarlo con winget?')) { Stop-Install 'La ventana flotante necesita WebView2.' }
        Install-WithWinget 'Microsoft.EdgeWebView2Runtime' 'WebView2 Runtime'
    }
    Ok 'instalado'

    Step "Copiando el plugin a $app"
    if ((Resolve-Path $PSScriptRoot).Path -ne $app) {
        # The running window locks its exe; it reopens by itself with the next session.
        Get-Process PetOverlay -ErrorAction SilentlyContinue | Stop-Process -Force
        foreach ($folder in '.claude-plugin', 'plugin') {
            robocopy (Join-Path $PSScriptRoot $folder) (Join-Path $app $folder) /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { Stop-Install "No se pudo copiar $folder." }
        }
        Copy-Item (Join-Path $PSScriptRoot 'README.md') $app -Force
    }
    Ok 'copiado'

    Step 'Plugin pet@claude-pet'
    # Windows PowerShell hands ConvertFrom-Json's array down a pipe as one object; a variable enumerates it.
    $marketplaces = & $claude.Path plugin marketplace list --json 2>$null | Out-String | ConvertFrom-Json
    $marketplace = $marketplaces | Where-Object name -eq 'claude-pet'
    if ($marketplace) {
        Write-Host "  el marketplace claude-pet ya estaba registrado en $($marketplace.path)"
    }
    else {
        & $claude.Path plugin marketplace add $app
        if ($LASTEXITCODE -ne 0) { Stop-Install 'No se pudo registrar el marketplace claude-pet.' }
    }
    $installed = & $claude.Path plugin list --json 2>$null | Out-String | ConvertFrom-Json
    # Claude Code runs a cached copy taken at install time: updating means installing again.
    if ($installed | Where-Object id -eq 'pet@claude-pet') {
        & $claude.Path plugin uninstall pet@claude-pet --scope user
    }
    & $claude.Path plugin install pet@claude-pet --scope user
    if ($LASTEXITCODE -ne 0) { Stop-Install 'No se pudo instalar el plugin pet@claude-pet.' }
    Ok 'instalado'

    New-Item -ItemType Directory $characters -Force | Out-Null

    Write-Host "`nListo." -ForegroundColor Green
    Write-Host @"

  1. Reiniciá Claude Code (la app de escritorio o la terminal). Al abrir una sesión aparece la ventana flotante.
  2. Para agregar personajes, pedíselo a Claude Code, por ejemplo:
       "agregá un personaje con la imagen goku.png de Descargas"
     Acepta SVG, PNG, GIF, WebP, JPEG o un video WebM/MP4. Se eligen con clic derecho sobre el bicho > Personaje.
  3. Para desinstalar: claude plugin uninstall pet@claude-pet
"@
}
catch {
    Stop-Install "Error: $($_.Exception.Message)"
}

if (-not $NoPause) { Read-Host "`nEnter para cerrar" | Out-Null }
