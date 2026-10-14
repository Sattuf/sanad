using System.Net;
using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Sanad.Application.Modules.Ruqyah;
using Sanad.Domain.Ruqyah;
using Sanad.Infrastructure.Notifications;

namespace Sanad.Api.IntegrationTests;

/// <summary>المرسِل الحقيقي مع خدمة دفع مزيّفة: توقيع VAPID، وتشفير الحمولة، وتفسير 410.</summary>
public sealed class WebPushSenderTests
{
    private static string B64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static (string Public, string Private) VapidKeys()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var p = key.ExportParameters(true);
        return (B64Url([0x04, .. p.Q.X!, .. p.Q.Y!]), B64Url(p.D!));
    }

    private static ReminderDevice Device(string endpoint)
    {
        using var client = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var q = client.ExportParameters(false).Q;
        return ReminderDevice.Register(Guid.NewGuid(), endpoint, B64Url([0x04, .. q.X!, .. q.Y!]), B64Url(RandomNumberGenerator.GetBytes(16)), DateTimeOffset.UtcNow);
    }

    private sealed class PushService(HttpStatusCode status) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public byte[] Body { get; private set; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            Body = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
            return new HttpResponseMessage(status);
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static WebPushReminderSender Sender(PushService service)
    {
        var (pub, priv) = VapidKeys();
        return new WebPushReminderSender(Options.Create(new WebPushOptions { Enabled = true, PublicKey = pub, PrivateKey = priv }),
            new Factory(service), NullLogger<WebPushReminderSender>.Instance);
    }

    [Fact]
    public async Task Sends_an_encrypted_vapid_signed_message_to_the_push_service()
    {
        var service = new PushService(HttpStatusCode.Created);
        using var sender = Sender(service);
        var device = Device("https://fcm.googleapis.com/fcm/send/abc");

        (await sender.SendAsync(device, ReminderMessages.For(ReminderSlot.Morning), CancellationToken.None)).Should().Be(PushDelivery.Delivered);

        service.Request!.RequestUri!.ToString().Should().Be(device.Endpoint);
        service.Request.Headers.Authorization!.Scheme.Should().Be("vapid");
        service.Request.Content!.Headers.ContentEncoding.Should().Contain("aes128gcm");
        service.Request.Headers.GetValues("TTL").Single().Should().Be("1800");
        System.Text.Encoding.UTF8.GetString(service.Body).Should().NotContain("أذكار", "الحمولة مشفّرة للجهاز");
    }

    [Fact]
    public async Task Gone_subscription_and_unknown_hosts_are_reported_as_gone()
    {
        var service = new PushService(HttpStatusCode.Gone);
        using var sender = Sender(service);
        (await sender.SendAsync(Device("https://updates.push.services.mozilla.com/wpush/v2/x"), ReminderMessages.Test, CancellationToken.None))
            .Should().Be(PushDelivery.Gone);

        var fresh = new PushService(HttpStatusCode.Created);
        using var sender2 = Sender(fresh);
        (await sender2.SendAsync(Device("https://internal.example/hook"), ReminderMessages.Test, CancellationToken.None)).Should().Be(PushDelivery.Gone);
        fresh.Request.Should().BeNull("لا طلب صادر لعنوان خارج خدمات الدفع");
    }
}
