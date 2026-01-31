param([string]$ParamsFile)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class NativeInput {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

    const uint LEFTDOWN = 0x02, LEFTUP = 0x04;
    const uint RIGHTDOWN = 0x08, RIGHTUP = 0x10;
    const uint MIDDLEDOWN = 0x20, MIDDLEUP = 0x40;
    const uint WHEEL = 0x800;

    public static void LeftDown()   { mouse_event(LEFTDOWN, 0, 0, 0, IntPtr.Zero); }
    public static void LeftUp()     { mouse_event(LEFTUP, 0, 0, 0, IntPtr.Zero); }
    public static void RightDown()  { mouse_event(RIGHTDOWN, 0, 0, 0, IntPtr.Zero); }
    public static void RightUp()    { mouse_event(RIGHTUP, 0, 0, 0, IntPtr.Zero); }
    public static void MiddleDown() { mouse_event(MIDDLEDOWN, 0, 0, 0, IntPtr.Zero); }
    public static void MiddleUp()   { mouse_event(MIDDLEUP, 0, 0, 0, IntPtr.Zero); }
    public static void Scroll(int amount) { mouse_event(WHEEL, 0, 0, amount, IntPtr.Zero); }
}
'@

$data = Get-Content -Path $ParamsFile -Raw | ConvertFrom-Json
$action = $data.action

try {
    switch ($action) {
        "screenshot" {
            $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bitmap = New-Object Drawing.Bitmap $screen.Width, $screen.Height
            $g = [Drawing.Graphics]::FromImage($bitmap)
            $g.CopyFromScreen($screen.Location, [Drawing.Point]::Empty, $screen.Size)
            $g.Dispose()

            # Save full resolution PNG
            $savePath = $data.path
            if (-not $savePath) { $savePath = Join-Path $data.root "screenshot.png" }
            $bitmap.Save($savePath, [Drawing.Imaging.ImageFormat]::Png)

            # Create resized version for vision (max 1280px wide)
            $maxW = 1280
            $w = $bitmap.Width; $h = $bitmap.Height
            if ($w -gt $maxW) {
                $ratio = $maxW / $w
                $nw = $maxW; $nh = [int]($h * $ratio)
            } else { $nw = $w; $nh = $h }

            $resized = New-Object Drawing.Bitmap $nw, $nh
            $g2 = [Drawing.Graphics]::FromImage($resized)
            $g2.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g2.DrawImage($bitmap, 0, 0, $nw, $nh)
            $g2.Dispose()
            $bitmap.Dispose()

            # Encode resized to base64 JPEG
            $ms = New-Object System.IO.MemoryStream
            $jpegCodec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $ep = New-Object Drawing.Imaging.EncoderParameters(1)
            $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, 80L)
            $resized.Save($ms, $jpegCodec, $ep)
            $base64 = [Convert]::ToBase64String($ms.ToArray())
            $ms.Dispose()
            $resized.Dispose()

            @{ success = $true; path = $savePath; width = $screen.Width; height = $screen.Height; _image = $base64 } | ConvertTo-Json -Compress
        }

        "mouse_move" {
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point([int]$data.x, [int]$data.y)
            @{ success = $true; x = $data.x; y = $data.y } | ConvertTo-Json -Compress
        }

        "mouse_click" {
            if ($null -ne $data.x -and $null -ne $data.y) {
                [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point([int]$data.x, [int]$data.y)
                Start-Sleep -Milliseconds 50
            }
            $btn = if ($data.button) { $data.button } else { "left" }
            switch ($btn) {
                "right"  { [NativeInput]::RightDown();  [NativeInput]::RightUp() }
                "middle" { [NativeInput]::MiddleDown(); [NativeInput]::MiddleUp() }
                default  { [NativeInput]::LeftDown();   [NativeInput]::LeftUp() }
            }
            if ($data.double_click) {
                Start-Sleep -Milliseconds 80
                switch ($btn) {
                    "right"  { [NativeInput]::RightDown();  [NativeInput]::RightUp() }
                    "middle" { [NativeInput]::MiddleDown(); [NativeInput]::MiddleUp() }
                    default  { [NativeInput]::LeftDown();   [NativeInput]::LeftUp() }
                }
            }
            @{ success = $true } | ConvertTo-Json -Compress
        }

        "mouse_scroll" {
            $clicks = if ($data.clicks) { [int]$data.clicks } else { 3 }
            $amount = $clicks * 120
            if ($data.direction -eq "down") { $amount = -$amount }
            [NativeInput]::Scroll($amount)
            @{ success = $true } | ConvertTo-Json -Compress
        }

        "keyboard_type" {
            [System.Windows.Forms.SendKeys]::SendWait($data.text)
            @{ success = $true } | ConvertTo-Json -Compress
        }

        "keyboard_hotkey" {
            [System.Windows.Forms.SendKeys]::SendWait($data.keys)
            @{ success = $true } | ConvertTo-Json -Compress
        }

        "get_screen_size" {
            $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            @{ width = $screen.Width; height = $screen.Height } | ConvertTo-Json -Compress
        }

        "list_windows" {
            $windows = @(Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
                @{ pid = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle }
            })
            @{ success = $true; windows = $windows } | ConvertTo-Json -Compress -Depth 3
        }

        "focus_window" {
            $target = $data.title
            $proc = Get-Process | Where-Object { $_.MainWindowTitle -like "*$target*" } | Select-Object -First 1
            if ($proc) {
                [NativeInput]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
                @{ success = $true; title = $proc.MainWindowTitle; pid = $proc.Id } | ConvertTo-Json -Compress
            } else {
                @{ success = $false; error = "No window found matching: $target" } | ConvertTo-Json -Compress
            }
        }

        default {
            @{ success = $false; error = "Unknown action: $action" } | ConvertTo-Json -Compress
        }
    }
} catch {
    @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
