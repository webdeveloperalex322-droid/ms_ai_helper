param(
    [string]$Server = "root@89.111.152.241",
    [string]$Key = "$env:USERPROFILE\.ssh\mshelper_prod",
    [string]$RemoteDir = "/opt/ai-assistant"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "==> Building TypeScript..." -ForegroundColor Cyan
pnpm build

$tarPath = Join-Path $env:TEMP "aihelper_deploy.tar"
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

# .env.prod is deliberately absent from the archive: the real secrets live only
# in $RemoteDir/.env.prod on the server.
Write-Host "==> Packing deployment archive..." -ForegroundColor Cyan
& tar -cf $tarPath dist Dockerfile .dockerignore docker-compose.prod.yml package.json pnpm-lock.yaml docker src/database/migrations src/modules/admin/components

$sshArgs = @("-i", $Key, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes")

Write-Host "==> Uploading to server..." -ForegroundColor Cyan
& scp @sshArgs $tarPath "${Server}:${RemoteDir}/aihelper_deploy.tar"
& scp @sshArgs "$PSScriptRoot\remote-deploy.sh" "${Server}:${RemoteDir}/remote-deploy.sh"

Write-Host "==> Running deploy on server..." -ForegroundColor Cyan
& ssh @sshArgs $Server "bash $RemoteDir/remote-deploy.sh"

Write-Host "==> Deploy complete!" -ForegroundColor Green
Write-Host "    https://mshelper.al-developer.ru/v1/health"
Write-Host "    https://mshelper.al-developer.ru/v1/docs"
