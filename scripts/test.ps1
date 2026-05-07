$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Running parser examples..."
Get-Content .\examples\test_ro_plan.txt | .\motoride.exe | Out-Host
Get-Content .\examples\test_en_hazard.txt | .\motoride.exe | Out-Host
Get-Content .\examples\test_multilingual.txt | .\motoride.exe | Out-Host

Write-Host "Running no final dot examples..."
"Vreau o tura relaxata, sa evit autostrada si vreau sa merg de la Pitesti la Cluj" | .\motoride.exe | Out-Host
"Report gravel on DN1 near Sinaia with high risk" | .\motoride.exe | Out-Host
"I want a relaxed ride from Brasov to Sinaia without highways prefer curves" | .\motoride.exe | Out-Host

Write-Host "All parser smoke tests completed."
