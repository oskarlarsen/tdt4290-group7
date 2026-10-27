$ErrorActionPreference = 'Stop'
$migration = Join-Path (Split-Path -Parent $PSScriptRoot) 'Migrate-LocalEnv.ps1'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('vehicle-env-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'backend'), (Join-Path $fixtureRoot 'frontend') | Out-Null
# All values below are synthetic, never developer credentials.
[IO.File]::WriteAllText((Join-Path $fixtureRoot '.env.example'), "JWT_SECRET=`nSEED_ADMIN_PASSWORD=`nSEED_SUPPLIER_PASSWORD=`nVITE_USE_MOCKS=true`n")
$backendSettings = 'SVV_API_KEY=''synthetic $value # literal''' + "`nSVV_CACHE_TTL_DAYS=30`n"
$frontendSettings = "VITE_USE_MOCKS=false`nVITE_API_BASE_URL=http://localhost:8080/api`n"
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'backend/.env'), $backendSettings)
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'frontend/.env'), $frontendSettings)
& $migration -RepositoryRoot $fixtureRoot | Out-Null
$rootContent = [IO.File]::ReadAllText((Join-Path $fixtureRoot '.env'))
if (-not $rootContent.Replace("`r`n", "`n").Contains($backendSettings.TrimEnd()) -or -not $rootContent.Contains('VITE_USE_MOCKS=false')) { throw 'Migration lost or changed synthetic settings.' }
if ((Test-Path -LiteralPath (Join-Path $fixtureRoot 'backend/.env')) -or (Test-Path -LiteralPath (Join-Path $fixtureRoot 'frontend/.env'))) { throw 'Legacy files were not moved.' }
$backup = Get-ChildItem -LiteralPath (Join-Path $fixtureRoot '.env-backups') -Directory | Select-Object -First 1
if ([IO.File]::ReadAllText((Join-Path $backup.FullName 'backend.env')) -cne $backendSettings) { throw 'Original backup differs.' }
& $migration -RepositoryRoot $fixtureRoot | Out-Null
if ([IO.File]::ReadAllText((Join-Path $fixtureRoot '.env')) -cne $rootContent) { throw 'Rerun changed root settings.' }
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'frontend/.env'), "VITE_USE_MOCKS=true`n")
$conflictDetected = $false
try { & $migration -RepositoryRoot $fixtureRoot | Out-Null } catch { $conflictDetected = $_.Exception.Message.Contains('Conflicting setting VITE_USE_MOCKS') }
if (-not $conflictDetected -or [IO.File]::ReadAllText((Join-Path $fixtureRoot '.env')) -cne $rootContent -or -not (Test-Path -LiteralPath (Join-Path $fixtureRoot 'frontend/.env'))) { throw 'Conflict must leave originals and root unchanged.' }
Write-Output 'Migration tests passed: literal preservation, backups, idempotence and conflict safety. Synthetic fixtures remain in the temporary directory.'
