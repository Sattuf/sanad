# سند — إعداد بيئة التطوير المحلية (Windows PowerShell)
# يولّد مفاتيح عشوائية في dotnet user-secrets — لا شيء منها يُكتب في المستودع.
# مفتاح تشفير الحقول منفصل تماماً عن مفتاح توقيع JWT (ADR-0004).

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "..\src\Sanad.Api"

function New-Key([int]$bytes = 32) {
    $buffer = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
    return [Convert]::ToBase64String($buffer)
}

dotnet user-secrets init --project $project | Out-Null

dotnet user-secrets set "Auth:Jwt:SigningKeyBase64" (New-Key 48) --project $project | Out-Null
dotnet user-secrets set "Encryption:FieldKeyBase64" (New-Key 32) --project $project | Out-Null
dotnet user-secrets set "Otp:HmacKeyBase64" (New-Key 32) --project $project | Out-Null
dotnet user-secrets set "Storage:UrlSigningKeyBase64" (New-Key 32) --project $project | Out-Null

# Bootstrap أول SystemAdmin — يُقرأ مرة واحدة فقط عند أول إقلاع. احذفه بعد أول دخول ناجح.
$adminEmail = if ($env:SANAD_ADMIN_EMAIL) { $env:SANAD_ADMIN_EMAIL } else { "admin@sanad.local" }
$tempPassword = "Tmp-" + [Guid]::NewGuid().ToString("N").Substring(0, 12) + "Aa1"
dotnet user-secrets set "Bootstrap:AdminEmail" $adminEmail --project $project | Out-Null
dotnet user-secrets set "Bootstrap:AdminTempPassword" $tempPassword --project $project | Out-Null

Write-Host "تم إعداد الأسرار المحلية." -ForegroundColor Green
Write-Host "بريد المدير الأول: $adminEmail"
Write-Host "كلمة المرور المؤقتة: $tempPassword  (سيُطلب تغييرها وإعداد 2FA عند أول دخول)"
