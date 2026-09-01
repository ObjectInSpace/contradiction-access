<#
    Contradiction: Spot The Liar -- screen reader access mod
    Installer / uninstaller

    WHAT THIS DOES
      1. Finds the game's package.nw folder (or asks you for it).
      2. Backs up index.html to index.html.orig -- ONCE, never overwritten.
      3. Copies a11y.js into package.nw\js\.
      4. Adds one <script> line to index.html, right after the game's own
         cc.js line.

    The game's own code (js/cc.js) is never modified.

    Re-running this is safe. It detects an existing install and repairs it
    rather than doubling up.

    To uninstall:  install.ps1 -Uninstall
    To target a specific folder:  install.ps1 -GamePath "D:\path\to\package.nw"
#>

param(
    [string] $GamePath,
    [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'

# The exact line we add, and the game line we anchor it to.
$ScriptTag  = '    <script src="js/a11y.js" type="text/javascript"></script>'
$AnchorLine = 'js/cc.js'

function Write-Step ($m) { Write-Host "  $m" }
function Write-Ok   ($m) { Write-Host "  $m" -ForegroundColor Green }
function Write-Warn ($m) { Write-Host "  $m" -ForegroundColor Yellow }
function Write-Err  ($m) { Write-Host "  $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Find the game.
#
# Steam can be installed anywhere and libraries can live on other drives, so
# we read libraryfolders.vdf to find every library, then look for the game in
# each. Falls back to asking.
# ---------------------------------------------------------------------------
function Find-GamePath {

    $candidates = @()

    # Steam's own record of where its libraries are.
    $steamRoot = $null
    foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
        try {
            $v = (Get-ItemProperty -Path $key -ErrorAction Stop).SteamPath
            if ($v) { $steamRoot = $v.Replace('/', '\'); break }
        } catch { }
    }

    if ($steamRoot) {
        $vdf = Join-Path $steamRoot 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            # Each library appears as:   "path"    "D:\\SteamLibrary"
            foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) {
                $candidates += $m.Groups[1].Value.Replace('\\', '\')
            }
        }
        $candidates += $steamRoot
    }

    # Common spots, in case the registry route found nothing.
    $candidates += @(
        'C:\Program Files (x86)\Steam'
        'C:\Program Files\Steam'
    )
    foreach ($d in (Get-PSDrive -PSProvider FileSystem)) {
        $candidates += (Join-Path $d.Root 'SteamLibrary')
    }

    foreach ($base in ($candidates | Select-Object -Unique)) {
        if (-not $base) { continue }
        # Steam's folder casing varies between installs ("common" / "Common").
        foreach ($common in @('steamapps\common', 'steamapps\Common')) {
            $p = Join-Path $base (Join-Path $common 'Contradiction\package.nw')
            if (Test-Path (Join-Path $p 'index.html')) { return $p }
        }
    }

    return $null
}

# ---------------------------------------------------------------------------
# Resolve the target folder, validating whatever we were handed.
# ---------------------------------------------------------------------------
function Resolve-GamePath ($given) {

    if ($given) {
        $p = $given.Trim().Trim('"')
        # Be forgiving: accept the game root or package.nw itself.
        if (Test-Path (Join-Path $p 'package.nw\index.html')) { $p = Join-Path $p 'package.nw' }
        if (-not (Test-Path (Join-Path $p 'index.html'))) {
            throw "No index.html in: $p`n  Point this at the game's package.nw folder."
        }
        return (Resolve-Path $p).Path
    }

    Write-Step 'Looking for Contradiction...'
    $found = Find-GamePath
    if ($found) {
        Write-Ok "Found: $found"
        return $found
    }

    Write-Warn 'Could not find the game automatically.'
    Write-Host ''
    Write-Host '  Please paste the full path to the game folder.'
    Write-Host '  In Steam: right-click Contradiction > Manage > Browse local files,'
    Write-Host '  then copy the address bar.'
    Write-Host ''
    $typed = Read-Host '  Game folder'
    if (-not $typed) { throw 'No path given.' }
    return (Resolve-GamePath $typed)
}

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
function Do-Install ($pkg) {

    $indexPath  = Join-Path $pkg 'index.html'
    $backupPath = Join-Path $pkg 'index.html.orig'
    $jsDir      = Join-Path $pkg 'js'
    $srcJs      = Join-Path $PSScriptRoot 'js\a11y.js'

    if (-not (Test-Path $srcJs)) {
        throw "Cannot find js\a11y.js next to this installer.`n  Unzip the whole download and run it from there."
    }
    if (-not (Test-Path $jsDir)) {
        throw "No js folder in: $pkg`n  This does not look like the Contradiction game folder."
    }

    $html = Get-Content $indexPath -Raw

    # Sanity check: is this actually the game's index.html?
    if ($html -notmatch [regex]::Escape($AnchorLine)) {
        throw "index.html does not load js/cc.js, so this is not the game's index.html`n  (or it is a build this mod does not know about)."
    }

    # --- Back up, once and only once. -------------------------------------
    # If a backup already exists it is from an earlier install and is the
    # only pristine copy left. Overwriting it with an already-patched file
    # would destroy the ability to uninstall, so we never touch it again.
    if (Test-Path $backupPath) {
        Write-Step 'Backup already exists, keeping it (index.html.orig)'
    } else {
        Copy-Item $indexPath $backupPath
        Write-Ok 'Backed up index.html to index.html.orig'
    }

    # --- The mod's own file. ----------------------------------------------
    Copy-Item $srcJs (Join-Path $jsDir 'a11y.js') -Force
    Write-Ok 'Installed js\a11y.js'

    # --- The one-line hook. -----------------------------------------------
    if ($html -match 'js/a11y\.js') {
        Write-Step 'Script tag already present in index.html'
    } else {
        # Insert immediately after the game's own cc.js line, preserving
        # whatever line endings the file already uses.
        $nl    = if ($html -match "`r`n") { "`r`n" } else { "`n" }
        $lines = $html -split "\r?\n"
        $out   = New-Object System.Collections.Generic.List[string]
        $done  = $false

        foreach ($line in $lines) {
            $out.Add($line)
            if (-not $done -and $line -match [regex]::Escape($AnchorLine)) {
                $out.Add($ScriptTag)
                $done = $true
            }
        }
        if (-not $done) { throw 'Could not find the cc.js line to insert after.' }

        Set-Content -Path $indexPath -Value ($out -join $nl) -NoNewline -Encoding UTF8
        Write-Ok 'Added the script tag to index.html'
    }

    Write-Host ''
    Write-Ok 'Done. Start the game as usual.'
    Write-Host ''
    Write-Host '  If Steam ever verifies or updates the game files, the script tag'
    Write-Host '  is removed and the mod stops loading. Just run this installer'
    Write-Host '  again to put it back.'
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
function Do-Uninstall ($pkg) {

    $indexPath  = Join-Path $pkg 'index.html'
    $backupPath = Join-Path $pkg 'index.html.orig'
    $modJs      = Join-Path $pkg 'js\a11y.js'

    if (Test-Path $backupPath) {
        # Preferred: restore the pristine file byte for byte.
        Copy-Item $backupPath $indexPath -Force
        Remove-Item $backupPath
        Write-Ok 'Restored the original index.html'
    } else {
        # No backup (someone deleted it). Strip our line out instead,
        # preserving the file's own line endings -- the shipped index.html
        # uses LF, and rewriting it as CRLF would change every line.
        $raw   = Get-Content $indexPath -Raw
        $nl    = if ($raw -match "`r`n") { "`r`n" } else { "`n" }
        $lines = $raw -split "`r?`n"
        $kept  = @($lines | Where-Object { $_ -notmatch 'js/a11y\.js' })
        if ($kept.Count -eq $lines.Count) {
            Write-Step 'No mod script tag found in index.html'
        } else {
            Set-Content -Path $indexPath -Value ($kept -join $nl) -NoNewline -Encoding UTF8
            Write-Ok 'Removed the script tag from index.html'
        }
    }

    if (Test-Path $modJs) {
        Remove-Item $modJs
        Write-Ok 'Removed js\a11y.js'
    }

    Write-Host ''
    Write-Ok 'Uninstalled. The game is back to stock.'
}

# ---------------------------------------------------------------------------
try {
    Write-Host ''
    Write-Host '  Contradiction: Spot The Liar -- screen reader access mod'
    Write-Host '  ========================================================'
    Write-Host ''

    $pkg = Resolve-GamePath $GamePath
    Write-Host ''

    if ($Uninstall) { Do-Uninstall $pkg } else { Do-Install $pkg }

    Write-Host ''
    exit 0
}
catch {
    Write-Host ''
    Write-Err "Failed: $($_.Exception.Message)"
    Write-Host ''
    Write-Host '  Nothing was changed. If this keeps happening, please open an'
    Write-Host '  issue on GitHub with the message above.'
    Write-Host ''
    exit 1
}
