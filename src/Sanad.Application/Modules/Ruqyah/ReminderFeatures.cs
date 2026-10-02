using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Ruqyah;

namespace Sanad.Application.Modules.Ruqyah;

// ── تذكير الأذكار عبر إشعارات الجوال (Web Push) ─────────────────────────────
// المتصفح يُنشئ عنوان إشعار لدى خدمة الدفع التابعة له (Google/Mozilla/Apple/Microsoft)، ونخزّنه مع الأوقات
// بتوقيت المستخدم. مهمة خلفية ترسل في الوقت نصاً عاماً ثابتاً (اسم الورد فقط) — لا بيانات شخصية في الإشعار.

public sealed record ReminderPush(string Title, string Body, string Url, string Tag);

public enum PushDelivery { Delivered, Gone, Failed }

/// <summary>مرسِل Web Push بمفاتيح VAPID. غير مُعدّ ⇐ لا يُعرض خيار الإشعارات في الواجهة.</summary>
public interface IReminderPushSender
{
    bool IsConfigured { get; }
    string? PublicKey { get; }
    Task<PushDelivery> SendAsync(ReminderDevice device, ReminderPush message, CancellationToken ct);
}

public static class ReminderMessages
{
    /// <summary>تطبيق «سند» للرقية الذاتية: تذكير واحد هادئ بالورد، أياً كان الوقت المختار — ولا ذكر للأيام الفائتة أبداً.</summary>
    public static ReminderPush For(ReminderSlot slot, ReminderClient client) =>
        client == ReminderClient.Companion ? Companion.CompanionPushMessages.Wird : For(slot);

    public static ReminderPush TestFor(ReminderClient client) => client == ReminderClient.Companion ? Companion.CompanionPushMessages.Test : Test;

    public static ReminderPush For(ReminderSlot slot) => slot switch
    {
        ReminderSlot.Morning => new("أذكار الصباح", "حان وقت أذكار الصباح — ابدأ يومك بذكر الله.", "/ruqyah/morning-evening", "sanad-morning"),
        ReminderSlot.Evening => new("أذكار المساء", "حان وقت أذكار المساء — اختم نهارك بذكر الله.", "/ruqyah/morning-evening", "sanad-evening"),
        _ => new("أذكار النوم", "حان وقت أذكار النوم — نم على ذكر الله.", "/ruqyah/sleep", "sanad-sleep"),
    };

    public static readonly ReminderPush Test = new("سند", "وصلت الإشعارات — ستصلك أذكارك في أوقاتها بإذن الله.", "/ruqyah", "sanad-test");
}

/// <summary>
/// خدمات الدفع المعروفة للمتصفحات. الخادم يرسل طلباً إلى العنوان الذي يقدّمه المتصفح، فلا يُقبل غيرها
/// (حتى لا يُستعمل التسجيل لتوجيه الخادم إلى عناوين داخلية).
/// </summary>
public static class PushServiceHosts
{
    private static readonly string[] Suffixes =
    [
        "fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com",
    ];

    public static bool IsAllowed(string? endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort) return false;
        var host = uri.IdnHost.ToLowerInvariant();
        return Suffixes.Any(s => host == s || host.EndsWith("." + s, StringComparison.Ordinal));
    }
}

public sealed record PushConfigDto(bool Enabled, string? PublicKey);

[AllowAnonymousRequest]
public sealed record GetPushConfigQuery : IQuery<PushConfigDto>;

public sealed class GetPushConfigQueryHandler(IReminderPushSender sender) : IRequestHandler<GetPushConfigQuery, PushConfigDto>
{
    public Task<PushConfigDto> Handle(GetPushConfigQuery request, CancellationToken cancellationToken) =>
        Task.FromResult(sender.IsConfigured ? new PushConfigDto(true, sender.PublicKey) : new PushConfigDto(false, null));
}

/// <summary>الأوقات بصيغة HH:mm، وnull يعني أن هذا التذكير متوقف.</summary>
public sealed record ReminderDeviceDto(Guid Id, string Endpoint, string TimeZone, string? Morning, string? Evening, string? Sleep, DateTimeOffset CreatedAtUtc);

internal static class ReminderTimes
{
    public static bool IsValid(string? value) => value is null || (value.Length == 5 && TimeOnly.TryParseExact(value, "HH:mm", out _));
    public static TimeOnly? Parse(string? value) => value is null ? null : TimeOnly.ParseExact(value, "HH:mm");
    public static string? Format(TimeOnly? value) => value?.ToString("HH:mm");

    public static ReminderDeviceDto ToDto(ReminderDevice d) =>
        new(d.Id, d.Endpoint, d.TimeZone, Format(d.MorningAt), Format(d.EveningAt), Format(d.SleepAt), d.CreatedAtUtc);
}

public sealed record GetMyReminderDevicesQuery : IQuery<IReadOnlyList<ReminderDeviceDto>>;

public sealed class GetMyReminderDevicesQueryHandler(IApplicationDbContext db, AccessContext access)
    : IRequestHandler<GetMyReminderDevicesQuery, IReadOnlyList<ReminderDeviceDto>>
{
    public async Task<IReadOnlyList<ReminderDeviceDto>> Handle(GetMyReminderDevicesQuery request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var rows = await db.ReminderDevices.AsNoTracking().Where(d => d.UserId == userId).ToListAsync(cancellationToken);
        return rows.OrderBy(d => d.CreatedAtUtc).Select(ReminderTimes.ToDto).ToList();
    }
}

