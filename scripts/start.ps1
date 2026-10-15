$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path -Parent $nodePath) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) { throw 'No se encontró npm junto a Node.js. Reinstala Node.js LTS desde nodejs.org.' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
    & $nodePath $npmCli ci
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
}
& $nodePath 'scripts/dev.js'
