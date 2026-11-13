$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$env:HF_HUB_DOWNLOAD_TIMEOUT = '120'
$env:HF_HUB_ETAG_TIMEOUT = '60'
$statusPath = Join-Path $projectRoot '.local-ai-cache/model-status.json'
for ($attempt = 1; $attempt -le 5; $attempt++) {
    @{ state = 'downloading'; attempt = $attempt } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
    & ./.venv-local-ai/Scripts/python.exe scripts/local-transform.py --setup
    if ($LASTEXITCODE -eq 0) {
        Set-Content -LiteralPath '.local-ai-cache/ready' -Value 'instruct-pix2pix'
        @{ state = 'ready'; attempt = $attempt } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
        exit 0
    }
    if ($attempt -lt 5) { Start-Sleep -Seconds 15 }
}
@{ state = 'failed'; attempt = 5 } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
throw 'Model download failed after retries. See model-errors.log.'
