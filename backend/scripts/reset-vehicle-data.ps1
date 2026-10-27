param([string]$DatabasePath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'data\vehicles.db'))

$ErrorActionPreference = 'Stop'
$backendRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$dataRoot = [IO.Path]::GetFullPath((Join-Path $backendRoot 'data')) + [IO.Path]::DirectorySeparatorChar
$target = [IO.Path]::GetFullPath($DatabasePath)
if (-not $target.StartsWith($dataRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($target) -ne '.db') {
    throw 'Reset is restricted to an explicitly selected .db file inside backend/data.'
}
# Stop the backend before running. Only this vehicle database and its SQLite sidecars are reset.
foreach ($file in @($target, "$target-wal", "$target-shm", "$target-journal")) {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}
Write-Output "Vehicle data reset: $target"
