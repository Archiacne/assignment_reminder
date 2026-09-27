$ErrorActionPreference = 'Stop'
foreach ($registryPath in @(
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.assignment_reminder',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.homework_reminder'
)) {
    if (Test-Path -LiteralPath $registryPath) {
        Remove-Item -LiteralPath $registryPath -Recurse -Force
    }
}
Write-Host 'Native helper registration removed. Exported assignment files were not deleted.' -ForegroundColor Green
