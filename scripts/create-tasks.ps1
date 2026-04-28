$DIR = "C:\Users\steve\Code\hoa-clawops-console"
$PM2 = "C:\Users\steve\AppData\Roaming\npm\pm2.cmd"

Write-Host "[1/2] Creating login trigger..."
schtasks /create /tn "OpenClawFleet" /tr "cmd /c cd /d $DIR `& $PM2 resurrect" /sc onlogon /ru steve /rl highest /f

Write-Host "[2/2] Creating 5-minute failsafe..."
schtasks /create /tn "OpenClawFleetFailsafe" /tr "cmd /c cd /d $DIR `& $PM2 resurrect `& $PM2 start ecosystem.config.cjs" /sc minute /mo 5 /ru steve /rl highest /f

Write-Host ""
Write-Host "Verifying..."
schtasks /query /tn "OpenClawFleet"
schtasks /query /tn "OpenClawFleetFailsafe"
Write-Host ""
Write-Host "Done. Press any key to close."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
