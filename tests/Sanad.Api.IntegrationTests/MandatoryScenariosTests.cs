using System.Net;
using System.Text.RegularExpressions;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Accounts;
using Sanad.Domain.Identity;
using Sanad.Infrastructure.Identity;
using Sanad.Infrastructure.Persistence;
using Sanad.Infrastructure.Persistence.Outbox;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

public sealed class ApiFixture : IDisposable
{
    public ApiFixture()
    {
        Factory = new SanadApiFactory();
        Api = new TestApi(Factory);
    }

    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }

    public void Dispose() => Factory.Dispose();
}

[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>;

/// <summary>
/// حالات الاختبار الإلزامية — references/08-testing-deployment-roadmap.md §8.1 (1–17)، على الـ API الحقيقي كاملاً.
/// </summary>
[Collection("api")]
public sealed class MandatoryScenariosTests(ApiFixture fixture)
{
    private readonly TestApi _api = fixture.Api;

    // 1 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T01_no_publication_without_valid_verification()
    {
        var coordinator = _api.Client(await _api.CoordinatorAsync());
        var org = await Ok(await coordinator.PostAsync("/api/v1/admin/organizations", Body(new
        {
            legalName = "جمعية وقفية تجريبية", track = "WaqfFree", issuingAuthorityName = "وزارة الموارد", publicDescription = "خدمات إرشاد مجانية",
        })));
        var publish = await coordinator.PostAsync($"/api/v1/admin/organizations/{org["id"]}/publish", null);
        publish.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJson(publish))["code"]!.GetValue<string>().Should().Be("publication_gate");

        var directory = await Ok(await _api.Client().GetAsync("/api/v1/directory?q=" + Uri.EscapeDataString("وقفية")));
        directory["total"]!.GetValue<int>().Should().Be(0);
    }

    // 2 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T02_two_concurrent_bookings_on_same_slot_only_one_wins()
    {
        var p = await _api.PublishedPractitionerAsync();
        var a = await _api.RegisterBeneficiaryAsync();
        var b = await _api.RegisterBeneficiaryAsync();

        Task<HttpResponseMessage> Book(Session s) => _api.Client(s, Guid.NewGuid().ToString()).PostAsync("/api/v1/bookings",
            Body(new { serviceOfferingId = p.OfferingId, availabilitySlotId = p.SlotIds[0], consentToSensitiveNoteProcessing = false }));

        var results = await Task.WhenAll(Book(a), Book(b));
        results.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
        results.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(1);
    }

    // 3 — مغطّى بنيوياً في Domain (EscalationTests)، وهنا عبر المسار الكامل ─────────────
    [Fact]
    public async Task T03_escalation_never_decreases_without_explicit_coordinator_recompute()
    {
        var target = await _api.RegisterBeneficiaryAsync();
        var coordinator = _api.Client(await _api.CoordinatorAsync());
        for (var i = 0; i < 3; i++)
        {
            var reporter = await _api.RegisterBeneficiaryAsync();
            var report = await Ok(await _api.Client(reporter, Guid.NewGuid().ToString()).PostAsync("/api/v1/reports", Body(new
            {
                targetType = "UserAccount", targetId = target.UserId, category = "Harassment", severity = "Medium", description = "رسائل مزعجة متكررة",
            })));
            await Ok(await coordinator.PostAsync($"/api/v1/admin/reports/{report["id"]}/review", Body(new { substantiated = true, involvesPossibleCrimeOrMinorRisk = false })));
        }
        var cases = await Ok(await coordinator.GetAsync("/api/v1/admin/escalations"));
        cases.AsArray().Should().Contain(c => c!["subjectAccountId"]!.GetValue<string>() == target.UserId.ToString() && c["level"]!.GetValue<string>() == "Suspension");
    }

    // 4 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T04_risky_beneficiary_note_returns_emergency_referral_even_when_booking_fails()
    {
        var p = await _api.PublishedPractitionerAsync();
        var first = await _api.RegisterBeneficiaryAsync();
        await _api.CreateBookingAsync(first, p, 0);

        var second = await _api.RegisterBeneficiaryAsync();
        var res = await _api.Client(second, Guid.NewGuid().ToString()).PostAsync("/api/v1/bookings", Body(new
        {
            serviceOfferingId = p.OfferingId, availabilitySlotId = p.SlotIds[0], beneficiaryNote = "لم أعد أحتمل وأفكر في الانتحار",
            consentToSensitiveNoteProcessing = true,
        }));

        res.StatusCode.Should().Be(HttpStatusCode.Conflict, "الفترة محجوزة مسبقاً");
        res.Headers.GetValues("X-Sanad-Emergency-Referral").Should().Contain("1");
        var body = await ReadJson(res);
        body["emergencyReferral"]!["required"]!.GetValue<bool>().Should().BeTrue();
        body["emergencyReferral"]!["contacts"]!.AsArray().Should().NotBeEmpty();
    }

    [Fact]
    public async Task T04b_risky_note_on_successful_booking_is_saved_and_referral_returned()
    {
        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var res = await _api.Client(beneficiary, Guid.NewGuid().ToString()).PostAsync("/api/v1/bookings", Body(new
        {
            serviceOfferingId = p.OfferingId, availabilitySlotId = p.SlotIds[1], beneficiaryNote = "أريد أن أؤذي نفسي", consentToSensitiveNoteProcessing = true,
        }));
        var body = await Ok(res);
        body["emergencyReferral"]!["required"]!.GetValue<bool>().Should().BeTrue();
        res.Headers.Contains("X-Sanad-Emergency-Referral").Should().BeTrue();
    }

    // 5 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T05_prohibited_claims_are_rejected_with_400_never_saved_silently()
    {
        var p = await _api.PublishedPractitionerAsync();
        var practitioner = _api.Client(p.Session);

        var offering = await practitioner.PostAsync("/api/v1/me/provider-profile/offerings", Body(new
        {
            category = "رقية", description = "شفاء مضمون من السحر والعين", cancellationPolicy = "لا", sessionDurationMinutes = 30,
        }));
        offering.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(offering))["code"]!.GetValue<string>().Should().Be("content_policy_violation");

        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0);
        var note = await practitioner.PostAsync($"/api/v1/bookings/{booking}/provider-note", Body(new { text = "أعطيته وصفة دوائية بجرعة 20 ملغ" }));
        note.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var cm = _api.Client(await _api.ContentManagerAsync());
        var trackId = await _api.TrackAsync(publish: false);
        var update = await cm.PutAsync($"/api/v1/admin/library/tracks/{trackId}", Body(new
        {
            title = "رقية", sourceLabel = "مصدر", description = "علاج ناجع للسحر نهائياً", category = "Dua", durationSeconds = 60,
        }));
        update.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // 6 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T06_beneficiary_can_never_read_provider_case_note()
    {
        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0);
        await Ok(await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/provider-note", Body(new { text = "ملاحظة إشرافية: متابعة الأسبوع القادم" })));

        var res = await _api.Client(beneficiary).GetAsync($"/api/v1/bookings/{booking}/provider-note");
        res.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.NotFound);
        (await res.Content.ReadAsStringAsync()).Should().NotContain("متابعة الأسبوع");

        // والمختص نفسه يقرؤها
        var own = await Ok(await _api.Client(p.Session).GetAsync($"/api/v1/bookings/{booking}/provider-note"));
        own.AsArray().Should().ContainSingle();
    }

    [Fact]
    public async Task T06b_coordinator_without_open_escalation_cannot_read_case_note_but_supervisor_can()
    {
        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0);
        await Ok(await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/provider-note", Body(new { text = "ملاحظة خاصة" })));

        var coordinatorRes = await _api.Client(await _api.CoordinatorAsync()).GetAsync($"/api/v1/bookings/{booking}/provider-note");
        coordinatorRes.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var supervisor = await _api.StaffAsync("ClinicalSupervisor");
        var notes = await Ok(await _api.Client(supervisor).GetAsync($"/api/v1/bookings/{booking}/provider-note"));
        notes.AsArray().Should().ContainSingle();
    }

    // 7 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T07_same_idempotency_key_returns_same_result()
    {
        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var key = Guid.NewGuid().ToString();
        var payload = new { serviceOfferingId = p.OfferingId, availabilitySlotId = p.SlotIds[0], consentToSensitiveNoteProcessing = false };

        var first = await Ok(await _api.Client(beneficiary, key).PostAsync("/api/v1/bookings", Body(payload)));
        var second = await Ok(await _api.Client(beneficiary, key).PostAsync("/api/v1/bookings", Body(payload)));
        second["id"]!.GetValue<string>().Should().Be(first["id"]!.GetValue<string>());

        var mine = await Ok(await _api.Client(beneficiary).GetAsync("/api/v1/me/bookings"));
        mine.AsArray().Should().ContainSingle();

        var missing = await _api.Client(beneficiary).PostAsync("/api/v1/bookings", Body(payload));
        missing.StatusCode.Should().Be(HttpStatusCode.BadRequest, "Idempotency-Key إلزامي");
    }

    // 8 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T08_email_registration_grants_beneficiary_immediately_without_documents()
    {
        var session = await _api.RegisterBeneficiaryAsync();
        var me = await Ok(await _api.Client(session).GetAsync("/api/v1/me"));
        me["roles"]!.AsArray().Select(r => r!.GetValue<string>()).Should().Equal("Beneficiary");
    }

    [Fact]
    public async Task T08_phone_otp_registration_grants_beneficiary_immediately()
    {
        var phone = "+9665" + Random.Shared.Next(10000000, 99999999);
        (await _api.Client().PostAsync("/api/v1/auth/phone/request-otp", Body(new { phoneNumber = phone }))).StatusCode.Should().Be(HttpStatusCode.Accepted);

        var wrong = await _api.Client().PostAsync("/api/v1/auth/phone/verify-otp", Body(new { phoneNumber = phone, code = "000000" }));
        wrong.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var code = _api.Factory.Sms.LastCodeFor(phone);
        var session = ToSession(await Ok(await _api.Client().PostAsync("/api/v1/auth/phone/verify-otp", Body(new { phoneNumber = phone, code }))));
        var me = await Ok(await _api.Client(session).GetAsync("/api/v1/me"));
        me["roles"]!.AsArray().Select(r => r!.GetValue<string>()).Should().Equal("Beneficiary");

        // الرمز لمرة واحدة فقط
        var reuse = await _api.Client().PostAsync("/api/v1/auth/phone/verify-otp", Body(new { phoneNumber = phone, code }));
        reuse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task T08_google_login_grants_beneficiary_immediately()
    {
        await using var scope = _api.Factory.Services.CreateAsyncScope();
        var sender = scope.ServiceProvider.GetRequiredService<ISender>();
        var result = await sender.Send(new CompleteGoogleLoginCommand($"google-{Guid.NewGuid():N}", $"{Guid.NewGuid():N}@gmail.test", "مستخدم جوجل"));
        result.Stage.Should().Be("Succeeded");
        result.IsNewUser.Should().BeTrue();
        var user = await scope.ServiceProvider.GetRequiredService<IIdentityService>().GetUserAsync(result.UserId, CancellationToken.None);
        user!.Roles.Should().Equal(SanadRoles.Beneficiary);
    }

    // 9 ──────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T09_upgrade_request_does_not_change_role_until_coordinator_approves()
    {
        var email = $"{Guid.NewGuid():N}@sanad.test";
        var user = await _api.RegisterBeneficiaryAsync(email);
        var request = await _api.RequestUpgradeAsync(user, "ReligiousPractitioner", "ShariaIjazah");
        request["status"]!.GetValue<string>().Should().Be("PendingReview");

        var me = await Ok(await _api.Client(user).GetAsync("/api/v1/me"));
        me["roles"]!.AsArray().Select(r => r!.GetValue<string>()).Should().Equal("Beneficiary");
        me["hasPendingUpgradeRequest"]!.GetValue<bool>().Should().BeTrue();
        (await _api.Client(user).GetAsync("/api/v1/me/provider-profile")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        await Ok(await _api.Client(await _api.CoordinatorAsync()).PostAsync($"/api/v1/admin/verifications/{request["id"]}/review",
            Body(new { decision = "Approve", expiresAtUtc = DateTimeOffset.UtcNow.AddYears(1) })));

        // الجلسة القديمة أُبطلت بمنح الدور
        (await _api.Client(user).GetAsync("/api/v1/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        var fresh = ToSession(await Ok(await _api.Client().PostAsync("/api/v1/auth/login/email", Body(new { email, password = "Strong-Pass-123" }))));
        var after = await Ok(await _api.Client(fresh).GetAsync("/api/v1/me"));
        after["roles"]!.AsArray().Select(r => r!.GetValue<string>()).Should().Contain("Practitioner");
        after["practitionerType"]!.GetValue<string>().Should().Be("ReligiousPractitioner");
        after["providerProfileStatus"]!.GetValue<string>().Should().Be("Draft");
    }

    // 10 ─────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T10_admin_bootstrap_seeder_runs_only_once()
    {
        await _api.AdminAsync();
        await using var scope = _api.Factory.Services.CreateAsyncScope();
        var seeder = scope.ServiceProvider.GetRequiredService<AdminBootstrapSeeder>();
        (await seeder.RunAsync(CancellationToken.None)).Should().BeFalse();
        (await seeder.RunAsync(CancellationToken.None)).Should().BeFalse();
        var admins = await scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>().GetUsersInRoleAsync(SanadRoles.SystemAdmin);
        admins.Should().ContainSingle();
    }

    [Fact]
    public async Task T10b_system_admin_cannot_be_granted_from_the_application()
    {
        var target = await _api.RegisterBeneficiaryAsync();
        var res = await _api.Client(await _api.AdminAsync()).PostAsync($"/api/v1/admin/users/{target.UserId}/roles", Body(new { role = "SystemAdmin" }));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task T10c_staff_endpoint_rejects_session_without_mfa()
    {
        // مستفيد عادي بجلسة كلمة مرور لا يصل لأي مسار إداري
        var user = await _api.RegisterBeneficiaryAsync();
        (await _api.Client(user).GetAsync("/api/v1/admin/verifications")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _api.Client(user).GetAsync("/api/v1/admin/users")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // 11 + 17 ────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T11_T17_sensitive_columns_hold_no_readable_plain_text()
    {
        const string noteText = "ملاحظتي-السرية-للمختص-أرق";
        const string caseText = "ملاحظة-المختص-الخاصة-متابعة";
        const string guidanceText = "توصية-موجهة-خصص-وقتاً-للاستماع";
        const string messageText = "رسالة-إدارية-عن-الموعد";

        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0, noteText);
        await Ok(await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/provider-note", Body(new { text = caseText })));
        await Ok(await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/recommendations", Body(new { guidanceText })));
        var conversation = await Ok(await _api.Client(beneficiary).PostAsync($"/api/v1/bookings/{booking}/conversation", null));
        await Ok(await _api.Client(beneficiary).PostAsync($"/api/v1/conversations/{conversation["id"]}/messages", Body(new { body = messageText })));

        await using var connection = new SqliteConnection(_api.Factory.ConnectionString);
        await connection.OpenAsync();
        async Task<List<string>> Column(string sql)
        {
            var values = new List<string>();
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = sql;
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync()) if (!reader.IsDBNull(0)) values.Add(reader.GetString(0));
            return values;
        }

        var notes = await Column("SELECT BeneficiaryNoteEncrypted FROM BookingRequests");
        var caseNotes = await Column("SELECT NoteEncrypted FROM ProviderCaseNotes");
        var guidance = await Column("SELECT GuidanceTextEncrypted FROM ProviderRecommendations");
        var messages = await Column("SELECT BodyEncrypted FROM Messages");

        notes.Should().NotBeEmpty().And.OnlyContain(v => v.StartsWith("v1.") && !v.Contains("أرق"));
        caseNotes.Should().NotBeEmpty().And.OnlyContain(v => v.StartsWith("v1.") && !v.Contains("متابعة"));
        guidance.Should().NotBeEmpty().And.OnlyContain(v => v.StartsWith("v1.") && !v.Contains("للاستماع"));
        messages.Should().NotBeEmpty().And.OnlyContain(v => v.StartsWith("v1.") && !v.Contains("الموعد"));

        // ولا يتسرب أي نص حساس إلى سجل التدقيق أو Outbox
        var audit = string.Join("\n", await Column("SELECT COALESCE(MetadataJson,'') FROM AuditLogEntries"));
        var outbox = string.Join("\n", await Column("SELECT PayloadJson FROM OutboxMessages"));
        foreach (var secret in new[] { noteText, caseText, guidanceText, messageText })
        {
            audit.Should().NotContain(secret);
            outbox.Should().NotContain(secret);
        }

        // والقراءة المصرّح بها تفك التشفير فعلاً
        var readNote = await Ok(await _api.Client(p.Session).GetAsync($"/api/v1/bookings/{booking}/note"));
        readNote["note"]!.GetValue<string>().Should().Be(noteText);
    }

    // 12 ─────────────────────────────────────────────────────────────────────
    [Fact]
    public void T12_no_payment_or_subscription_code_anywhere_in_src()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "Sanad.sln"))) root = root.Parent;
        root.Should().NotBeNull();

        var pattern = new Regex("payment|subscription|FinanceOfficer", RegexOptions.IgnoreCase);
        var offenders = Directory.EnumerateFiles(Path.Combine(root!.FullName, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Where(f => pattern.IsMatch(File.ReadAllText(f)))
            .ToList();
        offenders.Should().BeEmpty();
    }

    // 13 ─────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T13_recommendation_with_medication_dose_is_rejected_like_service_description()
    {
        var p = await _api.PublishedPractitionerAsync("LicensedPhysician");
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0);

        var rec = await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/recommendations", Body(new { guidanceText = "خذ 500 ملغ مرتين يومياً" }));
        rec.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var recBody = await ReadJson(rec);

        var offering = await _api.Client(p.Session).PostAsync("/api/v1/me/provider-profile/offerings", Body(new
        {
            category = "استشارة", description = "خذ 500 ملغ مرتين يومياً", cancellationPolicy = "مرن", sessionDurationMinutes = 30,
        }));
        var offeringBody = await ReadJson(offering);
        recBody["policyCategory"]!.GetValue<string>().Should().Be(offeringBody["policyCategory"]!.GetValue<string>());

        (await Ok(await _api.Client(beneficiary).GetAsync("/api/v1/me/recommendations"))).AsArray().Should().BeEmpty();
    }

    // 14 ─────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T14_recommendation_with_unpublished_track_is_rejected()
    {
        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0);
        var draftTrack = await _api.TrackAsync(publish: false);

        var res = await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/recommendations",
            Body(new { guidanceText = "استمع لهذا المقطع", recommendedAudioTrackIds = new[] { draftTrack } }));
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(res))["code"]!.GetValue<string>().Should().Be("track_not_published");
    }

    [Fact]
    public async Task T14b_valid_recommendation_reaches_beneficiary_with_generic_notification_only()
    {
        var p = await _api.PublishedPractitionerAsync();
        var beneficiary = await _api.RegisterBeneficiaryAsync();
        var booking = await _api.AcceptedBookingAsync(beneficiary, p, 0);
        var track = await _api.TrackAsync();
        const string guidance = "خصص وقتاً هادئاً للاستماع، وتابع مع طبيبك المعالج";

        await Ok(await _api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/recommendations",
            Body(new { guidanceText = guidance, recommendedAudioTrackIds = new[] { track } })));

        var mine = await Ok(await _api.Client(beneficiary).GetAsync("/api/v1/me/recommendations"));
        mine.AsArray().Should().ContainSingle();
        mine[0]!["guidanceText"]!.GetValue<string>().Should().Be(guidance);
        mine[0]!["recommendedTracks"]!.AsArray().Should().ContainSingle();

        // مستفيد آخر لا يراها
        var other = await _api.RegisterBeneficiaryAsync();
        (await Ok(await _api.Client(other).GetAsync("/api/v1/me/recommendations"))).AsArray().Should().BeEmpty();

        // الإشعار عام — بلا نص التوصية
        var outbox = _api.Factory.Services.GetRequiredService<OutboxProcessor>();
        for (var i = 0; i < 50 && await outbox.ProcessBatchAsync(CancellationToken.None) > 0; i++) { }
        await using (var scope = _api.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SanadDbContext>();
            (await db.OutboxMessages.Where(m => m.LastError != null).Select(m => m.Type + ": " + m.LastError).ToListAsync())
                .Should().BeEmpty("كل معالِجات الأحداث يجب أن تنجح");
        }
        var notifications = await Ok(await _api.Client(beneficiary).GetAsync("/api/v1/me/notifications"));
        notifications.AsArray().Should().Contain(n => n!["kind"]!.GetValue<string>() == "recommendation.new");
        notifications.ToJsonString().Should().NotContain("هادئاً");
    }

    // 15 ─────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T15_physician_request_with_sharia_endorsement_is_rejected_for_document_mismatch()
    {
        var email = $"{Guid.NewGuid():N}@sanad.test";
        var user = await _api.RegisterBeneficiaryAsync(email);
        var request = await _api.RequestUpgradeAsync(user, "LicensedPhysician", "ShariaEndorsement");

        var queue = await Ok(await _api.Client(await _api.CoordinatorAsync()).GetAsync("/api/v1/admin/verifications"));
        queue.AsArray().Single(i => i!["verification"]!["id"]!.GetValue<string>() == request["id"]!.GetValue<string>())!
            ["documentMatchesDeclaredType"]!.GetValue<bool>().Should().BeFalse();

        var review = await Ok(await _api.Client(await _api.CoordinatorAsync()).PostAsync($"/api/v1/admin/verifications/{request["id"]}/review",
            Body(new { decision = "ConditionallyApprove", expiresAtUtc = DateTimeOffset.UtcNow.AddYears(1) })));
        review["autoRejectedForDocumentMismatch"]!.GetValue<bool>().Should().BeTrue();
        review["verification"]!["status"]!.GetValue<string>().Should().Be("Rejected");
        review["verification"]!["rejectionReason"]!.GetValue<string>().Should().Be("DocumentTypeMismatch");

        var fresh = ToSession(await Ok(await _api.Client().PostAsync("/api/v1/auth/login/email", Body(new { email, password = "Strong-Pass-123" }))));
        var me = await Ok(await _api.Client(fresh).GetAsync("/api/v1/me"));
        me["roles"]!.AsArray().Select(r => r!.GetValue<string>()).Should().Equal("Beneficiary");
    }

    // 16 ─────────────────────────────────────────────────────────────────────
    [Fact]
    public async Task T16_public_share_page_needs_no_auth_but_creating_link_does()
    {
        var track = await _api.TrackAsync();
        (await _api.Client().PostAsync($"/api/v1/library/tracks/{track}/share-link", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var user = await _api.RegisterBeneficiaryAsync();
        var link = await Ok(await _api.Client(user).PostAsync($"/api/v1/library/tracks/{track}/share-link", null));
        var code = link["shortCode"]!.GetValue<string>();

        var anonymous = _api.Client();
        var page = await Ok(await anonymous.GetAsync($"/api/v1/public/shared/{code}"));
        page["track"]!["title"]!.GetValue<string>().Should().Be("آية الكرسي");
        page.ToJsonString().Should().NotContain(user.UserId.ToString(), "زائر الرابط لا يرى أي بيانات مستخدم");

        var audio = await anonymous.GetAsync(page["track"]!["audioUrl"]!.GetValue<string>());
        audio.StatusCode.Should().Be(HttpStatusCode.OK);
        audio.Content.Headers.ContentType!.MediaType.Should().Be("audio/mpeg");

        // مقطع غير منشور: لا رابط ولا وسائط
        var draft = await _api.TrackAsync(publish: false);
        (await _api.Client(user).PostAsync($"/api/v1/library/tracks/{draft}/share-link", null)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await anonymous.GetAsync($"/api/v1/media/tracks/{draft}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
