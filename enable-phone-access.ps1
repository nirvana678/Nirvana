# Run once as Administrator to allow the local preview on the current Wi-Fi network.
$ErrorActionPreference = 'Stop'
$ruleName = 'Nirvana Wi-Fi preview (4200)'
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4200 -RemoteAddress LocalSubnet -Profile Any -InterfaceAlias 'Wi-Fi' | Out-Null
}
'Nirvana Wi-Fi access is enabled on TCP 4200 for the local subnet.' | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'phone-access-result.log')
