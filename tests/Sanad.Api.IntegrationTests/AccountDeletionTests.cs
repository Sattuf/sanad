using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Sanad.Api.IntegrationTests.Infrastructure;
using Sanad.Infrastructure.Persistence;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

public sealed class AccountDeletionFixture : IDisposable
{
    public SanadApiFactory Factory { get; } = new();
    public void Dispose() => Factory.Dispose();
}

/// <summary>
/// ما تَعِد به سياسة الخصوصية (docs/privacy): بعد حذف الحساب لا يبقى صف يحمل معرّف المستخدم
/// في الإشعارات، ولا ردود مفاتيح التكرار، ولا جلسات — وما يُحفظ للسجل يبقى مجهول الهوية فقط.
/// </summary>
public sealed class AccountDeletionTests(AccountDeletionFixture fixture) : IClassFixture<AccountDeletionFixture>
{
    [Fact]
    public async Task Deleting_an_account_leaves_no_notification_idempotency_or_session_row_for_the_user()
    {
        var api = new TestApi(fixture.Factory);
        var session = await api.RegisterBeneficiaryAsync();
        await using (var seed = fixture.Factory.Services.CreateAsyncScope())
        {
            var db = seed.ServiceProvider.GetRequiredService<SanadDbContext>();
            db.UserNotifications.Add(new UserNotification { UserId = session.UserId, Kind = "booking", Title = "تحديث", Body = "لديك تحديث", CreatedAtUtc = DateTimeOffset.UtcNow });
            db.IdempotencyRecords.Add(new IdempotencyRecord { Key = "k1", UserId = session.UserId, RequestName = "X", ResponseJson = "{\"email\":\"me@sanad.test\"}", CreatedAtUtc = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
            db.RefreshTokens.Any(t => t.UserId == session.UserId).Should().BeTrue("registration opens a session");
        }

        await EnsureSuccess(await api.Client(session).SendAsync(
            new HttpRequestMessage(HttpMethod.Delete, "/api/v1/me") { Content = Body(new { confirmation = "احذف حسابي" }) }));

        await using var check = fixture.Factory.Services.CreateAsyncScope();
        var after = check.ServiceProvider.GetRequiredService<SanadDbContext>();
        after.UserNotifications.Any(n => n.UserId == session.UserId).Should().BeFalse();
        after.IdempotencyRecords.Any(r => r.UserId == session.UserId).Should().BeFalse();
        after.RefreshTokens.Any(t => t.UserId == session.UserId).Should().BeFalse();
        (await api.Client().PostAsync("/api/v1/auth/refresh", Body(new { refreshToken = session.RefreshToken }))).IsSuccessStatusCode.Should().BeFalse();
    }
}
