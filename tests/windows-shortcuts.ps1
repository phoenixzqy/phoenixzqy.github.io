# Run in Windows PowerShell 5.1 or PowerShell 7 with -NoProfile -File.
# Only disposable files and this process's environment are changed.
param([string] $SiteRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$originalPath = $env:Path
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('zai-shortcut-test-' + [guid]::NewGuid().ToString('N'))
$directory = Join-Path $scratch "space ' quote `$literal & test"
$cmd = Join-Path $env:SystemRoot 'System32\cmd.exe'
$testPath = Join-Path $env:SystemRoot 'System32'
$helper = Get-Content -LiteralPath (Join-Path $SiteRoot 'install/templates/shortcuts.ps1.in') -Raw

try {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    Push-Location $scratch
    $env:Path = $testPath
    $helper | Invoke-Expression
    foreach ($pair in @(@('ze', 'zai-editor'), @('zg', 'zai-gitter'))) {
        $name, $command = $pair
        Copy-Item -LiteralPath $cmd -Destination (Join-Path $directory "$command.exe")
        $launcher = Join-Path $directory "$name.cmd"
        Install-Shortcut $directory $name $command
        if (-not (Test-Path -LiteralPath $launcher)) { throw "$name was not created" }
        $bytes = [IO.File]::ReadAllBytes($launcher)
        Install-Shortcut $directory $name $command
        if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($launcher)) -cne [Convert]::ToBase64String($bytes)) {
            throw "$name changed on a repeat install"
        }
        $env:Path = $directory + ';' + $testPath
        $output = & $name /d /c "echo two words"
        if ($LASTEXITCODE -ne 0 -or $output -notcontains 'two words') { throw "$name failed in PowerShell" }
        & $name /d /c 'exit 7'
        if ($LASTEXITCODE -ne 7) { throw "$name lost the executable exit status" }
        $output = & $cmd /d /c "$name /d /c echo cmd-fixture"
        if ($LASTEXITCODE -ne 0 -or $output -notcontains 'cmd-fixture') { throw "$name failed in CMD" }
        $env:Path = $testPath
        Remove-Item -LiteralPath $launcher

        # Functions and aliases in the calling PowerShell session are taken.
        Set-Item -Path "Function:$name" -Value { 'existing-function' }
        Install-Shortcut $directory $name $command
        if (Test-Path -LiteralPath $launcher) { throw "$name replaced a function" }
        Remove-Item -Path "Function:$name"
        Set-Alias -Name $name -Value Get-Date
        Install-Shortcut $directory $name $command
        if (Test-Path -LiteralPath $launcher) { throw "$name replaced an alias" }
        Remove-Item -Path "Alias:$name"

        # Check files both on PATH and inside the not-yet-activated install directory.
        Copy-Item -LiteralPath $cmd -Destination (Join-Path $scratch "$name.exe")
        $env:Path = $scratch + ';' + $testPath
        Install-Shortcut $directory $name $command
        if (Test-Path -LiteralPath $launcher) { throw "$name shadowed another PATH executable" }
        $env:Path = $testPath
        Install-Shortcut $directory $name $command
        if (Test-Path -LiteralPath $launcher) { throw "$name shadowed a CMD current-directory executable" }
        Remove-Item -LiteralPath (Join-Path $scratch "$name.exe")
        Copy-Item -LiteralPath $cmd -Destination (Join-Path $directory "$name.exe")
        Install-Shortcut $directory $name $command
        if (Test-Path -LiteralPath $launcher) { throw "$name shadowed an install-directory executable" }
        Remove-Item -LiteralPath (Join-Path $directory "$name.exe")
        [IO.File]::WriteAllText($launcher, 'unrelated launcher')
        Install-Shortcut $directory $name $command
        if ([IO.File]::ReadAllText($launcher) -cne 'unrelated launcher') { throw "$name overwrote an unrelated launcher" }
        Remove-Item -LiteralPath $launcher
        Write-Host "PASS: $name Windows launcher and collision checks"
    }
    if (Test-Path -LiteralPath (Join-Path $directory 'z.cmd')) { throw 'Unexpected z shortcut' }
} finally {
    $env:Path = $originalPath
    Pop-Location
    if (Test-Path -LiteralPath $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
