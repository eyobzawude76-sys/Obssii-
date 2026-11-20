param(
    [string]$AdminName,
    [string]$AdminEmail,
    [string]$AdminUsername,
    [switch]$GeneratePassword
)

$ErrorActionPreference = 'Stop'

if (-not $AdminName) { $AdminName = Read-Host 'Admin full name' }
if (-not $AdminEmail) { $AdminEmail = Read-Host 'Admin email' }
if (-not $AdminUsername) { $AdminUsername = Read-Host 'Admin username' }

$passwordPointer = [IntPtr]::Zero
$securePassword = $null
$generatedPassword = $null
$secretPath = $null

try {
    if ($GeneratePassword) {
        $randomBytes = New-Object byte[] 24
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $generator.GetBytes($randomBytes)
            $generatedPassword = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        } finally {
            [Array]::Clear($randomBytes, 0, $randomBytes.Length)
            $generator.Dispose()
        }
        $securePassword = ConvertTo-SecureString -String $generatedPassword -AsPlainText -Force

        $secretDirectory = Join-Path $env:TEMP 'SmartExam-Admin-Credentials'
        [System.IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
        $secretPath = Join-Path $secretDirectory 'admin-initial-password.dpapi'
        if (Test-Path -LiteralPath $secretPath) {
            throw 'An encrypted Admin password file already exists; refusing to overwrite it.'
        }
        $encryptedPassword = ConvertFrom-SecureString -SecureString $securePassword
        $fileStream = [System.IO.File]::Open(
            $secretPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        try {
            $writer = New-Object System.IO.StreamWriter($fileStream)
            $writer.Write($encryptedPassword)
            $writer.Flush()
            $writer.Dispose()
        } finally {
            $fileStream.Dispose()
        }

        $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl = Get-Acl -LiteralPath $secretPath
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($currentUser)
        $access = New-Object System.Security.AccessControl.FileSystemAccessRule(
            $currentUser,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
        $acl.SetAccessRule($access)
        Set-Acl -LiteralPath $secretPath -AclObject $acl
        Write-Output "Generated password is stored encrypted for this Windows user at: $secretPath"
    } else {
        $securePassword = Read-Host 'Admin password (hidden; 12–72 UTF-8 bytes)' -AsSecureString
    }

    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:SMARTEXAM_BOOTSTRAP_ADMIN_NAME = $AdminName
    $env:SMARTEXAM_BOOTSTRAP_ADMIN_EMAIL = $AdminEmail
    $env:SMARTEXAM_BOOTSTRAP_ADMIN_USERNAME = $AdminUsername
    $env:SMARTEXAM_BOOTSTRAP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $generatedPassword = $null

    npm.cmd run bootstrap:first-admin
    if ($LASTEXITCODE -ne 0) {
        throw 'First Admin bootstrap did not complete successfully.'
    }
} finally {
    Remove-Item Env:SMARTEXAM_BOOTSTRAP_ADMIN_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:SMARTEXAM_BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:SMARTEXAM_BOOTSTRAP_ADMIN_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:SMARTEXAM_BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($securePassword) { $securePassword.Dispose() }
    $generatedPassword = $null
}
