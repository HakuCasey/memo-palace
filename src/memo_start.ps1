$ErrorActionPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot

$port = if ($env:PORT) { $env:PORT } else { '5678' }

Write-Host "=== MemoPalace ===" -ForegroundColor Cyan
Write-Host "[1/3] Starting server on port $port..."

$server = Start-Process -FilePath "npx" -ArgumentList "tsx","server/index.ts" -PassThru -NoNewWindow

Write-Host "[2/3] Waiting for server..."
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:$port/api/status" -UseBasicParsing -TimeoutSec 2
        break
    } catch {}
}

npx tsx clients/cli/index.ts self-check
npx tsx clients/cli/index.ts status

Write-Host ""
Write-Host "[3/3] Starting Web Console..."
$web = Start-Process -FilePath "npm" -ArgumentList "run","dev" -WorkingDirectory (Join-Path $PSScriptRoot "web") -PassThru -NoNewWindow

Write-Host ""
Write-Host "Server:     http://localhost:$port (PID $($server.Id))" -ForegroundColor Green
Write-Host "Web Console: http://localhost:5173 (PID $($web.Id))" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Yellow

try {
    $server.WaitForExit()
} catch {
} finally {
    if (!$server.HasExited) {
        Write-Host "Stopping server (PID $($server.Id))..."
        Stop-Process -Id $server.Id -Force
    }
    if (!$web.HasExited) {
        Write-Host "Stopping Web Console (PID $($web.Id))..."
        Stop-Process -Id $web.Id -Force
    }
    Write-Host "Done."
}
