# Windows signing

The Windows build uses Electron Builder and signs artifacts when these environment variables are set:

```powershell
$env:CSC_LINK = "$PWD\certs\TheZaffranApp-development.pfx"
$env:CSC_KEY_PASSWORD = (Get-Content "$PWD\certs\TheZaffranApp-development-password.txt" -Raw).Trim()
npm.cmd run build:win
```

To create a new local development certificate:

```powershell
npm.cmd run cert:create
```

The generated certificate is self-signed and is suitable for local testing only. It will not establish publisher trust for Smart App Control on other machines. Production releases require a publicly trusted Authenticode certificate, preferably from a reputable certificate authority, and should use the certificate through `CSC_LINK` and `CSC_KEY_PASSWORD` in the release environment.

The private `.pfx` and password are excluded by `certs/.gitignore`.