using System.Net;
using System.Text.Json.Nodes;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Infrastructure.Persistence.Outbox;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>
/// تطبيق «سند» للرقية الذاتية (ADR-0021) على الـ API الحقيقي: نشر الخطط بإذن المعدّ ومراجعة ثانية وفحص أمان،
/// مزامنة الخطة، الختمة الجماعية بخصوصية النيّة، أرقام الطوارئ بعينين، والعدّادات المجهولة.
/// </summary>
public sealed class CompanionTests(ReminderFixture fixture) : IClassFixture<ReminderFixture>
{
    private readonly TestApi _api = fixture.Api;

    private static readonly object AllChecked = new
    {
        noSymptomQuestions = true,
        noConditionLabels = true,
        noHealingPromise = true,
        noLeavingMedicalCare = true,
        noSales = true,
        noExhaustingPractices = true,
        noWorseningAsProof = true,
        noDreamInterpretation = true,
    };

    private static object[] Days(int n) => Enumerable.Range(1, n).Select(d => (object)new
    {
        day = d,
        items = new object[]
        {
            new { kind = "Note", text = "اقرأ بتدبّر. والرقية لا تعني ترك العلاج الموصوف لك.", repeat = 1 },
            new { kind = "Quran", quranKey = "kursi", title = "آية الكرسي", repeat = 3 },
            new { kind = "Dhikr", title = "بسم الله الذي لا يضر", text = "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ", source = "رواه أبو داود (5088)", repeat = 3 },
        },
    }).ToArray();

    private static object Plan(string key, Guid authorId, string summary = "آية الكرسي وأذكار اليوم والليلة") => new
    {
        key,
        title = "تحصين الصباح والمساء",
        summary,
        contents = "آية الكرسي والأذكار الثابتة في السنة.",
        authorId,
        durationDays = 7,
        minutesPerDay = 10,
        days = Days(7),
    };

    private async Task<(HttpClient Author, HttpClient Reviewer, Guid AuthorId)> ContentTeamAsync(bool consent = true)
    {
        var author = _api.Client(await _api.ContentManagerAsync());
        var reviewer = _api.Client(await _api.StaffAsync("ContentManager"));
        var a = await Ok(await author.PostAsync("/api/v1/admin/companion/authors", Body(new { displayName = "الشيخ المعدّ", bio = "إمام وخطيب، يعدّ أوراد الرقية من الكتاب والسنة." })));
        var id = Guid.Parse(a["id"]!.GetValue<string>());
        if (consent)
            await Ok(await author.PostAsync($"/api/v1/admin/companion/authors/{id}/consent", Body(new { consentRef = "إذن-2026-001", consentDate = DateTime.UtcNow.ToString("yyyy-MM-dd") })));
        return (author, reviewer, id);
    }

