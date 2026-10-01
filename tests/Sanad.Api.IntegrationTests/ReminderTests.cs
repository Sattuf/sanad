using System.Collections.Concurrent;
using System.Net;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Domain.Ruqyah;
using Sanad.Infrastructure.Jobs;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>مرسِل إشعارات مزيّف: يلتقط ما يُرسل بدل الاتصال بخدمات الدفع، ويحاكي جهازاً زال.</summary>
public sealed class ReminderFixture : IDisposable
{
    public ReminderFixture()
    {
        Factory = new SanadApiFactory(services =>
        {
            services.RemoveAll<IReminderPushSender>();
            services.AddSingleton<IReminderPushSender>(Sender);
        });
        Api = new TestApi(Factory);
    }

    public FakePushSender Sender { get; } = new();
    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }

    public void Dispose() => Factory.Dispose();

    public sealed class FakePushSender : IReminderPushSender
    {
        public ConcurrentQueue<(string Endpoint, ReminderPush Message)> Sent { get; } = new();

        public bool IsConfigured => true;
        public string? PublicKey => "BPublicKeyForTests";

        public Task<PushDelivery> SendAsync(ReminderDevice device, ReminderPush message, CancellationToken ct)
        {
            if (device.Endpoint.Contains("gone", StringComparison.Ordinal)) return Task.FromResult(PushDelivery.Gone);
            Sent.Enqueue((device.Endpoint, message));
            return Task.FromResult(PushDelivery.Delivered);
        }
    }
}

public sealed class ReminderTests(ReminderFixture fixture) : IClassFixture<ReminderFixture>
{
    private readonly TestApi _api = fixture.Api;

