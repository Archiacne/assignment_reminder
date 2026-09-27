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
    throw '未找到 Windows C# 编译器（csc.exe）。请启用 .NET Framework 4.x。'
}

& $compiler /nologo /target:exe /optimize+ "/out:$executablePath" /reference:System.Web.Extensions.dll $sourcePath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $executablePath)) {
    throw '辅助程序编译失败。'
}

$hostManifest = [ordered]@{
    name = 'com.local.assignment_reminder'
    description = '本地作业提醒文件导出辅助程序'
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

Write-Host '辅助程序安装完成。' -ForegroundColor Green
Write-Host "作业文件目录：$outputDirectory"
Write-Host '请在 edge://extensions 中重新加载扩展，然后开启“同时导出到项目 assignment 文件夹”。'
