# المرحلة 1 (ملحق) — أوامر إنشاء الحل كاملة (.NET CLI) — v2

هذا التنفيذ الحرفي لهيكل §1.2 في `01-solution-architecture.md`. نفّذها بالترتيب من جذر المستودع.

## 9.1 السكربت الكامل

```bash
#!/usr/bin/env bash
set -euo pipefail

mkdir -p docs/adr

dotnet new sln -n Sanad

dotnet new classlib -n Sanad.Domain          -o src/Sanad.Domain
dotnet new classlib -n Sanad.Application      -o src/Sanad.Application
dotnet new classlib -n Sanad.Infrastructure    -o src/Sanad.Infrastructure
dotnet new webapi   -n Sanad.Api              -o src/Sanad.Api --use-minimal-apis

dotnet new xunit -n Sanad.Domain.UnitTests       -o tests/Sanad.Domain.UnitTests
dotnet new xunit -n Sanad.Application.UnitTests  -o tests/Sanad.Application.UnitTests
dotnet new xunit -n Sanad.Api.IntegrationTests   -o tests/Sanad.Api.IntegrationTests

dotnet sln add src/Sanad.Domain/Sanad.Domain.csproj
dotnet sln add src/Sanad.Application/Sanad.Application.csproj
dotnet sln add src/Sanad.Infrastructure/Sanad.Infrastructure.csproj
dotnet sln add src/Sanad.Api/Sanad.Api.csproj
dotnet sln add tests/Sanad.Domain.UnitTests/Sanad.Domain.UnitTests.csproj
dotnet sln add tests/Sanad.Application.UnitTests/Sanad.Application.UnitTests.csproj
dotnet sln add tests/Sanad.Api.IntegrationTests/Sanad.Api.IntegrationTests.csproj

dotnet add src/Sanad.Application reference src/Sanad.Domain
dotnet add src/Sanad.Infrastructure reference src/Sanad.Application
dotnet add src/Sanad.Api reference src/Sanad.Application
dotnet add src/Sanad.Api reference src/Sanad.Infrastructure

dotnet add tests/Sanad.Domain.UnitTests reference src/Sanad.Domain
dotnet add tests/Sanad.Application.UnitTests reference src/Sanad.Application
dotnet add tests/Sanad.Api.IntegrationTests reference src/Sanad.Api

# ── حزم Application ──────────────────────────────────
dotnet add src/Sanad.Application package MediatR
dotnet add src/Sanad.Application package FluentValidation
dotnet add src/Sanad.Application package FluentValidation.DependencyInjectionExtensions
dotnet add src/Sanad.Application package Microsoft.FeatureManagement

# ── حزم Infrastructure — لا حزمة دفع من أي نوع في v2 ───
dotnet add src/Sanad.Infrastructure package Microsoft.EntityFrameworkCore
dotnet add src/Sanad.Infrastructure package Microsoft.EntityFrameworkCore.Design
dotnet add src/Sanad.Infrastructure package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add src/Sanad.Infrastructure package Microsoft.AspNetCore.Identity.EntityFrameworkCore
dotnet add src/Sanad.Infrastructure package StackExchange.Redis
dotnet add src/Sanad.Infrastructure package Microsoft.AspNetCore.SignalR.StackExchangeRedis
dotnet add src/Sanad.Infrastructure package Azure.Security.KeyVault.Secrets

# ── حزم Api ───────────────────────────────────────────
dotnet add src/Sanad.Api package Microsoft.AspNetCore.Authentication.JwtBearer
dotnet add src/Sanad.Api package Microsoft.AspNetCore.Authentication.Google       # v2 — تسجيل الدخول بجوجل
dotnet add src/Sanad.Api package Microsoft.AspNetCore.SignalR
dotnet add src/Sanad.Api package Swashbuckle.AspNetCore
dotnet add src/Sanad.Api package Serilog.AspNetCore
dotnet add src/Sanad.Api package Serilog.Sinks.Console
dotnet add src/Sanad.Api package AspNetCoreRateLimit
dotnet add src/Sanad.Api package AspNetCore.HealthChecks.NpgSql
dotnet add src/Sanad.Api package AspNetCore.HealthChecks.Redis
dotnet add src/Sanad.Api package Microsoft.FeatureManagement.AspNetCore

# ── حزم الاختبار ──────────────────────────────────────
dotnet add tests/Sanad.Domain.UnitTests package FluentAssertions
dotnet add tests/Sanad.Application.UnitTests package FluentAssertions
dotnet add tests/Sanad.Application.UnitTests package NSubstitute
dotnet add tests/Sanad.Api.IntegrationTests package Microsoft.AspNetCore.Mvc.Testing
dotnet add tests/Sanad.Api.IntegrationTests package Testcontainers.PostgreSql
dotnet add tests/Sanad.Api.IntegrationTests package Testcontainers.Redis

# ── هيكل المجلدات الداخلي (v2 — لا مجلد Payments) ───────
mkdir -p src/Sanad.Domain/{Common,Identity,Consent,Directory,Verification,Scheduling,Messaging,PatientCare,RuqyahLibrary,Safety,Audit,Exceptions}
mkdir -p src/Sanad.Application/Common/{Interfaces,Behaviors,Mappings}
mkdir -p src/Sanad.Application/Modules/{Accounts,Consent,Directory,Verification,Scheduling,Messaging,PatientCare,RuqyahLibrary,Safety}
# PatientCare v3: يحوي ProviderCaseNote (إشرافي خاص) وProviderRecommendation (موجَّه للمستفيد) معاً — راجع 02-domain-model.md §2.6–2.7
mkdir -p src/Sanad.Infrastructure/{Persistence/Configurations,Persistence/Repositories,Persistence/Outbox,Identity,Encryption,Caching,Storage,Realtime,Notifications,Captcha,Security}
mkdir -p src/Sanad.Api/{Endpoints,Middleware,Authorization,HealthChecks}

dotnet build
```