    // مفاتيح متصفح مولّدة لكل تشغيل (لا مفاتيح ثابتة في الكود)
    private static readonly string P256dh = B64Url(PublicPoint());
    private static readonly string AuthKey = B64Url(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16));

    private static string B64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] PublicPoint()
    {
        using var key = System.Security.Cryptography.ECDiffieHellman.Create(System.Security.Cryptography.ECCurve.NamedCurves.nistP256);
        var q = key.ExportParameters(false).Q;
        return [0x04, .. q.X!, .. q.Y!];
    }

    private static string Endpoint(string tag) => $"https://fcm.googleapis.com/fcm/send/{tag}-{Guid.NewGuid():N}";

    /// <summary>وقت يقع الآن في نافذة الإرسال بتوقيت UTC (قبل دقيقة).</summary>
    private static string NowMinusOne => DateTime.UtcNow.AddMinutes(-1).ToString("HH:mm");

    private static object Device(string endpoint, string? morning = null, string? evening = null, string? sleep = null, string tz = "UTC") =>
        new { endpoint, p256dh = P256dh, auth = AuthKey, timeZone = tz, morning, evening, sleep };

    [Fact]
    public async Task Push_config_exposes_only_the_public_key()
    {
        var config = await Ok(await _api.Client().GetAsync("/api/v1/public/reminders/push-config"));
        config["enabled"]!.GetValue<bool>().Should().BeTrue();
        config["publicKey"]!.GetValue<string>().Should().Be("BPublicKeyForTests");
    }

    [Fact]
    public async Task Device_is_registered_updated_and_removed_by_its_owner_only()
    {
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        var endpoint = Endpoint("own");

        var saved = await Ok(await me.PutAsync("/api/v1/me/reminders/device", Body(Device(endpoint, morning: "06:30", sleep: "22:30", tz: "Asia/Riyadh"))));
        saved["morning"]!.GetValue<string>().Should().Be("06:30");
        saved["evening"].Should().BeNull();

        // إعادة التسجيل من المتصفح نفسه تحدّث الصف ولا تكرره
        await Ok(await me.PutAsync("/api/v1/me/reminders/device", Body(Device(endpoint, evening: "17:30", tz: "Asia/Riyadh"))));
        var list = (await Ok(await me.GetAsync("/api/v1/me/reminders/devices"))).AsArray();
        list.Should().ContainSingle();
        list[0]!["evening"]!.GetValue<string>().Should().Be("17:30");
        list[0]!["morning"].Should().BeNull();

        var other = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await Ok(await other.GetAsync("/api/v1/me/reminders/devices"))).AsArray().Should().BeEmpty();
        (await other.PostAsync("/api/v1/me/reminders/device/remove", Body(new { endpoint }))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Ok(await me.GetAsync("/api/v1/me/reminders/devices"))).AsArray().Should().ContainSingle("لا يحذف غير المالك");

        (await me.PostAsync("/api/v1/me/reminders/device/remove", Body(new { endpoint }))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Ok(await me.GetAsync("/api/v1/me/reminders/devices"))).AsArray().Should().BeEmpty();

        (await _api.Client().PutAsync("/api/v1/me/reminders/device", Body(Device(Endpoint("anon"))))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("http://fcm.googleapis.com/fcm/send/x")]
    [InlineData("https://169.254.169.254/latest/meta-data")]
    [InlineData("https://fcm.googleapis.com.evil.example/x")]
    [InlineData("https://localhost:5001/hook")]
    public async Task Only_known_browser_push_services_are_accepted(string endpoint)
    {
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await me.PutAsync("/api/v1/me/reminders/device", Body(Device(endpoint, morning: "06:30"))))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Invalid_times_and_time_zones_are_rejected()
    {
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await me.PutAsync("/api/v1/me/reminders/device", Body(Device(Endpoint("tz"), morning: "06:30", tz: "Mars/Olympus"))))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await me.PutAsync("/api/v1/me/reminders/device", Body(Device(Endpoint("time"), morning: "25:00"))))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Scheduler_sends_due_reminders_once_and_drops_gone_devices()
    {
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        var endpoint = Endpoint("due");
        var gone = Endpoint("gone");
        await Ok(await me.PutAsync("/api/v1/me/reminders/device", Body(Device(endpoint, sleep: NowMinusOne))));
        await Ok(await me.PutAsync("/api/v1/me/reminders/device", Body(Device(gone, sleep: NowMinusOne))));

        var job = fixture.Factory.Services.GetRequiredService<AdhkarReminderJob>();
        await job.RunOnceAsync(CancellationToken.None);
        await job.RunOnceAsync(CancellationToken.None);

        var mine = fixture.Sender.Sent.Where(s => s.Endpoint == endpoint).ToList();
        mine.Should().ContainSingle("مرة واحدة في اليوم لكل وقت");
        mine[0].Message.Title.Should().Be("أذكار النوم");
        mine[0].Message.Url.Should().Be("/ruqyah/sleep");

        var devices = (await Ok(await me.GetAsync("/api/v1/me/reminders/devices"))).AsArray();
        devices.Select(d => d!["endpoint"]!.GetValue<string>()).Should().Equal(endpoint);
    }

    [Fact]
    public async Task Scheduler_pages_through_many_due_devices_skips_not_due_and_backfills_legacy_rows()
    {
        var owner = await _api.RegisterBeneficiaryAsync();
        var now = DateTimeOffset.UtcNow;
        var dueAt = TimeOnly.FromDateTime(now.AddMinutes(-1).UtcDateTime);
        var notDueAt = TimeOnly.FromDateTime(now.AddHours(3).UtcDateTime);
        var tag = Guid.NewGuid().ToString("N")[..8];
        var count = AdhkarReminderJob.PageSize + 150; // أكثر من صفحة

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Sanad.Infrastructure.Persistence.SanadDbContext>();
            for (var i = 0; i < count; i++)
            {
                var d = ReminderDevice.Register(owner.UserId, $"https://fcm.googleapis.com/fcm/send/bulk-{tag}-{i}", P256dh, AuthKey, now);
                d.Schedule("UTC", dueAt, null, null, now);
                db.ReminderDevices.Add(d);
            }
            var later = ReminderDevice.Register(owner.UserId, $"https://fcm.googleapis.com/fcm/send/later-{tag}", P256dh, AuthKey, now);
            later.Schedule("UTC", notDueAt, null, null, now);
            db.ReminderDevices.Add(later);
            var legacy = ReminderDevice.Register(owner.UserId, $"https://fcm.googleapis.com/fcm/send/legacy-{tag}", P256dh, AuthKey, now);
            legacy.Schedule("UTC", dueAt, null, null, now);
            db.ReminderDevices.Add(legacy);
            await db.SaveChangesAsync();
            // صف قديم من قبل إضافة العمود
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE ReminderDevices SET NextDueAtUtc = NULL WHERE Id = {legacy.Id}");
        }

        var job = fixture.Factory.Services.GetRequiredService<AdhkarReminderJob>();
        await job.RunOnceAsync(CancellationToken.None);
        await job.RunOnceAsync(CancellationToken.None);

        var sent = fixture.Sender.Sent.Select(s => s.Endpoint).Where(e => e.Contains(tag, StringComparison.Ordinal)).ToList();
        sent.Count(e => e.Contains("/bulk-", StringComparison.Ordinal)).Should().Be(count, "كل جهاز مستحق مرة واحدة عبر الصفحات");
        sent.Should().OnlyHaveUniqueItems();
        sent.Should().Contain(e => e.Contains("/legacy-", StringComparison.Ordinal), "الصفوف القديمة تُحسب مرة ثم تأخذ قيمتها");
        sent.Should().NotContain(e => e.Contains("/later-", StringComparison.Ordinal));

        await using var check = fixture.Factory.Services.CreateAsyncScope();
        var after = check.ServiceProvider.GetRequiredService<Sanad.Infrastructure.Persistence.SanadDbContext>();
        var remaining = await after.ReminderDevices.Where(d => d.Endpoint.Contains(tag)).ToListAsync();
        remaining.Should().OnlyContain(d => d.NextDueAtUtc > now, "بعد الإرسال يصبح الموعد التالي في المستقبل");
    }

    [Fact]
    public async Task Test_notification_reaches_the_device_and_account_deletion_removes_it()
    {
        var session = await _api.RegisterBeneficiaryAsync();
        var me = _api.Client(session);
        var endpoint = Endpoint("test");
        await Ok(await me.PutAsync("/api/v1/me/reminders/device", Body(Device(endpoint, morning: "06:30"))));

        (await me.PostAsync("/api/v1/me/reminders/device/test", Body(new { endpoint }))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        fixture.Sender.Sent.Should().Contain(s => s.Endpoint == endpoint && s.Message.Tag == "sanad-test");

        var export = await Ok(await me.PostAsync("/api/v1/me/export", null));
        export["reminderDevices"]!.AsArray().Should().ContainSingle();

        await EnsureSuccess(await me.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/v1/me") { Content = Body(new { confirmation = "احذف حسابي" }) }));
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<Sanad.Infrastructure.Persistence.SanadDbContext>();
        db.ReminderDevices.Any(d => d.Endpoint == endpoint).Should().BeFalse();
    }
}