    private async Task<Guid> PublishedPlanAsync()
    {
        var (author, reviewer, authorId) = await ContentTeamAsync();
        var plan = await Ok(await author.PostAsync("/api/v1/admin/companion/plans", Body(Plan(Key(), authorId))));
        var id = plan["id"]!.GetValue<string>();
        await Ok(await author.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new { action = "Submit" })));
        await Ok(await reviewer.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new { action = "Approve", safety = AllChecked })));
        return Guid.Parse(id);
    }

    private static string Key() => "plan-" + Guid.NewGuid().ToString("N")[..12];

    private async Task<JsonArray> PublicPlans() => (await Ok(await _api.Client().GetAsync("/api/v1/public/companion/plans"))).AsArray();

    [Fact]
    public async Task Plan_is_published_only_with_written_consent_second_review_and_full_safety_check()
    {
        var (author, reviewer, authorId) = await ContentTeamAsync(consent: false);
        var key = Key();
        var plan = await Ok(await author.PostAsync("/api/v1/admin/companion/plans", Body(Plan(key, authorId))));
        var id = plan["id"]!.GetValue<string>();
        plan["status"]!.GetValue<string>().Should().Be("Draft");
        plan["version"]!.GetValue<int>().Should().Be(1);
        (await PublicPlans()).Should().NotContain(p => p!["id"]!.GetValue<string>() == id);

        await Ok(await author.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new { action = "Submit" })));
        var self = await author.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new { action = "Approve", safety = AllChecked }));
        self.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(self))["code"]!.GetValue<string>().Should().Be("self_review");

        var noConsent = await reviewer.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new { action = "Approve", safety = AllChecked }));
        noConsent.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await ReadJson(noConsent))["code"]!.GetValue<string>().Should().Be("publication_gate");

        await Ok(await author.PostAsync($"/api/v1/admin/companion/authors/{authorId}/consent", Body(new { consentRef = "إذن-1", consentDate = DateTime.UtcNow.ToString("yyyy-MM-dd") })));
        var partial = await reviewer.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new
        {
            action = "Approve",
            safety = new
            {
                noSymptomQuestions = true,
                noConditionLabels = true,
                noHealingPromise = true,
                noLeavingMedicalCare = true,
                noSales = true,
                noExhaustingPractices = true,
                noWorseningAsProof = true,
                noDreamInterpretation = false
            },
        }));
        partial.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var published = await Ok(await reviewer.PostAsync($"/api/v1/admin/companion/plans/{id}/review", Body(new { action = "Approve", safety = AllChecked })));
        published["status"]!.GetValue<string>().Should().Be("Published");
        published["safetyCheckedAtUtc"].Should().NotBeNull();

        var listed = (await PublicPlans()).Single(p => p!["id"]!.GetValue<string>() == id)!;
        listed["author"]!["displayName"]!.GetValue<string>().Should().Be("الشيخ المعدّ");
        listed["author"]!["consentDate"].Should().NotBeNull();
        var detail = await Ok(await _api.Client().GetAsync($"/api/v1/public/companion/plans/{id}"));
        detail["days"]!.AsArray().Should().HaveCount(7);
        detail["days"]![0]!["items"]![1]!["quranKey"]!.GetValue<string>().Should().Be("kursi");
        detail["isCurrent"]!.GetValue<bool>().Should().BeTrue();

        // المنشور لا يُعدَّل؛ الإصدار الجديد ينشره مراجع آخر فيصير السابق مستبدلاً ويبقى لمن سجّل فيه
        (await author.PutAsync($"/api/v1/admin/companion/plans/{id}", Body(Plan(key, authorId)))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        var v2 = await Ok(await author.PostAsync($"/api/v1/admin/companion/plans/{id}/versions", null));
        var v2Id = v2["id"]!.GetValue<string>();
        v2["version"]!.GetValue<int>().Should().Be(2);
        await Ok(await author.PutAsync($"/api/v1/admin/companion/plans/{v2Id}", Body(Plan(key, authorId, "آية الكرسي والمعوذات وأذكار اليوم"))));
        await Ok(await author.PostAsync($"/api/v1/admin/companion/plans/{v2Id}/review", Body(new { action = "Submit" })));
        await Ok(await reviewer.PostAsync($"/api/v1/admin/companion/plans/{v2Id}/review", Body(new { action = "Approve", safety = AllChecked })));
        var plans = await PublicPlans();
        plans.Should().Contain(p => p!["id"]!.GetValue<string>() == v2Id);
        plans.Should().NotContain(p => p!["id"]!.GetValue<string>() == id);
        (await Ok(await _api.Client().GetAsync($"/api/v1/public/companion/plans/{id}")))["isCurrent"]!.GetValue<bool>().Should().BeFalse();

        // تعديل تعريف المعدّ يُسقط إذنه فتختفي خططه حتى يُسجَّل إذن جديد
        await Ok(await author.PutAsync($"/api/v1/admin/companion/authors/{authorId}", Body(new { displayName = "اسم آخر", bio = "نبذة أخرى." })));
        (await PublicPlans()).Should().NotContain(p => p!["id"]!.GetValue<string>() == v2Id);
        (await _api.Client().GetAsync($"/api/v1/public/companion/plans/{v2Id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Plan_text_describing_a_condition_or_promising_cure_is_rejected_and_admin_is_staff_only()
    {
        var (author, _, authorId) = await ContentTeamAsync();
        var bad = await author.PostAsync("/api/v1/admin/companion/plans", Body(Plan(Key(), authorId, "خطة لعلاج السحر المأكول")));
        bad.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(bad))["code"]!.GetValue<string>().Should().Be("content_policy_violation");

        var unknownPassage = Plan(Key(), authorId);
        var json = JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(unknownPassage, Json))!;
        json["days"]![0]!["items"]![1]!["quranKey"] = "baqarah-full";
        (await author.PostAsync("/api/v1/admin/companion/plans", new StringContent(json.ToJsonString(), System.Text.Encoding.UTF8, "application/json")))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var beneficiary = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await beneficiary.GetAsync("/api/v1/admin/companion/plans")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await beneficiary.GetAsync("/api/v1/admin/companion/emergency")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _api.Client().GetAsync("/api/v1/admin/companion/authors")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Enrollment_merges_days_from_devices_and_belongs_to_its_owner_only()
    {
        var planId = await PublishedPlanAsync();
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await Ok(await me.GetAsync("/api/v1/me/companion/enrollment")))["enrollment"].Should().BeNull();

        // خطة بدأها على جهازه قبل الدخول: أيامها تأتي معها
        var e = await Ok(await me.PostAsync("/api/v1/me/companion/enrollment", Body(new { planId, reminder = "AfterFajr", completedDays = new[] { 1, 2 } })));
        var id = e["id"]!.GetValue<string>();
        e["currentDay"]!.GetValue<int>().Should().Be(3);

        var merged = await Ok(await me.PutAsync($"/api/v1/me/companion/enrollment/{id}/progress", Body(new { completedDays = new[] { 2, 3 }, lastCompletedOn = DateTime.UtcNow.ToString("yyyy-MM-dd") })));
        merged["completedDays"]!.AsArray().Select(x => x!.GetValue<int>()).Should().Equal(1, 2, 3);
        (await me.PutAsync($"/api/v1/me/companion/enrollment/{id}/progress", Body(new { completedDays = new[] { 9 } }))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var other = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await other.PutAsync($"/api/v1/me/companion/enrollment/{id}/progress", Body(new { completedDays = new[] { 4 } }))).StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await me.DeleteAsync("/api/v1/me/companion/enrollment")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Ok(await me.GetAsync("/api/v1/me/companion/enrollment")))["enrollment"].Should().BeNull();
        (await _api.Client().GetAsync("/api/v1/me/companion/enrollment")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Group_khatma_keeps_intention_among_members_and_notifies_only_on_completion()
    {
        var ownerSession = await _api.RegisterBeneficiaryAsync();
        var owner = _api.Client(ownerSession);
        var k = await Ok(await owner.PostAsync("/api/v1/me/companion/khatmas", Body(new
        {
            mode = "Group",
            title = "ختمة الأسرة",
            intention = "على نية شفاء الوالدة",
            displayName = "أم محمد",
        })));
        var id = k["id"]!.GetValue<string>();
        var code = k["inviteCode"]!.GetValue<string>();
        k["intention"]!.GetValue<string>().Should().Be("على نية شفاء الوالدة");

        var memberSession = await _api.RegisterBeneficiaryAsync();
        var member = _api.Client(memberSession);
        var preview = await Ok(await member.GetAsync($"/api/v1/me/companion/invites/{code}"));
        preview["title"]!.GetValue<string>().Should().Be("ختمة الأسرة");
        preview.ToJsonString().Should().NotContain("الوالدة", "النيّة لا تظهر قبل الانضمام").And.NotContain("أم محمد");
        (await member.GetAsync($"/api/v1/me/companion/khatmas/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        var joined = await Ok(await member.PostAsync($"/api/v1/me/companion/invites/{code}/join", Body(new { displayName = "أحمد" })));
        joined["intention"]!.GetValue<string>().Should().Be("على نية شفاء الوالدة");
        joined["inviteCode"].Should().BeNull("رمز الدعوة يراه المنشئ فقط");
        joined.ToJsonString().Should().NotContain(ownerSession.UserId.ToString(), "لا يُكشف معرّف حساب أي عضو");

        // اختيار الأجزاء: لا يأخذ أحد جزء غيره ولا يقرؤه عنه
        await Ok(await member.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "Claim", juz = new[] { 21, 22 } })));
        (await owner.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "Claim", juz = new[] { 21 } }))).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await owner.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "MarkDone", juz = new[] { 22 } }))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await member.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "Distribute" }))).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var outsider = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await outsider.GetAsync($"/api/v1/me/companion/khatmas/{id}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await outsider.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "MarkDone", juz = new[] { 1 } }))).StatusCode.Should().Be(HttpStatusCode.NotFound);

        var dist = await Ok(await owner.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "Distribute" })));
        dist["juz"]!.AsArray().Should().OnlyContain(j => j!["memberKey"] != null);

        // جهاز «سند» للعضو يستقبل إشعار الإتمام فقط
        await Ok(await member.PutAsync("/api/v1/me/reminders/device", Body(Device($"https://fcm.googleapis.com/fcm/send/khatma-{Guid.NewGuid():N}", "Companion"))));
        var webEndpoint = $"https://fcm.googleapis.com/fcm/send/web-{Guid.NewGuid():N}";
        await Ok(await member.PutAsync("/api/v1/me/reminders/device", Body(Device(webEndpoint, null))));

        async Task MarkMine(HttpClient c)
        {
            var state = await Ok(await c.GetAsync($"/api/v1/me/companion/khatmas/{id}"));
            var mine = state["juz"]!.AsArray().Where(j => j!["isMine"]!.GetValue<bool>()).Select(j => j!["index"]!.GetValue<int>()).ToArray();
            await Ok(await c.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "MarkDone", juz = mine })));
        }
        await MarkMine(owner);
        await RunOutboxAsync();
        fixture.Sender.Sent.Should().NotContain(s => s.Message.Tag == "sanad-khatma", "لا إشعار عند كل جزء");
        await MarkMine(member);
        var done = await Ok(await owner.GetAsync($"/api/v1/me/companion/khatmas/{id}"));
        done["doneCount"]!.GetValue<int>().Should().Be(30);
        done["completedAtUtc"].Should().NotBeNull();

        await RunOutboxAsync();
        var pushes = fixture.Sender.Sent.Where(s => s.Message.Tag == "sanad-khatma").ToList();
        pushes.Should().ContainSingle("جهاز «سند» وحده، لا جهاز «الرقية والتحصين»");
        pushes[0].Endpoint.Should().NotBe(webEndpoint);
        pushes[0].Message.Body.Should().NotContain("الأسرة").And.NotContain("الوالدة");
        var notes = await Ok(await member.GetAsync("/api/v1/me/notifications"));
        notes.AsArray().Should().Contain(n => n!["kind"]!.GetValue<string>() == "khatma.completed");
        notes.ToJsonString().Should().NotContain("الوالدة");

        // تجديد الدعوة يُبطل الرمز القديم
        var rotated = await Ok(await owner.PostAsync($"/api/v1/me/companion/khatmas/{id}/actions", Body(new { action = "RotateInvite" })));
        rotated["inviteCode"]!.GetValue<string>().Should().NotBe(code);
        (await outsider.GetAsync($"/api/v1/me/companion/invites/{code}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await outsider.GetAsync("/api/v1/me/companion/invites/not-a-code")).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // حذف حساب المنشئ: تنتقل الختمة لأقدم عضو
        (await owner.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/v1/me") { Content = Body(new { confirmation = "احذف حسابي" }) }))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        var after = await Ok(await member.GetAsync($"/api/v1/me/companion/khatmas/{id}"));
        after["isOwner"]!.GetValue<bool>().Should().BeTrue();
        after["members"]!.AsArray().Should().ContainSingle();
    }

    [Fact]
    public async Task Self_harm_signal_in_intention_raises_emergency_referral()
    {
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        var res = await me.PostAsync("/api/v1/me/companion/khatmas", Body(new { mode = "Solo", title = "ختمتي", intention = "أفكر في الانتحار", displayName = "أنا" }));
        res.Headers.TryGetValues("X-Sanad-Emergency-Referral", out var values).Should().BeTrue();
        values!.Should().Contain("1");
    }

    [Fact]
    public async Task Emergency_numbers_are_shown_only_after_verification_by_a_second_staff_member()
    {
        var coordinator = _api.Client(await _api.CoordinatorAsync());
        var supervisor = _api.Client(await _api.StaffAsync("ClinicalSupervisor"));
        var country = "Q" + (char)('A' + Random.Shared.Next(26));

        var c = await Ok(await coordinator.PostAsync("/api/v1/admin/companion/emergency", Body(new
        {
            countryCode = country,
            label = "الإسعاف",
            phoneNumber = "997",
            sourceRef = "الموقع الرسمي للجهة",
            sortOrder = 0,
        })));
        var id = c["id"]!.GetValue<string>();
        var before = await Ok(await _api.Client().GetAsync($"/api/v1/public/companion/emergency?country={country}"));
        before["isFallback"]!.GetValue<bool>().Should().BeTrue("غير المعتمد لا يُعرض");

        var self = await coordinator.PostAsync($"/api/v1/admin/companion/emergency/{id}/verify", null);
        self.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(self))["code"]!.GetValue<string>().Should().Be("self_review");

        await Ok(await supervisor.PostAsync($"/api/v1/admin/companion/emergency/{id}/verify", null));
        var after = await Ok(await _api.Client().GetAsync($"/api/v1/public/companion/emergency?country={country.ToLowerInvariant()}"));
        after["isFallback"]!.GetValue<bool>().Should().BeFalse();
        after["contacts"]!.AsArray().Should().Contain(x => x!["phoneNumber"]!.GetValue<string>() == "997");

        (await coordinator.PostAsync("/api/v1/admin/companion/emergency", Body(new { countryCode = country, label = "رقم", phoneNumber = "tel:997", sourceRef = "x", sortOrder = 0 })))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var cm = _api.Client(await _api.ContentManagerAsync());
        (await cm.GetAsync("/api/v1/admin/companion/emergency")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Events_are_anonymous_daily_counters_from_an_allowlist()
    {
        var anon = _api.Client();
        (await anon.PostAsync("/api/v1/public/companion/events", Body(new
        {
            events = new object[]
            {
                new { name = "plan_started", dimension = "40" },
                new { name = "plan_started", dimension = "40" },
                new { name = "search_query", dimension = "رقية" },
                new { name = "plan_started", dimension = "someone@example.com" },
            },
        }))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var stats = await Ok(await _api.Client(await _api.ContentManagerAsync()).GetAsync("/api/v1/admin/companion/stats?days=1"));
        stats["totals"]!["plan_started"]!.GetValue<long>().Should().BeGreaterThanOrEqualTo(2);
        stats.ToJsonString().Should().NotContain("search_query").And.NotContain("example.com");

        var beneficiary = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await beneficiary.GetAsync("/api/v1/admin/companion/stats")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await anon.PostAsync("/api/v1/public/companion/events", Body(new { events = Array.Empty<object>() }))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Support_url_is_hidden_unless_configured_as_https()
    {
        var config = await Ok(await _api.Client().GetAsync("/api/v1/public/companion/config"));
        config["supportUrl"].Should().BeNull();
    }

    private static readonly string P256dh = B64Url(PublicPoint());
    private static readonly string AuthKey = B64Url(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16));

    private static string B64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] PublicPoint()
    {
        using var key = System.Security.Cryptography.ECDiffieHellman.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256);
        var q = key.ExportParameters(false).Q;
        return [0x04, .. q.X!, .. q.Y!];
    }

    private static object Device(string endpoint, string? client) =>
        new { endpoint, p256dh = P256dh, auth = AuthKey, timeZone = "UTC", morning = "05:30", client };

    private async Task RunOutboxAsync()
    {
        var outbox = _api.Factory.Services.GetRequiredService<OutboxProcessor>();
        for (var i = 0; i < 50 && await outbox.ProcessBatchAsync(CancellationToken.None) > 0; i++) { }
    }
}
