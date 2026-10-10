# Run on Windows with powershell.exe or pwsh.exe:
#   powershell.exe -NoProfile -File tests/windows-downloads.ps1
# Network integration check: downloads public packages into a disposable folder,
# verifies their hashes, and never installs them or changes the user PATH.
param([string] $SiteRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$originalManifest = $env:ZAI_RELEASE_MANIFEST_URL
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('zai-download-test-' + [guid]::NewGuid().ToString('N'))

try {
    New-Item -ItemType Directory -Path $scratch -Force | Out-Null
    $env:ZAI_RELEASE_MANIFEST_URL = $null
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    foreach ($appId in @('zai-cli', 'zai-editor', 'zai-gitter', 'zai-codex')) {
        $script = Get-Content -LiteralPath (Join-Path $SiteRoot "install/$appId.ps1") -Raw -Encoding UTF8
        $tokens = $null
        $errors = $null
        $ast = [System.Management.Automation.Language.Parser]::ParseInput($script, [ref]$tokens, [ref]$errors)
        if ($errors.Count) { throw "$appId installer does not parse: $errors" }
        if ($appId -eq 'zai-codex') {
            # Codex uses Python's HTTPS downloader rather than Save-Download.
            if ($script -notmatch 'urllib.request') { throw 'Codex Python downloader missing' }
            Write-Host 'PASS: zai-codex wrapper parses (downloads use Python)'
            continue
        }
        # Load only the generated download helpers, without running installation.
        foreach ($name in @('Get-ZaiEnv', 'Save-Download')) {
            $function = $ast.Find({ param($node)
                $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
            }, $true)
            if (-not $function) { throw "$appId helper missing: $name" }
            Invoke-Expression $function.Extent.Text
        }
        function Stop-Install([string] $message) { throw $message }

        $manifestPath = Join-Path $scratch "$appId.json"
        Save-Download "https://phoenixzqy.github.io/releases/$appId/latest/manifest.json" $manifestPath
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $asset = @($manifest.release.assets | Where-Object {
            $_.platform -eq 'windows' -and $_.architecture -eq 'x64' -and $_.file -match '\.zip$'
        })
        if ($asset.Count -ne 1) { throw "$appId must have one Windows x64 ZIP" }
        $asset = $asset[0]
        $archive = Join-Path $scratch $asset.file
        # GitHub release URLs redirect to release-assets.githubusercontent.com.
        Save-Download $asset.url $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $asset.sha256) {
            throw "$appId download checksum mismatch"
        }
        if ((Get-Item -LiteralPath $archive).Length -ne $asset.bytes) {
            throw "$appId download size mismatch"
        }
        $rejected = $false
        try { Save-Download 'http://example.com/package.zip' (Join-Path $scratch 'unsafe.zip') }
        catch {
            if ($_.Exception.Message -notmatch 'refusing to download over a non-HTTPS URL') { throw }
            $rejected = $true
        }
        if (-not $rejected) { throw "$appId accepted plaintext HTTP" }
        Write-Host "PASS: $appId GitHub redirect, SHA-256, size, and HTTPS enforcement"
    }
} finally {
    $env:ZAI_RELEASE_MANIFEST_URL = $originalManifest
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
