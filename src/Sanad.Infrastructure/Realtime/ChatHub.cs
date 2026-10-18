using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Realtime;

/// <summary>
/// Hub للبث اللحظي فقط (إشعار بوصول رسالة/تحديث). لا يستقبل أي نص من العميل — الإرسال عبر REST
/// حتى يمر بكل ضوابط الـ Pipeline (التشفير، التدقيق).
/// </summary>
[Authorize]
public sealed class ChatHub : Hub
{
    public static string UserGroup(Guid userId) => $"user:{userId}";

    public override async Task OnConnectedAsync()
    {
        if (Guid.TryParse(Context.UserIdentifier, out var userId))
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
        await base.OnConnectedAsync();
    }
}

public sealed class SignalRRealtimePublisher(IHubContext<ChatHub> hub) : IRealtimePublisher
{
    public Task PublishToUserAsync(Guid userId, string eventName, object payload, CancellationToken ct) =>
        hub.Clients.Group(ChatHub.UserGroup(userId)).SendAsync(eventName, payload, ct);
}
