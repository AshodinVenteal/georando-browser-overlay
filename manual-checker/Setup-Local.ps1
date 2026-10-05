$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$runtime = Join-Path $taskRoot 'ut-runtime'
if (-not (Test-Path -LiteralPath $runtime)) {
    git clone --branch tracker https://github.com/FarisTheAncient/Archipelago.git $runtime
    if ($LASTEXITCODE -ne 0) {throw 'Unable to download UT.'}
    git -C $runtime checkout --detach 1d76dabab604c47ba84b4cd20d495de04b744618
    if ($LASTEXITCODE -ne 0) {throw 'Unable to select the tested UT version.'}
}
$python = Join-Path $taskRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {py -3.12 -m venv (Join-Path $taskRoot '.venv')}
& $python -m pip install -r (Join-Path $taskRoot 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) {throw 'Unable to install Python packages.'}
$players = Join-Path $taskRoot 'private\players'
New-Item -ItemType Directory -Force $players | Out-Null
Write-Output "Install matching APWorlds in $runtime\custom_worlds and original player YAMLs in $players"
