<#
Move legacy service .env settings into root .env without displaying values.
Conflicts stop before writes. Originals are kept in ignored .env-backups/.
#>
[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath $RepositoryRoot).Path.TrimEnd('\', '/')
function Assert-WithinRepository([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    if (-not $absolute.StartsWith($repoPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Migration target is outside the repository.'
    }
    return $absolute
}
function Read-Settings([string]$Path) {
    $settings = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return ,$settings }
    $lineNumber = 0
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $lineNumber++
        if ($line.Trim() -eq '' -or $line.TrimStart().StartsWith('#')) { continue }
        if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            throw "Unsupported single-line setting in $(Split-Path -Leaf $Path), line $lineNumber. No files were moved."
        }
        $key = $Matches[1]
        $raw = $Matches[2].Trim()
        if ($settings.Contains($key) -and $settings[$key] -cne $raw) {
            throw "Conflicting duplicate key $key. No files were moved."
        }
        $settings[$key] = $raw
    }
    return ,$settings
}

$templatePath = Assert-WithinRepository (Join-Path $repoPath '.env.example')
if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) { throw 'Root .env.example is missing.' }
$rootFile = Assert-WithinRepository (Join-Path $repoPath '.env')
$legacyFiles = @(
    (Assert-WithinRepository (Join-Path $repoPath 'backend/.env')),
    (Assert-WithinRepository (Join-Path $repoPath 'frontend/.env'))
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
if ($legacyFiles.Count -eq 0 -and (Test-Path -LiteralPath $rootFile -PathType Leaf)) {
    Write-Output 'Root .env already exists; no legacy files to move.'
    return
}

$merged = Read-Settings $rootFile
foreach ($file in $legacyFiles) {
    $settings = Read-Settings $file
    foreach ($key in $settings.Keys) {
        if ($merged.Contains($key) -and $merged[$key] -ne '' -and $settings[$key] -ne '' -and $merged[$key] -cne $settings[$key]) {
            throw "Conflicting setting $key. Resolve it privately before retrying; no files were moved."
        }
        if (-not $merged.Contains($key) -or $merged[$key] -eq '') { $merged[$key] = $settings[$key] }
    }
}

$baseFile = if (Test-Path -LiteralPath $rootFile -PathType Leaf) { $rootFile } else { $templatePath }
$seen = @{}
$lines = foreach ($line in [IO.File]::ReadAllLines($baseFile)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
        $key = $Matches[1]
        $seen[$key] = $true
        if ($merged.Contains($key)) { "$key=$($merged[$key])" } else { $line }
    } else { $line }
}
foreach ($key in $merged.Keys) {
    if (-not $seen.ContainsKey($key)) { $lines += "$key=$($merged[$key])" }
}

$backupPath = Assert-WithinRepository (Join-Path $repoPath ('.env-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')))
$temporaryFile = Assert-WithinRepository (Join-Path $repoPath ('.env.migration-' + [guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
$originals = @($legacyFiles)
if (Test-Path -LiteralPath $rootFile -PathType Leaf) { $originals += $rootFile }
foreach ($file in $originals) {
    $name = if ($file -eq $rootFile) { 'root.env' } else { (Split-Path -Leaf (Split-Path -Parent $file)) + '.env' }
    $backupFile = Assert-WithinRepository (Join-Path $backupPath $name)
    Copy-Item -LiteralPath $file -Destination $backupFile
    if ((Get-FileHash -LiteralPath $file).Hash -ne (Get-FileHash -LiteralPath $backupFile).Hash) {
        throw 'Backup verification failed; originals were not removed.'
    }
}
[IO.File]::WriteAllLines($temporaryFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false))
$verified = Read-Settings $temporaryFile
foreach ($key in $merged.Keys) {
    if (-not $verified.Contains($key) -or $verified[$key] -cne $merged[$key]) {
        throw "Verification failed for $key; originals were not removed."
    }
}
Move-Item -LiteralPath $temporaryFile -Destination $rootFile -Force
$verified = Read-Settings $rootFile
foreach ($key in $merged.Keys) {
    if (-not $verified.Contains($key) -or $verified[$key] -cne $merged[$key]) {
        throw "Root verification failed for $key; originals remain in their backup directory."
    }
}
foreach ($file in $legacyFiles) { Remove-Item -LiteralPath $file }
Write-Output "Moved $($legacyFiles.Count) legacy files into root .env; original copies: $backupPath"
foreach ($key in @('JWT_SECRET', 'SEED_ADMIN_PASSWORD', 'SEED_SUPPLIER_PASSWORD')) {
    if (-not $verified.Contains($key) -or $verified[$key] -in @('', "''", '""')) { Write-Output "Fill required setting privately: $key" }
}
