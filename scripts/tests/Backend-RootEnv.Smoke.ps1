<# Run after backend/gradlew.bat installDist. Only synthetic records/configuration are used. #>
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$distribution = Join-Path $repoPath 'backend/build/install/backend/lib'
if (-not (Test-Path -LiteralPath $distribution)) { throw 'Run backend/gradlew.bat installDist first.' }
$javaPath = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { $null }
if (-not $javaPath -or -not (Test-Path -LiteralPath $javaPath)) { $javaPath = (Get-Command java -ErrorAction Stop).Source }
$fixtureRoot = Join-Path $repoPath ('backend/build/test-data/env-smoke-' + [guid]::NewGuid().ToString('N'))
$backendDirectory = Join-Path $fixtureRoot 'backend'
New-Item -ItemType Directory -Path $backendDirectory | Out-Null
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
# The fake checkout verifies default parent-root discovery, not an explicit override.
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'docker-compose.yml'), 'services: {}')
[IO.File]::WriteAllText((Join-Path $fixtureRoot '.env.example'), 'JWT_SECRET=')
[IO.File]::WriteAllLines((Join-Path $fixtureRoot '.env'), @(
    'JWT_SECRET=synthetic-smoke-signing-secret',
    'SEED_ADMIN_PASSWORD=synthetic-admin-password',
    'AUTH_COOKIE_SECURE=false',
    'CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000',
    'SVV_API_KEY=',
    'HOST=127.0.0.1',
    "PORT=$port",
    'DATABASE_PATH=synthetic-app.db'
))
$settings = @('BACKEND_ENV_FILE', 'JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'SEED_ADMIN_PASSWORD', 'AUTH_COOKIE_SECURE', 'CORS_ALLOWED_ORIGINS', 'SVV_API_KEY', 'SVV_CACHE_TTL_DAYS', 'HOST', 'PORT', 'DATABASE_PATH', 'APP_ENV', 'ALLOW_DEV_PASSWORD_RESET_LOG', 'TRUSTED_PROXY_HOPS')
$previous = @{}
$server = $null
try {
    foreach ($name in $settings) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    $server = Start-Process -FilePath $javaPath -ArgumentList @('-cp', ('"' + $distribution + '\*"'), 'com.tdt4290group7.backend.ApplicationKt') -WorkingDirectory $backendDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureRoot 'stdout.log') -RedirectStandardError (Join-Path $fixtureRoot 'stderr.log')
    $baseUrl = "http://127.0.0.1:$port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($server.HasExited) { throw 'Isolated server exited; inspect its synthetic logs locally.' }
        try { $ready = (Invoke-RestMethod "$baseUrl/health" -TimeoutSec 1).status -eq 'UP' } catch { $ready = $false }
        if ($ready) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Isolated server did not become ready.' }
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $login = Invoke-RestMethod "$baseUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body '{"email":"advisor.hansen@kommune.no","password":"synthetic-admin-password","rememberMe":false}' -WebSession $session
    if ($login.user.role -ne 'ADMIN') { throw 'Root-file credentials were not accepted.' }
    $me = Invoke-RestMethod "$baseUrl/api/auth/me" -WebSession $session
    if ($me.role -ne 'ADMIN' -and $me.user.role -ne 'ADMIN') { throw 'Session cookie did not authenticate.' }
    $vehicles = Invoke-RestMethod "$baseUrl/api/vehicles"
    if ($vehicles.total -ne 0) { throw 'Expected empty isolated vehicle database.' }
    $check = Invoke-RestMethod "$baseUrl/api/vehicle-checks" -Method Post -ContentType 'application/json' -Body '{"registrationNumber":"AB12345"}'
    if ($check.registry.lookupOutcome -ne 'NOT_CONFIGURED') { throw 'Isolated SVV must be disabled.' }
    foreach ($origin in @('http://localhost:5173', 'http://localhost:3000')) {
        $cors = Invoke-WebRequest "$baseUrl/health" -Headers @{ Origin = $origin } -UseBasicParsing
        if ($cors.Headers['Access-Control-Allow-Origin'] -ne $origin) { throw 'Root-file CORS settings were not applied.' }
    }
    Write-Output 'Root .env smoke passed: parent discovery, startup, login/cookie, isolated SQLite, disabled SVV and both CORS origins.'
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
