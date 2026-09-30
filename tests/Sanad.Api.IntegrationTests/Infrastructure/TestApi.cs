using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Sanad.Api.IntegrationTests.Infrastructure;

public sealed record Session(Guid UserId, string AccessToken, string RefreshToken);

/// <summary>عميل اختبار رفيع فوق HttpClient + بُناة سيناريوهات (مستفيد، منسق، مختص منشور، مقطع منشور...).</summary>
public sealed class TestApi(SanadApiFactory factory)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private static int _counter;
    private Session? _admin;

    public SanadApiFactory Factory => factory;

    public HttpClient Client(Session? session = null, string? idempotencyKey = null)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        if (session is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        if (idempotencyKey is not null) client.DefaultRequestHeaders.Add("Idempotency-Key", idempotencyKey);
        return client;
    }

    public static string Unique(string prefix) => $"{prefix}{Interlocked.Increment(ref _counter)}_{Guid.NewGuid():N}"[..Math.Min(40, prefix.Length + 30)];

    public static async Task<JsonNode> ReadJson(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return JsonNode.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text)!;
    }

    public static async Task<JsonNode> Ok(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {await response.Content.ReadAsStringAsync()}");
        return await ReadJson(response);
    }

    public static StringContent Body(object value) => new(JsonSerializer.Serialize(value, Json), System.Text.Encoding.UTF8, "application/json");

    // ── الهويات ──────────────────────────────────────────────────────────────
    public async Task<Session> RegisterBeneficiaryAsync(string? email = null)
    {
        email ??= $"{Guid.NewGuid():N}@sanad.test";
        var res = await Client().PostAsync("/api/v1/auth/register/email", Body(new
        {
            email,
            password = "Strong-Pass-123",
            displayName = "مستفيد تجريبي",
            acceptTerms = true,
            acceptPrivacyPolicy = true,
        }));
        return ToSession(await Ok(res));
    }

    public static Session ToSession(JsonNode node)
    {
        node["stage"]!.GetValue<string>().Should().Be("Succeeded", node.ToJsonString());
        return new Session(Guid.Parse(node["userId"]!.GetValue<string>()), node["accessToken"]!.GetValue<string>(), node["refreshToken"]!.GetValue<string>());
    }

    /// <summary>دخول المدير الأول عبر المسار الكامل: كلمة مرور مؤقتة ← تغييرها ← إعداد 2FA ← جلسة amr=mfa.</summary>
    public async Task<Session> AdminAsync()
    {
        if (_admin is not null) return _admin;
        var client = Client();
        var login = await Ok(await client.PostAsync("/api/v1/auth/login/email", Body(new { email = SanadApiFactory.AdminEmail, password = SanadApiFactory.AdminTempPassword })));
        const string newPassword = "Admin-Strong-Pass-1";
        if (login["stage"]!.GetValue<string>() == "RequiresPasswordChange")
        {
            login = await Ok(await client.PostAsync("/api/v1/auth/login/change-password",
                Body(new { ticket = login["ticket"]!.GetValue<string>(), newPassword })));
        }
        else if (login["stage"]!.GetValue<string>() != "RequiresTwoFactorSetup")
        {
            throw new InvalidOperationException("unexpected admin stage " + login.ToJsonString());
        }
        _admin = await CompleteMfaSetupAsync(login);
        return _admin;
    }

    public async Task<Session> CompleteMfaSetupAsync(JsonNode stageResult)
    {
        stageResult["stage"]!.GetValue<string>().Should().Be("RequiresTwoFactorSetup", stageResult.ToJsonString());
        var ticket = stageResult["ticket"]!.GetValue<string>();
        var client = Client();
        var setup = await Ok(await client.PostAsync("/api/v1/auth/login/2fa/setup", Body(new { ticket })));
        var code = Totp.Compute(setup["sharedKey"]!.GetValue<string>());
        return ToSession(await Ok(await client.PostAsync("/api/v1/auth/login/2fa/enable", Body(new { ticket, code }))));
    }

    /// <summary>ينشئ مستخدماً ويمنحه دوراً إدارياً عبر AssignRole (الآلية الرسمية الوحيدة)، ثم يدخل بـ 2FA.</summary>
    public async Task<Session> StaffAsync(string role)
    {
        var email = $"{role.ToLowerInvariant()}_{Guid.NewGuid():N}@sanad.test";
        var user = await RegisterBeneficiaryAsync(email);
        var admin = await AdminAsync();
        (await Client(admin).PostAsync($"/api/v1/admin/users/{user.UserId}/roles", Body(new { role }))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var login = await Ok(await Client().PostAsync("/api/v1/auth/login/email", Body(new { email, password = "Strong-Pass-123" })));
        return await CompleteMfaSetupAsync(login);
    }

    public async Task<Guid> UploadDocumentAsync(Session session)
    {
        var bytes = "%PDF-1.4\n% synthetic test document\n"u8.ToArray();
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, "file", "license.pdf");
        var node = await Ok(await Client(session).PostAsync("/api/v1/me/documents", content));
        return Guid.Parse(node["id"]!.GetValue<string>());
    }

    public async Task<JsonNode> RequestUpgradeAsync(Session session, string type, string documentType)
    {
        var fileId = await UploadDocumentAsync(session);
        return await Ok(await Client(session).PostAsync("/api/v1/me/provider-upgrade-request", Body(new
        {
            requestedType = type,
            declaredTitle = type == "LicensedPhysician" ? "طبيب نفسي مرخّص" : "راقٍ شرعي مجاز",
            documentType,
            issuingAuthority = "جهة إصدار تجريبية",
            uploadedDocumentFileId = fileId,
        })));
    }

    public sealed record Practitioner(Session Session, Guid ProviderProfileId, Guid OfferingId, IReadOnlyList<Guid> SlotIds, string Email);

    /// <summary>مختص منشور كامل: تسجيل ← طلب ترقية ← اعتماد منسق ← إكمال الملف ← نشر ← خدمة ← فترات.</summary>
    public async Task<Practitioner> PublishedPractitionerAsync(string type = "LicensedPhysician", int slots = 3)
    {
        var email = $"prac_{Guid.NewGuid():N}@sanad.test";
        var user = await RegisterBeneficiaryAsync(email);
        var doc = type == "LicensedPhysician" ? "MedicalPracticeLicense" : "ShariaIjazah";
        var request = await RequestUpgradeAsync(user, type, doc);

        var coordinator = await CoordinatorAsync();
        await Ok(await Client(coordinator).PostAsync($"/api/v1/admin/verifications/{request["id"]}/review", Body(new
        {
            decision = "Approve",
            expiresAtUtc = DateTimeOffset.UtcNow.AddYears(1),
        })));

        // منح الدور يبطل الجلسات القائمة — دخول جديد
        var session = ToSession(await Ok(await Client().PostAsync("/api/v1/auth/login/email", Body(new { email, password = "Strong-Pass-123" }))));
        var practitioner = Client(session);
        await EnsureSuccess(await practitioner.PutAsync("/api/v1/me/provider-profile", Body(new
        {
            displayName = "د. مختص تجريبي",
            declaredTitle = type == "LicensedPhysician" ? "طبيب نفسي مرخّص" : "راقٍ شرعي مجاز",
            practiceScope = "استشارات وتوجيه ضمن نطاق مهني محدد",
            languages = new[] { "ar" },
            deliveryMode = "Remote",
            city = "الرياض",
            professionalBoundariesNote = "لا تشخيص عبر المنصة، والإحالة للطوارئ عند الخطر",
        })));
        await EnsureSuccess(await practitioner.PostAsync("/api/v1/me/provider-profile/publish", null));
        var profile = await Ok(await practitioner.GetAsync("/api/v1/me/provider-profile"));
        var offering = await Ok(await practitioner.PostAsync("/api/v1/me/provider-profile/offerings", Body(new
        {
            category = "استشارة فردية",
            description = "جلسة استشارية عن بعد",
            cancellationPolicy = "الإلغاء قبل 24 ساعة",
            explicitExclusions = new[] { "لا وصفات دوائية" },
            sessionDurationMinutes = 45,
        })));
        var slotIds = new List<Guid>();
        for (var i = 0; i < slots; i++)
        {
            var start = DateTimeOffset.UtcNow.AddDays(2 + i).AddMinutes(Random.Shared.Next(0, 600));
            var slot = await Ok(await practitioner.PostAsync("/api/v1/me/provider-profile/slots", Body(new { startUtc = start, endUtc = start.AddMinutes(45) })));
            slotIds.Add(Guid.Parse(slot["id"]!.GetValue<string>()));
        }
        return new Practitioner(session, Guid.Parse(profile["id"]!.GetValue<string>()), Guid.Parse(offering["id"]!.GetValue<string>()), slotIds, email);
    }

    private Session? _coordinator;
    private Session? _contentManager;

    public async Task<Session> CoordinatorAsync() => _coordinator ??= await StaffAsync("Coordinator");

    public async Task<Session> ContentManagerAsync() => _contentManager ??= await StaffAsync("ContentManager");

    public async Task<Guid> CreateBookingAsync(Session beneficiary, Practitioner p, int slotIndex = 0, string? note = null)
    {
        var node = await Ok(await Client(beneficiary, Guid.NewGuid().ToString()).PostAsync("/api/v1/bookings", Body(new
        {
            serviceOfferingId = p.OfferingId,
            availabilitySlotId = p.SlotIds[slotIndex],
            beneficiaryNote = note,
            consentToSensitiveNoteProcessing = note is not null,
        })));
        return Guid.Parse(node["id"]!.GetValue<string>());
    }

    public async Task<Guid> AcceptedBookingAsync(Session beneficiary, Practitioner p, int slotIndex = 0, string? note = null)
    {
        var id = await CreateBookingAsync(beneficiary, p, slotIndex, note);
        await EnsureSuccess(await Client(p.Session).PostAsync($"/api/v1/bookings/{id}/accept", null));
        return id;
    }

    /// <summary>مقطع منشور في المكتبة: رفع MP3 (توقيع ID3 فعلي) ← إنشاء ← نشر.</summary>
    public async Task<Guid> TrackAsync(bool publish = true)
    {
        var cm = Client(await ContentManagerAsync());
        using var content = new MultipartFormDataContent();
        var bytes = new byte[256];
        "ID3"u8.CopyTo(bytes);
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("audio/mpeg");
        content.Add(file, "file", "recitation.mp3");
        var upload = await Ok(await cm.PostAsync("/api/v1/admin/library/uploads", content));
        var track = await Ok(await cm.PostAsync("/api/v1/admin/library/tracks", Body(new
        {
            title = "آية الكرسي",
            sourceLabel = "تلاوة — مصدر تجريبي",
            description = "تلاوة للاستماع",
            category = "QuranRecitation",
            audioFileId = upload["id"]!.GetValue<string>(),
            durationSeconds = 90,
        })));
        var id = Guid.Parse(track["id"]!.GetValue<string>());
        if (publish) await Ok(await cm.PostAsync($"/api/v1/admin/library/tracks/{id}/publish", null));
        return id;
    }

    public static async Task EnsureSuccess(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"{(int)response.StatusCode} {response.RequestMessage?.RequestUri}: {await response.Content.ReadAsStringAsync()}");
    }
}