/// <summary>Client: التطبيق الذي يسجّل الجهاز (الافتراضي «الرقية والتحصين» في الويب).</summary>
public sealed record SaveMyReminderDeviceCommand(string Endpoint, string P256dh, string Auth, string TimeZone,
    string? Morning, string? Evening, string? Sleep, ReminderClient? Client = null) : ICommand<ReminderDeviceDto>;

public sealed class SaveMyReminderDeviceCommandValidator : AbstractValidator<SaveMyReminderDeviceCommand>
{
    public SaveMyReminderDeviceCommandValidator()
    {
        RuleFor(x => x.Endpoint).NotEmpty().MaximumLength(1000).Must(PushServiceHosts.IsAllowed).WithMessage("خدمة الإشعارات غير مدعومة.");
        RuleFor(x => x.P256dh).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Auth).NotEmpty().MaximumLength(100);
        RuleFor(x => x.TimeZone).NotEmpty().MaximumLength(64)
            .Must(tz => TimeZoneInfo.TryFindSystemTimeZoneById(tz, out _)).WithMessage("المنطقة الزمنية غير معروفة.");
        RuleFor(x => x.Morning).Must(ReminderTimes.IsValid).WithMessage("وقت أذكار الصباح غير صالح.");
        RuleFor(x => x.Evening).Must(ReminderTimes.IsValid).WithMessage("وقت أذكار المساء غير صالح.");
        RuleFor(x => x.Sleep).Must(ReminderTimes.IsValid).WithMessage("وقت أذكار النوم غير صالح.");
        RuleFor(x => x.Client).IsInEnum().When(x => x.Client is not null);
    }
}

public sealed class SaveMyReminderDeviceCommandHandler(IApplicationDbContext db, AccessContext access, IDateTime clock, IReminderPushSender sender)
    : IRequestHandler<SaveMyReminderDeviceCommand, ReminderDeviceDto>
{
    public async Task<ReminderDeviceDto> Handle(SaveMyReminderDeviceCommand request, CancellationToken cancellationToken)
    {
        if (!sender.IsConfigured) throw new ConflictException("إشعارات الأذكار غير متاحة حالياً.");
        var userId = access.UserId;
        var now = clock.UtcNow;

        // عنوان الإشعار يخص متصفحاً واحداً: إن سُجّل بحساب آخر من قبل فهو الآن لهذا الحساب
        var device = await db.ReminderDevices.FirstOrDefaultAsync(d => d.Endpoint == request.Endpoint, cancellationToken);
        if (device is null)
        {
            device = ReminderDevice.Register(userId, request.Endpoint, request.P256dh, request.Auth, now);
            db.ReminderDevices.Add(device);

            var mine = await db.ReminderDevices.Where(d => d.UserId == userId).ToListAsync(cancellationToken);
            db.ReminderDevices.RemoveRange(mine.OrderByDescending(d => d.UpdatedAtUtc ?? d.CreatedAtUtc).Skip(ReminderDevice.MaxPerUser - 1));
        }
        else
        {
            device.Bind(userId, request.Endpoint, request.P256dh, request.Auth, now);
        }
        device.SetClient(request.Client ?? ReminderClient.Web);
        device.Schedule(request.TimeZone, ReminderTimes.Parse(request.Morning), ReminderTimes.Parse(request.Evening), ReminderTimes.Parse(request.Sleep), now);

        await db.SaveChangesAsync(cancellationToken);
        return ReminderTimes.ToDto(device);
    }
}

public sealed record RemoveMyReminderDeviceCommand(string Endpoint) : ICommand<Unit>;

public sealed class RemoveMyReminderDeviceCommandHandler(IApplicationDbContext db, AccessContext access) : IRequestHandler<RemoveMyReminderDeviceCommand, Unit>
{
    public async Task<Unit> Handle(RemoveMyReminderDeviceCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var device = await db.ReminderDevices.FirstOrDefaultAsync(d => d.UserId == userId && d.Endpoint == request.Endpoint, cancellationToken);
        if (device is not null)
        {
            db.ReminderDevices.Remove(device);
            await db.SaveChangesAsync(cancellationToken);
        }
        return Unit.Value;
    }
}

/// <summary>إشعار تجريبي فوري ليتأكد المستخدم أن جهازه يستقبل.</summary>
public sealed record SendTestReminderCommand(string Endpoint) : ICommand<Unit>;

public sealed class SendTestReminderCommandHandler(IApplicationDbContext db, AccessContext access, IReminderPushSender sender)
    : IRequestHandler<SendTestReminderCommand, Unit>
{
    public async Task<Unit> Handle(SendTestReminderCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var device = await db.ReminderDevices.FirstOrDefaultAsync(d => d.UserId == userId && d.Endpoint == request.Endpoint, cancellationToken)
            ?? throw new NotFoundException("جهاز التذكير", "الحالي");

        switch (await sender.SendAsync(device, ReminderMessages.TestFor(device.Client), cancellationToken))
        {
            case PushDelivery.Gone:
                db.ReminderDevices.Remove(device);
                await db.SaveChangesAsync(cancellationToken);
                throw new NotFoundException("جهاز التذكير", "الحالي");
            case PushDelivery.Failed:
                throw new ExternalSourceException("تعذّر إرسال الإشعار الآن. حاول بعد قليل.");
            default:
                return Unit.Value;
        }
    }
}
