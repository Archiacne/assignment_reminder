$ErrorActionPreference = 'Stop'
foreach ($registryPath in @(
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.assignment_reminder',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.homework_reminder'
)) {
    if (Test-Path -LiteralPath $registryPath) {
        Remove-Item -LiteralPath $registryPath -Recurse -Force
    }
}
Write-Host '辅助程序注册信息已移除。已导出的 assignment 文件不会被删除。' -ForegroundColor Green
