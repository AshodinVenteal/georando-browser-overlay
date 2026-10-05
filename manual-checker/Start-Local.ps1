$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$python = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {throw 'Run Setup-Local.ps1 first.'}
$env:UT_RUNTIME = Join-Path $taskRoot 'ut-runtime'
$env:UT_PLAYER_DIR = Join-Path $taskRoot 'private\players'
$env:SKIP_REQUIREMENTS_UPDATE = '1'
$env:UT_ALLOWED_ORIGINS = 'http://localhost:8000,http://127.0.0.1:8000'
$env:BIND_HOST = '127.0.0.1'
$env:PORT = '8765'
$stateFolder = Join-Path $taskRoot 'private'
New-Item -ItemType Directory -Force $stateFolder | Out-Null
foreach ($port in @(8000,8765)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {throw "Port $port is already in use. Check existing services before starting."}
}
$backend = Start-Process -FilePath $python -ArgumentList 'backend/server.py' -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateFolder 'backend.log') -RedirectStandardError (Join-Path $stateFolder 'backend-error.log')
$frontend = Start-Process -FilePath $python -ArgumentList '-m http.server 8000 --bind 127.0.0.1 --directory .' -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateFolder 'frontend.log') -RedirectStandardError (Join-Path $stateFolder 'frontend-error.log')
@{backend=$backend.Id;frontend=$frontend.Id} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateFolder 'local-processes.json')
Write-Output 'Checker: http://localhost:8000'
Write-Output 'Logic API: http://127.0.0.1:8765/health'
