$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot 'private\local-processes.json'
if (-not (Test-Path -LiteralPath $statePath)) {Write-Output 'No recorded local services.'; exit}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$python = (Resolve-Path (Join-Path $PSScriptRoot '.venv\Scripts\python.exe')).Path
foreach ($entry in @(@{id=$state.backend; match='backend/server.py'},@{id=$state.frontend;match='http.server 8000'})) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.id)" -ErrorAction SilentlyContinue
    if ($process -and $process.ExecutablePath -eq $python -and $process.CommandLine.Contains($entry.match)) {
        Stop-Process -Id $entry.id
    }
}
Write-Output 'Stopped recorded checker services if still running.'