ملاحظة الفرق عن النسخة السابقة: لا `Sanad.Domain/Payments`، ولا `Sanad.Infrastructure/Payments`؛ بدلاً منهما `CaseNotes` و`RuqyahLibrary`، وأُضيفت `Sanad.Infrastructure/Encryption`.

## 9.2 أداة EF Core

```bash
dotnet tool install --global dotnet-ef
dotnet tool update --global dotnet-ef   # إن كانت مثبتة مسبقاً
```

## 9.3 أول هجرة — بعد كتابة `SanadDbContext` فعلياً

```bash
dotnet ef migrations add InitialCreate -p src/Sanad.Infrastructure -s src/Sanad.Api -o Persistence/Migrations
dotnet ef database update -p src/Sanad.Infrastructure -s src/Sanad.Api
```

## 9.4 أسرار التطوير المحلي (v2 — تضيف مفتاح التشفير وGoogle وBootstrap)

```bash
dotnet user-secrets init --project src/Sanad.Api

dotnet user-secrets set "ConnectionStrings:Sanad" "Host=localhost;Database=sanad_dev;Username=postgres;Password=REPLACE_ME" --project src/Sanad.Api
dotnet user-secrets set "ConnectionStrings:Redis" "localhost:6379" --project src/Sanad.Api

dotnet user-secrets set "Auth:Google:ClientId" "REPLACE_ME" --project src/Sanad.Api
dotnet user-secrets set "Auth:Google:ClientSecret" "REPLACE_ME" --project src/Sanad.Api

dotnet user-secrets set "Encryption:FieldKeyBase64" "REPLACE_ME_32_BYTE_KEY_BASE64" --project src/Sanad.Api   # مفتاح IFieldEncryptor — منفصل عن مفتاح JWT

# Bootstrap أول SystemAdmin — راجع 04-infrastructure-layer.md §4.12، يُقرأ مرة واحدة فقط عند أول إقلاع
dotnet user-secrets set "Bootstrap:AdminEmail" "admin@example.local" --project src/Sanad.Api
dotnet user-secrets set "Bootstrap:AdminTempPassword" "REPLACE_ME_TEMP_PASSWORD" --project src/Sanad.Api
```

لا يوجد أي سر متعلق بمزود دفع في v2.

## 9.5 تشغيل محلي

```bash
docker run --name sanad-postgres -e POSTGRES_PASSWORD=REPLACE_ME -e POSTGRES_DB=sanad_dev -p 5432:5432 -d postgres:16
docker run --name sanad-redis -p 6379:6379 -d redis:7

dotnet run --project src/Sanad.Api
# عند أول تشغيل: AdminBootstrapSeeder ينشئ SystemAdmin تلقائياً من أسرار §9.4 — راجع السجل للتأكد من نجاحه
```

## 9.6 ملف `.gitignore`

```
bin/
obj/
*.user
appsettings.Development.json
.vs/
```

## 9.7 مسح الأسرار محلياً قبل أول دفع

```bash
brew install gitleaks
gitleaks detect --source . --verbose
```

## 9.8 فحص عدم وجود بقايا كود دفع (v2 — جديد، محلياً قبل أي Commit)

```bash
grep -riE "payment|subscription|FinanceOfficer" --include="*.cs" -r src/ && echo "⚠ وُجدت بقايا كود دفع — راجع 07-safety-guardrails.md §7.8" || echo "✓ لا بقايا"
```

## 9.10 الواجهة الأمامية — حزمة الحركة (v3، راجع `13-visual-motion-design.md`)

```bash
cd frontend
npm install framer-motion
```

## 9.11 التحقق النهائي بعد السكربت

```bash
dotnet sln list
dotnet build
dotnet test
```
