# Public one-line installer for the zai CLI on Windows.
#
#   irm https://phoenixzqy.github.io/install/zai-cli.ps1 | iex
#
# All work happens inside a function that is only invoked on the final line, so
# a truncated download defines the function and does nothing, and the caller's
# variables and preferences are never changed.
#
# The installer reads the published release manifest, downloads the archive for
# this machine into the system temporary directory, verifies its SHA-256 before
# using it, and runs the package installer bundled in the archive. Every
# download is removed on success and on failure. Arguments are forwarded to the
# bundled installer; ZAI_INSTALL_DIR selects the install directory when
# -InstallerArguments does not already contain --install-dir. Pass an option and
# its value as separate arguments: PowerShell's own command line parser reads
# -name:value as parameter binding and splits a joined argument at its colon
# before the script ever sees it.

function Install-ZaiCli {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $InstallerArguments
    )

    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'

    $appId = 'zai-cli'
    $releasePrefix = 'https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/'
    $defaultManifest = 'https://phoenixzqy.github.io/releases/zai-cli/latest/manifest.json'
    $manifestUrl = if ($env:ZAI_RELEASE_METADATA_URL) { $env:ZAI_RELEASE_METADATA_URL } else { $defaultManifest }
    $allowPlainHttp = [bool] $env:ZAI_RELEASE_METADATA_URL

    # Windows PowerShell 5.1 still negotiates TLS 1.0 by default, which the
    # release hosts reject.
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch {
        Write-Verbose 'Could not raise the TLS version; using the process default.'
    }

    $python = $null
    foreach ($candidate in 'python', 'python3', 'py') {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { $python = $command.Source; break }
    }
    if (-not $python) {
        throw 'zai installer: Python 3.10 or newer is required but was not found.'
    }

    function Assert-ZaiCliUrl {
        param([string] $Url, [bool] $AllowPlainHttp)
        $parsed = $null
        if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref] $parsed)) {
            throw "zai installer: not a usable download address: $Url"
        }
        if ($parsed.Scheme -ne 'https' -and
            ($parsed.Scheme -ne 'http' -or -not $AllowPlainHttp -or $parsed.Host -ne '127.0.0.1') -or
            $parsed.UserInfo) {
            throw "zai installer: downloads must use HTTPS: $Url"
        }
        return $parsed
    }

    function Get-ZaiCliDownload {
        param([Uri] $Uri, [string] $Path, [bool] $AllowPlainHttp, [string[]] $AllowedHosts)
        for ($hop = 0; $hop -le 10; $hop++) {
            $Uri = Assert-ZaiCliUrl -Url $Uri.AbsoluteUri -AllowPlainHttp $AllowPlainHttp
            if ($AllowedHosts -notcontains $Uri.Host) {
                throw "zai installer: download redirected to an untrusted host: $Uri"
            }
            try {
                Invoke-WebRequest -Uri $Uri -OutFile $Path -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop | Out-Null
                return
            } catch {
                $response = $_.Exception.Response
                if (-not $response -or [int] $response.StatusCode -lt 300 -or [int] $response.StatusCode -ge 400) {
                    throw
                }
                $location = if ($response.Headers -is [System.Net.WebHeaderCollection]) {
                    $response.Headers['Location']
                } else {
                    $response.Headers.Location
                }
                if (-not $location) { throw 'zai installer: download redirect has no location.' }
                $Uri = [Uri]::new($Uri, [string] $location)
                $AllowPlainHttp = $false
            }
        }
        throw 'zai installer: too many download redirects.'
    }

    function Get-ZaiCliAsset {
        param($Manifest, [string] $AppId, [string] $Platform, [string] $Architecture, [Uri] $ManifestUri)
        if (-not $Manifest -or $Manifest.schemaVersion -ne 1) {
            throw 'zai installer: unsupported release manifest schema.'
        }
        if ($Manifest.appId -ne $AppId) {
            throw 'zai installer: the release manifest describes another application.'
        }
        if ($null -eq $Manifest.release) {
            throw 'zai installer: no public release has been published yet.'
        }
        $asset = @($Manifest.release.assets) | Where-Object {
            $_.platform -eq $Platform -and $_.architecture -eq $Architecture
        } | Select-Object -First 1
        if (-not $asset) {
            throw "zai installer: no published package for $Platform $Architecture in this release."
        }
        if ($asset.file -notmatch '^[A-Za-z0-9][A-Za-z0-9._+-]*\.zip$') {
            throw 'zai installer: the release manifest names an unsafe package file.'
        }
        if ($asset.sha256 -notmatch '^[a-f0-9]{64}$') {
            throw 'zai installer: the release manifest has no usable SHA-256 for this package.'
        }
        if ($null -eq $asset.url) {
            $url = [Uri]::new($ManifestUri, [Uri]::EscapeDataString($asset.file)).AbsoluteUri
        } else {
            $url = [string] $asset.url
            if (-not $url.StartsWith($releasePrefix, [StringComparison]::Ordinal)) {
                throw "zai installer: packages must be served from this project's public release downloads."
            }
            $segments = $url.Substring($releasePrefix.Length).Split('/')
            if ($segments.Count -ne 2 -or $url.Contains('?') -or $url.Contains('#') -or
                [Uri]::UnescapeDataString($segments[1]) -ne $asset.file) {
                throw 'zai installer: the release download URL does not match this package.'
            }
        }
        return [pscustomobject]@{
            File    = [string] $asset.file
            Url     = $url
            Sha256  = ([string] $asset.sha256).ToLowerInvariant()
            Version = [string] $Manifest.release.version
        }
    }

    $architecture = switch (($env:PROCESSOR_ARCHITEW6432, $env:PROCESSOR_ARCHITECTURE | Where-Object { $_ } | Select-Object -First 1)) {
        'AMD64' { 'x64' }
        'ARM64' { 'arm64' }
        'x86'   { throw 'zai installer: no published package for 32-bit Windows.' }
        default { throw "zai installer: no published package for this architecture: $_" }
    }

    $work = Join-Path ([System.IO.Path]::GetTempPath()) ('zai-cli-install-' + [Guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    try {
        $manifestUri = Assert-ZaiCliUrl -Url $manifestUrl -AllowPlainHttp $allowPlainHttp
        Write-Host "Reading $manifestUrl"
        $manifestPath = Join-Path $work 'manifest.json'
        Get-ZaiCliDownload -Uri $manifestUri -Path $manifestPath -AllowPlainHttp $allowPlainHttp `
            -AllowedHosts @($manifestUri.Host)
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

        $selected = Get-ZaiCliAsset -Manifest $manifest -AppId $appId -Platform 'windows' `
            -Architecture $architecture -ManifestUri $manifestUri
        $downloadUri = Assert-ZaiCliUrl -Url $selected.Url -AllowPlainHttp $allowPlainHttp

        Write-Host "Downloading $appId $($selected.Version) ($($selected.File))"
        $archive = Join-Path $work $selected.File
        $assetHosts = if ($downloadUri.Host -eq 'github.com') {
            @('github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com')
        } else { @($downloadUri.Host) }
        Get-ZaiCliDownload -Uri $downloadUri -Path $archive -AllowPlainHttp $allowPlainHttp `
            -AllowedHosts $assetHosts

        $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $selected.Sha256) {
            throw ("zai installer: checksum mismatch: the download does not match the published " +
                "SHA-256. Expected $($selected.Sha256), got $actual.")
        }

        $package = Join-Path $work 'package'
        Expand-Archive -LiteralPath $archive -DestinationPath $package -Force
        $entry = Join-Path $package 'install.py'
        if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
            throw 'zai installer: the release archive does not contain install.py.'
        }

        $forwarded = @($InstallerArguments | Where-Object { $null -ne $_ })
        $hasInstallDir = @($forwarded | Where-Object { $_ -eq '--install-dir' -or $_ -like '--install-dir=*' }).Count -gt 0
        if ($env:ZAI_INSTALL_DIR -and -not $hasInstallDir) {
            $forwarded = @('--install-dir', $env:ZAI_INSTALL_DIR) + $forwarded
        }
        # PowerShell reads a native argument such as --install-dir=C:\zai as a
        # parameter with a value and splits it at the colon, so pass each value
        # as its own token.
        $arguments = @()
        foreach ($argument in $forwarded) {
            if ($argument -match '^(--[A-Za-z0-9][A-Za-z0-9-]*)=(.*)$') {
                $arguments += $Matches[1], $Matches[2]
            } else {
                $arguments += $argument
            }
        }

        & $python $entry @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "zai installer: the package installer exited with code $LASTEXITCODE."
        }
    } finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Install-ZaiCli @args
