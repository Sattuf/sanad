using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Access;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Common;
using Sanad.Domain.Messaging;
using Sanad.Domain.Safety;

namespace Sanad.Application.Modules.Messaging;

public sealed record ConversationDto(Guid Id, Guid BookingRequestId, string Status, DateTimeOffset? LastMessageAtUtc, string CounterpartDisplayName);

public sealed record MessageDto(Guid Id, Guid ConversationId, Guid SenderUserId, bool IsMine, string Body, string Status, DateTimeOffset SentAtUtc);

public sealed record PostedMessageDto(Guid Id, Guid ConversationId, DateTimeOffset SentAtUtc);

/// <summary>فتح محادثة إدارية لحجز قائم (أو إعادة المحادثة الموجودة).</summary>
public sealed record OpenConversationCommand(Guid BookingId) : ICommand<ConversationDto>;

public sealed class OpenConversationCommandHandler(IApplicationDbContext db, AccessContext access, IIdentityService identity)
    : IRequestHandler<OpenConversationCommand, ConversationDto>
{
    public async Task<ConversationDto> Handle(OpenConversationCommand request, CancellationToken cancellationToken)
    {
        var (booking, _, _) = await access.LoadBookingAsPartyAsync(request.BookingId, cancellationToken);
        var conversation = await db.Conversations.FirstOrDefaultAsync(c => c.BookingRequestId == booking.Id, cancellationToken);
        if (conversation is null)
        {
            var providerUserId = await db.ProviderProfiles.Where(p => p.Id == booking.ProviderProfileIdOfAssignedService)
                .Select(p => p.UserId).FirstAsync(cancellationToken);
            conversation = Conversation.OpenForBooking(booking, providerUserId);
            db.Conversations.Add(conversation);
            await db.SaveChangesAsync(cancellationToken);
        }
        return await ConversationProjection.ToDtoAsync(conversation, access.UserId, identity, cancellationToken);
    }
}

public sealed record GetMyConversationsQuery : IQuery<IReadOnlyList<ConversationDto>>;

public sealed class GetMyConversationsQueryHandler(IApplicationDbContext db, AccessContext access, IIdentityService identity)
    : IRequestHandler<GetMyConversationsQuery, IReadOnlyList<ConversationDto>>
{
    public async Task<IReadOnlyList<ConversationDto>> Handle(GetMyConversationsQuery request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var conversations = await db.Conversations.AsNoTracking().Where(c => c.Members.Any(m => m.UserId == userId)).ToListAsync(cancellationToken);
        var result = new List<ConversationDto>();
        foreach (var c in conversations) result.Add(await ConversationProjection.ToDtoAsync(c, userId, identity, cancellationToken));
        return result.OrderByDescending(c => c.LastMessageAtUtc ?? DateTimeOffset.MinValue).ToList();
    }
}

internal static class ConversationProjection
{
    public static async Task<ConversationDto> ToDtoAsync(Conversation c, Guid viewerId, IIdentityService identity, CancellationToken ct)
    {
        var other = c.Members.Select(m => m.UserId).FirstOrDefault(id => id != viewerId);
        var names = await identity.GetDisplayNamesAsync([other], ct);
        return new ConversationDto(c.Id, c.BookingRequestId, c.Status.ToString(), c.LastMessageAtUtc, names.GetValueOrDefault(other, "—"));
    }

    public static async Task<Conversation> LoadAsMemberAsync(IApplicationDbContext db, Guid conversationId, Guid userId, CancellationToken ct)
    {
        var c = await db.Conversations.FirstOrDefaultAsync(x => x.Id == conversationId, ct);
        if (c is null || !c.IsMember(userId)) throw new NotFoundException("المحادثة", conversationId);
        return c;
    }
}

public sealed record PostMessageCommand(Guid ConversationId, string Body) : ICommand<PostedMessageDto>, ISensitiveRequest;

public sealed class PostMessageCommandValidator : AbstractValidator<PostMessageCommand>
{
    public PostMessageCommandValidator()
    {
        RuleFor(x => x.ConversationId).NotEmpty();
        RuleFor(x => x.Body).NotEmpty().MaximumLength(Conversation.MaxMessageLength);
    }
}

