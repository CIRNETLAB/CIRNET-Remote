# Presentation only. No services, terminal-wide settings or background activity.
$script:CirnetColor = $false
$script:CirnetAnimation = $false
$script:CirnetActivity = $null
$script:CirnetActivityLength = 0
$script:CirnetActivityWidth = 0
$script:CirnetActivityFrame = 0

function Get-CirnetConsoleWidth {
    try {
        $width = [Console]::WindowWidth
        if ($width -gt 1) { return $width }
    } catch { }
    return 0
}

function Get-CirnetConsoleRedirection {
    return @{Input = [Console]::IsInputRedirected; Output = [Console]::IsOutputRedirected; Error = [Console]::IsErrorRedirected}
}

function Get-CirnetConsoleCapabilities {
    $capabilities = @{Color = $false; Animation = $false}
    try {
        # Native console facilities are optional (including in custom PS hosts).
        $redirection = Get-CirnetConsoleRedirection
        if ($Host.Name -eq 'ConsoleHost' -and $null -ne $Host.UI -and
            -not $redirection.Output -and -not $redirection.Error) {
            $capabilities.Color = $true
            $capabilities.Animation = -not $redirection.Input -and (Get-CirnetConsoleWidth) -ge 20
        }
    } catch { }
    return $capabilities
}

function Initialize-CirnetConsole {
    param([switch]$NoColor, [switch]$NoAnimation)
    Clear-CirnetActivityLine
    $script:CirnetActivity = $null
    $script:CirnetActivityFrame = 0
    $script:CirnetActivityWidth = 0
    $script:CirnetColor = $false
    $script:CirnetAnimation = $false
    try {
        $capabilities = Get-CirnetConsoleCapabilities
        $plain = $NoColor -or -not [string]::IsNullOrEmpty($env:NO_COLOR) -or $env:TERM -eq 'dumb'
        $script:CirnetColor = -not $plain -and $capabilities.Color
        $script:CirnetAnimation = -not $plain -and -not $NoAnimation -and $capabilities.Animation
    } catch {
        # Inspection must never prevent startup on a host without console APIs.
    }
}

function Get-CirnetToneColor {
    param([string]$Tone)
    switch ($Tone) {
        'Muted' { return [ConsoleColor]::DarkGray }
        'Accent' { return [ConsoleColor]::Cyan }
        'Success' { return [ConsoleColor]::Green }
        'Warning' { return [ConsoleColor]::Yellow }
        'Error' { return [ConsoleColor]::Red }
        default { return [ConsoleColor]::Gray }
    }
}

function Write-CirnetHostText {
    param([string]$Text, [string]$Tone = 'Default', [switch]$NoNewline)
    if ($script:CirnetColor) {
        Write-Host -Object $Text -NoNewline:$NoNewline -ForegroundColor (Get-CirnetToneColor $Tone)
    } else {
        Write-Host -Object $Text -NoNewline:$NoNewline
    }
}

function Write-CirnetConsoleText {
    param([string]$Text, [string]$Tone = 'Default', [switch]$ErrorStream, [switch]$NoNewline)
    if (-not $ErrorStream) {
        # The PowerShell host preserves Unicode in a native Windows terminal;
        # Console.Out can use the legacy OEM code page and lose profile paths.
        try { Write-CirnetHostText -Text $Text -Tone $Tone -NoNewline:$NoNewline }
        catch {
            try {
                if ($NoNewline) { [Console]::Out.Write($Text) }
                else { [Console]::Out.WriteLine($Text) }
            } catch {
                $script:CirnetAnimation = $false
                $script:CirnetColor = $false
            }
        }
        return
    }
    $savedColor = $null
    try {
        if ($script:CirnetColor) {
            try {
                $savedColor = [Console]::ForegroundColor
                [Console]::ForegroundColor = Get-CirnetToneColor $Tone
            } catch { $script:CirnetColor = $false }
        }
        $writer = [Console]::Error
        if ($NoNewline) { $writer.Write($Text) } else { $writer.WriteLine($Text) }
    } catch {
        # Error fallback stays on the host error channel, never stdout.
        try {
            $Host.UI.WriteErrorLine($Text)
        } catch {
            # A closed host must not replace the original failure or block cleanup.
            $script:CirnetAnimation = $false
            $script:CirnetColor = $false
        }
    } finally {
        if ($null -ne $savedColor) {
            try { [Console]::ForegroundColor = $savedColor } catch { }
        }
    }
}

function Clear-CirnetActivityLine {
    if ($script:CirnetActivityLength -le 0) { return }
    try {
        $width = Get-CirnetConsoleWidth
        if ($width -le 1 -or $width -ne $script:CirnetActivityWidth) {
            # Resizing can reflow the previous frame over several rows. Preserve
            # that complete text and move on rather than erasing just its tail.
            $script:CirnetAnimation = $false
            [Console]::Out.WriteLine()
            return
        }
        # Leave the last column untouched: writing it can scroll/wrap a console.
        $length = $script:CirnetActivityLength
        $length = [Math]::Min($length, $width - 1)
        [Console]::Out.Write("`r" + (' ' * $length) + "`r")
    } catch { $script:CirnetAnimation = $false }
    finally {
        $script:CirnetActivityLength = 0
        $script:CirnetActivityWidth = 0
    }
}

