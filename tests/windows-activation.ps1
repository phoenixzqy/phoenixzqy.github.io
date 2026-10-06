# Run on Windows with powershell.exe or pwsh.exe:
#   powershell.exe -NoProfile -File tests/windows-activation.ps1
# Uses disposable executables and process PATH only; never changes user PATH.
param([string] $SiteRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$originalPath = $env:Path
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('zai-activation-test-' + [guid]::NewGuid().ToString('N'))
$directory = Join-Path $scratch "space ' quote `$literal"
$cmd = Join-Path $env:SystemRoot 'System32\cmd.exe'

try {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    # Renamed copies of CMD provide real Windows executable lookup fixtures.
    foreach ($command in @('zai', 'zai-editor', 'zai-gitter')) {
        Copy-Item -LiteralPath $cmd -Destination (Join-Path $directory "$command.exe")
    }

    foreach ($appId in @('zai-cli', 'zai-editor', 'zai-gitter', 'zai-codex')) {
        $script = Get-Content -LiteralPath (Join-Path $SiteRoot "install/$appId.ps1") -Raw
        $tokens = $null
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseInput($script, [ref]$tokens, [ref]$errors)
        if ($errors.Count) { throw "$appId installer does not parse: $errors" }
        $match = [regex]::Match($script, '(?s)(function Show-Activation.*?)(?=\r?\n(?:\$architecture|\$python) =)')
        if (-not $match.Success) { throw "$appId activation helper missing" }
        $env:Path = $originalPath
        # Exercise the generated helper in Invoke-Expression's calling process.
        ($match.Groups[1].Value + "`nShow-Activation `$directory zai") | Invoke-Expression
        $expected = $directory + ';' + $originalPath
        if ($env:Path -cne $expected) { throw "$appId did not activate the current process PATH" }
        foreach ($command in @('zai', 'zai-editor', 'zai-gitter')) {
            $resolved = Get-Command $command -CommandType Application
            if ($resolved.Source -cne (Join-Path $directory "$command.exe")) {
                throw "$command resolves to the wrong executable"
            }
            $output = & $command /d /c "echo $command-powershell-fixture"
            if ($LASTEXITCODE -ne 0 -or $output -notcontains "$command-powershell-fixture") {
                throw "$command did not launch in PowerShell"
            }
            $output = & $cmd /d /c "$command /d /c echo $command-cmd-fixture"
            if ($LASTEXITCODE -ne 0 -or $output -notcontains "$command-cmd-fixture") {
                throw "$command did not launch in CMD with the inherited PATH"
            }
        }
        Show-Activation $directory zai
        if ($env:Path -cne $expected) { throw "$appId duplicated the PATH entry" }
        $env:Path = $directory.ToUpperInvariant() + '\;' + $originalPath
        $existing = $env:Path
        Show-Activation $directory zai
        if ($env:Path -cne $existing) { throw "$appId duplicated an equivalent Windows path" }
        $env:Path = ''
        Show-Activation $directory zai
        if ($env:Path -cne $directory) { throw "$appId failed to activate an empty PATH" }
        Write-Host "PASS: $appId activation and Windows command lookup"
    }
} finally {
    $env:Path = $originalPath
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