public sealed class PostMessageCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IDateTime clock)
    : IRequestHandler<PostMessageCommand, PostedMessageDto>
{
    public async Task<PostedMessageDto> Handle(PostMessageCommand request, CancellationToken cancellationToken)
    {
        var conversation = await ConversationProjection.LoadAsMemberAsync(db, request.ConversationId, access.UserId, cancellationToken);
        var message = conversation.PostMessage(access.UserId, request.Body, encryptor, clock.UtcNow);
        db.Messages.Add(message);
        await db.SaveChangesAsync(cancellationToken);
        return new PostedMessageDto(message.Id, conversation.Id, message.SentAtUtc);
    }
}

public sealed record GetConversationMessagesQuery(Guid ConversationId, DateTimeOffset? BeforeUtc, int? Take) : IQuery<IReadOnlyList<MessageDto>>, ISensitiveRequest;

public sealed class GetConversationMessagesQueryHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor)
    : IRequestHandler<GetConversationMessagesQuery, IReadOnlyList<MessageDto>>
{
    public async Task<IReadOnlyList<MessageDto>> Handle(GetConversationMessagesQuery request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var conversation = await ConversationProjection.LoadAsMemberAsync(db, request.ConversationId, userId, cancellationToken);
        var take = Math.Clamp(request.Take ?? 50, 1, 200);
        var query = db.Messages.Where(m => m.ConversationId == conversation.Id);
        if (request.BeforeUtc is { } before) query = query.Where(m => m.SentAtUtc < before);
        var messages = (await query.ToListAsync(cancellationToken)).OrderByDescending(m => m.SentAtUtc).Take(take).ToList();

        foreach (var m in messages.Where(m => m.SenderUserId != userId)) m.MarkRead();
        await db.SaveChangesAsync(cancellationToken);

        return messages.OrderBy(m => m.SentAtUtc).Select(m => new MessageDto(m.Id, m.ConversationId, m.SenderUserId, m.SenderUserId == userId,
            encryptor.Decrypt(m.BodyEncrypted), m.Status.ToString(), m.SentAtUtc)).ToList();
    }
}

public sealed record ReportCreatedDto(Guid Id, string Status);

/// <summary>الإبلاغ عن محادثة (أو رسالة بعينها) — ينشئ بلاغاً على الطرف الآخر في المحادثة.</summary>
public sealed record ReportConversationCommand(Guid ConversationId, Guid? MessageId, ReportCategory Category, ReportSeverity Severity, string? Description)
    : ICommand<ReportCreatedDto>, ISensitiveRequest;

public sealed class ReportConversationCommandValidator : AbstractValidator<ReportConversationCommand>
{
    public ReportConversationCommandValidator()
    {
        RuleFor(x => x.Category).IsInEnum();
        RuleFor(x => x.Severity).IsInEnum();
        RuleFor(x => x.Description).MaximumLength(Report.MaxDescriptionLength);
    }
}

public sealed class ReportConversationCommandHandler(IApplicationDbContext db, AccessContext access, IFieldEncryptor encryptor, IDateTime clock)
    : IRequestHandler<ReportConversationCommand, ReportCreatedDto>
{
    public async Task<ReportCreatedDto> Handle(ReportConversationCommand request, CancellationToken cancellationToken)
    {
        var userId = access.UserId;
        var conversation = await ConversationProjection.LoadAsMemberAsync(db, request.ConversationId, userId, cancellationToken);
        var other = conversation.Members.Select(m => m.UserId).FirstOrDefault(id => id != userId);
        if (other == Guid.Empty) throw new NotFoundException("الطرف الآخر", request.ConversationId);

        if (request.MessageId is { } mid)
        {
            var message = await db.Messages.FirstOrDefaultAsync(m => m.Id == mid && m.ConversationId == conversation.Id, cancellationToken)
                ?? throw new NotFoundException("الرسالة", mid);
            message.MarkReported();
        }

        var report = Report.Submit(userId, conversation.Id, ReportTargetType.Conversation, other, request.Category, request.Severity,
            request.Description, encryptor, clock.UtcNow);
        db.Reports.Add(report);
        await db.SaveChangesAsync(cancellationToken);
        return new ReportCreatedDto(report.Id, report.Status.ToString());
    }
}
