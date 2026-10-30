$version = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$swPath = Join-Path $PSScriptRoot 'sw.js'

if (-not (Test-Path $swPath)) {
    Write-Host "[FAIL] sw.js not found at $swPath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$content = [System.IO.File]::ReadAllText($swPath)
$content = $content -replace "const CACHE = 'list-[^']*';", "const CACHE = 'list-$version';"
[System.IO.File]::WriteAllText($swPath, $content, (New-Object System.Text.UTF8Encoding $false))
Write-Host "[OK] sw.js -> list-$version" -ForegroundColor Green
Write-Host ""

git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] git add failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "=== Staged changes ==="
git status --short
Write-Host ""

$msg = Read-Host "Commit message (Enter to abort)"
if ([string]::IsNullOrWhiteSpace($msg)) {
    Write-Host "[ABORT] Empty message. Nothing committed." -ForegroundColor Yellow
    exit 0
}

$tempFile = [System.IO.Path]::GetTempFileName()
try {
    [System.IO.File]::WriteAllText($tempFile, $msg, (New-Object System.Text.UTF8Encoding $false))
    git commit -F $tempFile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] git commit failed" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} finally {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] git push failed - commit is local, push manually" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[OK] Done: list-$version | $msg" -ForegroundColor Green
exit 0