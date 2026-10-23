using System.Collections.Concurrent;
using System.Net;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Infrastructure.Notifications;
using Sanad.Infrastructure.Persistence;
using Sanad.Infrastructure.Persistence.Outbox;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>FCM مفعّل بمرسِل وهمي: يسجّل ما أُرسل، ويرفض الرموز التي تبدأ بـ "gone-" كما يرفض FCM رمز تطبيق أُزيل.</summary>
public sealed class PushFixture : IDisposable
{
    public sealed class FakeFcm : IFcmSender
    {
        public ConcurrentQueue<(string Token, IReadOnlyDictionary<string, string> Data)> Sent { get; } = new();
        public bool IsConfigured => true;

        public Task<IReadOnlyList<string>> SendAsync(IReadOnlyList<string> tokens, IReadOnlyDictionary<string, string> data, CancellationToken ct)
        {
            foreach (var t in tokens) Sent.Enqueue((t, data));
            return Task.FromResult<IReadOnlyList<string>>(tokens.Where(t => t.StartsWith("gone-", StringComparison.Ordinal)).ToList());
        }
    }

    public PushFixture()
    {
        Factory = new SanadApiFactory(
            services => services.Replace(ServiceDescriptor.Singleton<IFcmSender>(Fcm)),
            new Dictionary<string, string> { ["FeatureManagement:PushNotifications"] = "true" });
        Api = new TestApi(Factory);
    }

    public FakeFcm Fcm { get; } = new();
    public SanadApiFactory Factory { get; }
    public TestApi Api { get; }
    public void Dispose() => Factory.Dispose();
}

public sealed class PushDeviceTests(PushFixture fx) : IClassFixture<PushFixture>
{
    private static string Token(string prefix = "fcm") => $"{prefix}-{Guid.NewGuid():N}{Guid.NewGuid():N}";

    private Task<HttpResponseMessage> Register(Session s, string token, string platform = "android") =>
        fx.Api.Client(s).PutAsync("/api/v1/me/push-devices", Body(new { token, platform }));

    /// <summary>الأحداث تمر بـ Outbox، وهو معطّل في الاختبارات: نشغّله يدوياً بعد الفعل.</summary>
    private async Task DrainOutboxAsync()
    {
        var outbox = fx.Factory.Services.GetRequiredService<OutboxProcessor>();
        while (await outbox.ProcessBatchAsync(CancellationToken.None) > 0) { }
    }

    private int DevicesOf(Guid userId)
    {
        using var scope = fx.Factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<SanadDbContext>().PushDevices.Count(d => d.UserId == userId);
    }

    [Fact]
    public async Task A_new_booking_reaches_the_providers_device_as_kind_and_link_only_never_text()
    {
        var p = await fx.Api.PublishedPractitionerAsync();
        await DrainOutboxAsync(); // إشعار قبول التوثيق السابق، قبل تسجيل الجهاز
        var device = Token();
        (await Register(p.Session, device)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await fx.Api.CreateBookingAsync(await fx.Api.RegisterBeneficiaryAsync(), p, 0, "ملاحظة سرية للمختص");
        await DrainOutboxAsync();

        var sent = fx.Fcm.Sent.Where(s => s.Token == device).Select(s => s.Data).ToList();
        sent.Should().ContainSingle();
        sent[0].Should().ContainKey("kind").WhoseValue.Should().Be("booking.submitted");
        sent[0].Keys.Should().BeSubsetOf(["kind", "link"], "the app writes the visible text itself, so no title, body or note goes through FCM");
        string.Join(" ", sent[0].Values).Should().NotContain("سرية");
    }

    [Fact]
    public async Task A_token_rejected_by_fcm_is_deleted()
    {
        var p = await fx.Api.PublishedPractitionerAsync();
        await Register(p.Session, Token("gone"));
        await Register(p.Session, Token());
        DevicesOf(p.Session.UserId).Should().Be(2);

        await fx.Api.CreateBookingAsync(await fx.Api.RegisterBeneficiaryAsync(), p);
        await DrainOutboxAsync();

        DevicesOf(p.Session.UserId).Should().Be(1);
    }

    [Fact]
    public async Task The_same_device_moves_to_the_account_now_signed_in_and_is_removed_on_sign_out_and_deletion()
    {
        var first = await fx.Api.RegisterBeneficiaryAsync();
        var second = await fx.Api.RegisterBeneficiaryAsync();
        var device = Token();

        await Register(first, device);
        await Register(second, device);
        DevicesOf(first.UserId).Should().Be(0);
        DevicesOf(second.UserId).Should().Be(1);

        (await fx.Api.Client(second).PostAsync("/api/v1/me/push-devices/remove", Body(new { token = device }))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        DevicesOf(second.UserId).Should().Be(0);

        await Register(second, Token());
        await EnsureSuccess(await fx.Api.Client(second).SendAsync(
            new HttpRequestMessage(HttpMethod.Delete, "/api/v1/me") { Content = Body(new { confirmation = "احذف حسابي" }) }));
        DevicesOf(second.UserId).Should().Be(0);
    }

    [Fact]
    public async Task Invalid_tokens_and_platforms_are_refused_and_each_account_keeps_at_most_ten_devices()
    {
        var user = await fx.Api.RegisterBeneficiaryAsync();
        foreach (var (token, platform) in new[] { ("short", "android"), (Token(), "windows"), ("has space " + Token(), "android") })
            (await Register(user, token, platform)).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        for (var i = 0; i < 12; i++) await Register(user, Token());
        DevicesOf(user.UserId).Should().Be(10);
    }
}
