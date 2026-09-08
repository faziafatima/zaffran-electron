$ErrorActionPreference = 'Stop'

$certificateDirectory = Join-Path $PSScriptRoot '..\certs'
New-Item -ItemType Directory -Force -Path $certificateDirectory | Out-Null
$certificateDirectory = (Resolve-Path $certificateDirectory).Path

$password = [Guid]::NewGuid().ToString('N')
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject 'CN=TheZaffranApp Development' `
    -FriendlyName 'TheZaffranApp Development Code Signing' `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(3)

Export-PfxCertificate `
    -Cert $certificate `
    -FilePath (Join-Path $certificateDirectory 'TheZaffranApp-development.pfx') `
    -Password $securePassword | Out-Null

Set-Content `
    -Path (Join-Path $certificateDirectory 'TheZaffranApp-development-password.txt') `
    -Value $password `
    -NoNewline

Write-Host "Created development certificate $($certificate.Thumbprint)."
Write-Host 'Use npm run build:win after setting CSC_LINK and CSC_KEY_PASSWORD.'