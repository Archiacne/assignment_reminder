$ErrorActionPreference = 'Stop'

$helperDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $helperDirectory 'AssignmentNativeHost.cs'
$executablePath = Join-Path $helperDirectory 'AssignmentNativeHost.exe'
$manifestPath = Join-Path $helperDirectory 'com.local.assignment_reminder.json'
$compilerCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) {
    throw 'Windows C# compiler (csc.exe) was not found. Enable .NET Framework 4.x.'
}

& $compiler /nologo /target:exe /optimize+ "/out:$executablePath" /reference:System.Web.Extensions.dll $sourcePath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $executablePath)) {
    throw 'Failed to compile the native helper.'
}

$hostManifest = [ordered]@{
    name = 'com.local.assignment_reminder'
    description = 'Local assignment reminder export helper'
    path = $executablePath
    type = 'stdio'
    allowed_origins = @('chrome-extension://ildadolcblemponmpddbammhblldgnpi/')
}
$manifestJson = $hostManifest | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifestPath, $manifestJson, (New-Object Text.UTF8Encoding($false)))

$legacyRegistryPath = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.homework_reminder'
if (Test-Path -LiteralPath $legacyRegistryPath) {
    Remove-Item -LiteralPath $legacyRegistryPath -Recurse -Force
}
$registryPath = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.assignment_reminder'
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value $manifestPath

$outputDirectory = Join-Path (Split-Path -Parent $helperDirectory) 'assignment'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

Write-Host 'Native helper installed successfully.' -ForegroundColor Green
Write-Host "Assignment output directory: $outputDirectory"
Write-Host 'Reload the extension in edge://extensions, then enable assignment folder export.'