function Write-CirnetLine {
    param(
        [AllowEmptyString()][string]$Text = '',
        [ValidateSet('Default','Muted','Accent','Success','Warning','Error')][string]$Tone = 'Default',
        [switch]$ErrorStream,
        [switch]$NoNewline
    )
    Clear-CirnetActivityLine
    Write-CirnetConsoleText -Text $Text -Tone $Tone -ErrorStream:$ErrorStream -NoNewline:$NoNewline
}

function Write-CirnetMessage {
    param(
        [string]$Text,
        [ValidateSet('INFO','OK','WARN','ERROR')][string]$Level = 'INFO',
        [switch]$ErrorStream
    )
    $tone = switch ($Level) {
        'OK' { 'Success' }
        'WARN' { 'Warning' }
        'ERROR' { 'Error' }
        default { 'Accent' }
    }
    Write-CirnetLine -Text "[$Level] $Text" -Tone $tone -ErrorStream:$ErrorStream
}

function Write-CirnetBanner {
    param([string]$Title = '<<<<<<<< CIRNET REMOTE LAUNCHER >>>>>>>>>>')
    $width = Get-CirnetConsoleWidth
    if ($width -le 1) { $width = 80 }
    $rule = '=' * ([Math]::Min(46, [Math]::Max(1, $width - 1)))
    Write-CirnetLine
    Write-CirnetLine $rule -Tone Muted
    Write-CirnetLine "  $Title" -Tone Accent
    Write-CirnetLine $rule -Tone Muted
    Write-CirnetLine
}

function Write-CirnetSection {
    param([string]$Title)
    Write-CirnetLine
    Write-CirnetLine "-- $Title --" -Tone Accent
}

function Start-CirnetActivity {
    param([string]$Text)
    Clear-CirnetActivityLine
    $script:CirnetActivity = $Text
    $script:CirnetActivityFrame = 0
    if ($script:CirnetAnimation) { Update-CirnetActivity }
    else { Write-CirnetLine "[WORKING] $Text" -Tone Muted }
}

function Update-CirnetActivity {
    param([string]$Text)
    if ($null -eq $script:CirnetActivity) { return }
    if ($PSBoundParameters.ContainsKey('Text')) { $script:CirnetActivity = $Text }
    if (-not $script:CirnetAnimation) { return }
    Clear-CirnetActivityLine
    if (-not $script:CirnetAnimation) {
        Write-CirnetLine "[WORKING] $script:CirnetActivity" -Tone Muted
        return
    }
    try {
        $width = Get-CirnetConsoleWidth
        if ($width -lt 20) {
            $script:CirnetAnimation = $false
            Write-CirnetLine "[WORKING] $script:CirnetActivity" -Tone Muted
            return
        }
        $frames = @('|', '/', '-', '\')
        $line = '[' + $frames[$script:CirnetActivityFrame % $frames.Count] + '] ' + $script:CirnetActivity
        # Keep a single bounded line even when readiness text or terminal width changes.
        $limit = [Math]::Min(72, $width - 1)
        if ($line.Length -gt $limit) { $line = $line.Substring(0, $limit - 3) + '...' }
        Write-CirnetConsoleText $line -Tone Muted -NoNewline
        $script:CirnetActivityLength = $line.Length
        $script:CirnetActivityWidth = $width
        $script:CirnetActivityFrame++
    } catch {
        $script:CirnetAnimation = $false
        Clear-CirnetActivityLine
        Write-CirnetLine "[WORKING] $script:CirnetActivity" -Tone Muted
    }
}

function Stop-CirnetActivity {
    param([string]$Message = '', [ValidateSet('INFO','OK','WARN','ERROR')][string]$Level = 'OK')
    try { Clear-CirnetActivityLine }
    finally { $script:CirnetActivity = $null }
    if ($Message) { Write-CirnetMessage $Message -Level $Level }
}

function Format-CirnetBytes {
    param([long]$Bytes)
    if ($Bytes -lt 1024) { return $Bytes.ToString([Globalization.CultureInfo]::InvariantCulture) + ' B' }
    $units = @('B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB')
    $value = [double]$Bytes
    $unit = 0
    while ($value -ge 1024 -and $unit -lt ($units.Count - 1)) { $value /= 1024; $unit++ }
    return $value.ToString('0.0', [Globalization.CultureInfo]::InvariantCulture) + ' ' + $units[$unit]
}

Export-ModuleMember -Function Initialize-CirnetConsole, Write-CirnetLine, Write-CirnetMessage, Write-CirnetBanner, Write-CirnetSection, Start-CirnetActivity, Update-CirnetActivity, Stop-CirnetActivity, Format-CirnetBytes
