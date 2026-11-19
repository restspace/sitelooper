# Register a daily Windows scheduled task that runs scripts/record-repo-traffic.mjs.
# Daily (not weekly) with StartWhenAvailable, so a sleeping or switched-off laptop
# catches up on next wake without losing GitHub's 14-day window.
# Run from PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\register-traffic-task.ps1
# Remove with:          Unregister-ScheduledTask -TaskName "sitelooper repo traffic"
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$a = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" `
  -Argument "--headless `"$node`" `"$repo\scripts\record-repo-traffic.mjs`"" -WorkingDirectory $repo
$t = New-ScheduledTaskTrigger -Daily -At 10:00
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "sitelooper repo traffic" -Action $a -Trigger $t -Settings $s -Force `
  -Description "Save GitHub clone/view traffic for restspace/sitelooper(-plugin) to ~/.sitelooper-stats/traffic.json" | Out-Null
Start-ScheduledTask -TaskName "sitelooper repo traffic"
Write-Host "Registered; first run started. Check with: node scripts\record-repo-traffic.mjs --report"
