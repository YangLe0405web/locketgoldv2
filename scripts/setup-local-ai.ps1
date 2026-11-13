$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Force '.local-ai-temp', '.local-ai-cache' | Out-Null
$env:TEMP = Join-Path $projectRoot '.local-ai-temp'
$env:TMP = $env:TEMP
if (-not (Test-Path '.venv-local-ai/Scripts/python.exe')) {
    python -m venv .venv-local-ai
    if ($LASTEXITCODE) { throw 'Cannot create Python environment' }
}
$torchWheel = Join-Path $projectRoot '.local-ai-temp/torch-2.6.0+cu124-cp311-cp311-win_amd64.whl'
if (-not (Test-Path $torchWheel) -or (Get-Item $torchWheel).Length -ne 2532350702) {
    Write-Output 'Downloading PyTorch GPU (2.5 GB), resuming previous download...'
    curl.exe -L --fail --retry 5 --retry-delay 5 --max-time 10800 -C - --output $torchWheel 'https://download.pytorch.org/whl/cu124/torch-2.6.0%2Bcu124-cp311-cp311-win_amd64.whl'
    if ($LASTEXITCODE) { throw 'GPU download interrupted. Run setup again to resume.' }
}
& ./.venv-local-ai/Scripts/python.exe -m pip install --no-cache-dir $torchWheel
if ($LASTEXITCODE) { throw 'Cannot install PyTorch' }
& ./.venv-local-ai/Scripts/python.exe -m pip install --no-cache-dir torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
if ($LASTEXITCODE) { throw 'Cannot install torchvision' }
& ./.venv-local-ai/Scripts/python.exe -m pip install --no-cache-dir -r scripts/requirements-local-ai.txt
if ($LASTEXITCODE) { throw 'Cannot install image editing dependencies' }
& ./.venv-local-ai/Scripts/python.exe scripts/local-transform.py --setup
if ($LASTEXITCODE) { throw 'Cannot download local image model' }
Set-Content -LiteralPath '.local-ai-cache/ready' -Value 'instruct-pix2pix'
