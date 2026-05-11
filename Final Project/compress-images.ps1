Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

function Get-JpegCodec {
    [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object { $_.MimeType -eq "image/jpeg" } |
        Select-Object -First 1
}

function Save-OptimizedJpeg {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath,
        [Parameter(Mandatory = $true)][int]$MaxDimension,
        [Parameter(Mandatory = $true)][long]$Quality
    )

    $image = [System.Drawing.Image]::FromFile($SourcePath)
    try {
        $scale = [Math]::Min(1.0, $MaxDimension / [double]([Math]::Max($image.Width, $image.Height)))
        $newWidth = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
        $newHeight = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))

        $bitmap = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
        try {
            $bitmap.SetResolution(72, 72)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.DrawImage($image, 0, 0, $newWidth, $newHeight)
            }
            finally {
                $graphics.Dispose()
            }

            $codec = Get-JpegCodec
            $encoder = [System.Drawing.Imaging.Encoder]::Quality
            $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, $Quality)
            $bitmap.Save($DestinationPath, $codec, $encoderParams)
        }
        finally {
            $bitmap.Dispose()
        }
    }
    finally {
        $image.Dispose()
    }
}

function Optimize-ImageFolder {
    param(
        [Parameter(Mandatory = $true)][string]$Folder,
        [Parameter(Mandatory = $true)][int]$MaxDimension,
        [Parameter(Mandatory = $true)][long]$Quality
    )

    $extensions = @(".jpg", ".jpeg", ".jfif", ".tif", ".tiff")
    $files = Get-ChildItem $Folder -Recurse -File |
        Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }

    $results = foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file.FullName)) {
            continue
        }

        $before = $file.Length
        $outputPath = if ($file.Extension -match "^\.(jpg|jpeg)$") {
            Join-Path $file.DirectoryName ($file.BaseName + ".optimized.jpg")
        }
        else {
            Join-Path $file.DirectoryName ($file.BaseName + ".jpg")
        }

        try {
            Save-OptimizedJpeg -SourcePath $file.FullName -DestinationPath $outputPath -MaxDimension $MaxDimension -Quality $Quality
        }
        catch {
            if (Test-Path -LiteralPath $outputPath) {
                Remove-Item -LiteralPath $outputPath
            }
            Write-Warning "Skipped unreadable image: $($file.FullName)"
            continue
        }

        $after = (Get-Item $outputPath).Length
        if ($after -lt $before -or $file.Extension -notmatch "^\.(jpg|jpeg)$") {
            Remove-Item -LiteralPath $file.FullName
            if ($outputPath -ne (Join-Path $file.DirectoryName ($file.BaseName + ".jpg"))) {
                Move-Item -LiteralPath $outputPath -Destination (Join-Path $file.DirectoryName ($file.BaseName + ".jpg")) -Force
            }
        }
        else {
            Remove-Item -LiteralPath $outputPath
            $after = $before
        }

        [PSCustomObject]@{
            Path = $file.FullName
            Before = $before
            After = $after
            Saved = $before - $after
        }
    }

    $results
}

$beforeTotal = (Get-ChildItem -Recurse -File |
    Where-Object { $_.Extension -match "^\.(jpg|jpeg|jfif|tif|tiff)$" } |
    Measure-Object Length -Sum).Sum

$fullResults = Optimize-ImageFolder -Folder "munch_paintings" -MaxDimension 1600 -Quality 72
$thumbnailResults = Optimize-ImageFolder -Folder "munch_paintings_thumbnails" -MaxDimension 360 -Quality 62

$csvPath = "edvard_munch.csv"
$csv = Get-Content -LiteralPath $csvPath -Raw
$csv = $csv -replace "\.(tiff?|jfif|jpeg)(?=(`r?`n|$|,))", ".jpg"
Set-Content -LiteralPath $csvPath -Value $csv -NoNewline

$afterTotal = (Get-ChildItem -Recurse -File |
    Where-Object { $_.Extension -match "^\.(jpg|jpeg|jfif|tif|tiff)$" } |
    Measure-Object Length -Sum).Sum

[PSCustomObject]@{
    ImagesProcessed = @($fullResults + $thumbnailResults).Count
    BeforeMB = [Math]::Round($beforeTotal / 1MB, 2)
    AfterMB = [Math]::Round($afterTotal / 1MB, 2)
    SavedMB = [Math]::Round(($beforeTotal - $afterTotal) / 1MB, 2)
}
