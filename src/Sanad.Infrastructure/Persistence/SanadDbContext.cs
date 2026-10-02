using System.Text.Json;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Audit;
using Sanad.Domain.Common;
using Sanad.Domain.Companion;
using Sanad.Domain.Consent;
using Sanad.Domain.Directory;
using Sanad.Domain.Messaging;
using Sanad.Domain.PatientCare;
using Sanad.Domain.Ruqyah;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Domain.Safety;
using Sanad.Domain.Scheduling;
using Sanad.Domain.Verification;
using Sanad.Infrastructure.Identity;

namespace Sanad.Infrastructure.Persistence;

public sealed class SanadDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>, IApplicationDbContext
{
    private static readonly JsonSerializerOptions EventJson = new(JsonSerializerDefaults.Web);

    private readonly IDateTime? _clock;
    private readonly ISafetySignalContext? _safety;

    public SanadDbContext(DbContextOptions<SanadDbContext> options) : base(options) { }

    public SanadDbContext(DbContextOptions<SanadDbContext> options, IDateTime clock, ISafetySignalContext safety) : base(options)
    {
        _clock = clock;
        _safety = safety;
    }

    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<ProviderProfile> ProviderProfiles => Set<ProviderProfile>();
    public DbSet<ServiceOffering> ServiceOfferings => Set<ServiceOffering>();
    public DbSet<VerificationRecord> VerificationRecords => Set<VerificationRecord>();
    public DbSet<AvailabilitySlot> AvailabilitySlots => Set<AvailabilitySlot>();
    public DbSet<BookingRequest> BookingRequests => Set<BookingRequest>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<ProviderCaseNote> ProviderCaseNotes => Set<ProviderCaseNote>();
    public DbSet<ProviderRecommendation> ProviderRecommendations => Set<ProviderRecommendation>();
    public DbSet<AudioTrack> AudioTracks => Set<AudioTrack>();
    public DbSet<UserFavoriteTrack> UserFavoriteTracks => Set<UserFavoriteTrack>();
    public DbSet<DailyWirdProgress> DailyWirdProgress => Set<DailyWirdProgress>();
    public DbSet<ReminderDevice> ReminderDevices => Set<ReminderDevice>();
    public DbSet<WrittenDua> WrittenDuas => Set<WrittenDua>();
    public DbSet<SharedContentLink> SharedContentLinks => Set<SharedContentLink>();
    public DbSet<ConsentRecord> ConsentRecords => Set<ConsentRecord>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<EscalationCase> EscalationCases => Set<EscalationCase>();
    public DbSet<AuditLogEntry> AuditLogEntries => Set<AuditLogEntry>();
    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();
    public DbSet<PlanAuthor> PlanAuthors => Set<PlanAuthor>();
    public DbSet<RuqyahPlan> RuqyahPlans => Set<RuqyahPlan>();
    public DbSet<PlanEnrollment> PlanEnrollments => Set<PlanEnrollment>();
    public DbSet<Khatma> Khatmas => Set<Khatma>();
    public DbSet<EmergencyContact> EmergencyContacts => Set<EmergencyContact>();
    public DbSet<CompanionEventCounter> CompanionEventCounters => Set<CompanionEventCounter>();

    // بنية تحتية بحتة
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<UserNotification> UserNotifications => Set<UserNotification>();

    public bool IsSqlite => Database.ProviderName == "Microsoft.EntityFrameworkCore.Sqlite";

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(SanadDbContext).Assembly);
        foreach (var entityType in builder.Model.GetEntityTypes().Where(t => typeof(BaseEntity).IsAssignableFrom(t.ClrType)))
            builder.Entity(entityType.ClrType).Ignore(nameof(BaseEntity.DomainEvents));

        if (!IsSqlite)
        {
            // قفل تفاؤلي عبر xmin في PostgreSQL على الحجز (references/04-infrastructure-layer.md §4.1)
            builder.Entity<BookingRequest>().Property<uint>("xmin").HasColumnType("xid").ValueGeneratedOnAddOrUpdate().IsConcurrencyToken();
        }
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // كل الأوقات UTC. SQLite لا يدعم مقارنة/ترتيب DateTimeOffset أصلاً — تُخزَّن كـ UtcTicks (قابلة للترتيب)
        if (IsSqlite)
        {
            configurationBuilder.Properties<DateTimeOffset>().HaveConversion<UtcTicksConverter>();
            configurationBuilder.Properties<DateTimeOffset?>().HaveConversion<UtcTicksConverter>();
        }
        else
        {
            configurationBuilder.Properties<DateTimeOffset>().HaveConversion<UtcNormalizingConverter>();
            configurationBuilder.Properties<DateTimeOffset?>().HaveConversion<UtcNormalizingConverter>();
        }
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var now = _clock?.UtcNow ?? DateTimeOffset.UtcNow;
        StampTimes(now);
        CaptureDomainEventsIntoOutbox(now);
        return await base.SaveChangesAsync(cancellationToken);
    }

    private void StampTimes(DateTimeOffset now)
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Added && entry.Entity.CreatedAtUtc == default)
                entry.Property(nameof(BaseEntity.CreatedAtUtc)).CurrentValue = now;
            else if (entry.State == EntityState.Modified)
                entry.Property(nameof(BaseEntity.UpdatedAtUtc)).CurrentValue = now;
        }
    }

    /// <summary>نمط Outbox: كل حدث Domain يُكتب سجلاً ضمن نفس المعاملة. الأحداث تحمل معرّفات فقط، لا نصاً حساساً.</summary>
    private void CaptureDomainEventsIntoOutbox(DateTimeOffset now)
    {
        var entities = ChangeTracker.Entries<BaseEntity>().Select(e => e.Entity).Where(e => e.DomainEvents.Count > 0).ToList();
        foreach (var entity in entities)
        {
            foreach (var domainEvent in entity.DomainEvents)
            {
                if (domainEvent is EmergencyReferralTriggeredEvent) _safety?.Flag();
                OutboxMessages.Add(new OutboxMessage
                {
                    Type = domainEvent.GetType().FullName!,
                    PayloadJson = JsonSerializer.Serialize(domainEvent, domainEvent.GetType(), EventJson),
                    OccurredAtUtc = now,
                });
            }
            entity.ClearDomainEvents();
        }
    }

    private sealed class UtcTicksConverter() : ValueConverter<DateTimeOffset, long>(
        v => v.UtcTicks, v => new DateTimeOffset(v, TimeSpan.Zero));

    private sealed class UtcNormalizingConverter() : ValueConverter<DateTimeOffset, DateTimeOffset>(
        v => v.ToUniversalTime(), v => v.ToUniversalTime());
}
