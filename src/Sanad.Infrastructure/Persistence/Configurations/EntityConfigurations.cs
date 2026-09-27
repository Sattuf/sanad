using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sanad.Domain.Audit;
using Sanad.Domain.Common;
using Sanad.Domain.Consent;
using Sanad.Domain.Directory;
using Sanad.Domain.Messaging;
using Sanad.Domain.PatientCare;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Domain.Safety;
using Sanad.Domain.Scheduling;
using Sanad.Domain.Verification;
using Sanad.Infrastructure.Identity;

namespace Sanad.Infrastructure.Persistence.Configurations;

// ملاحظة عامة: الأعمدة المشفّرة (…Encrypted) نص خام مشفّر — لا فهرس نصي عليها أبداً، ولا ValueConverter يفك التشفير تلقائياً.

public sealed class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> b)
    {
        b.ToTable("Organizations");
        b.HasKey(x => x.Id);
        b.Property(x => x.LegalName).HasMaxLength(200).IsRequired();
        b.Property(x => x.TradeName).HasMaxLength(200);
        b.Property(x => x.Track).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.RegistrationNumber).HasMaxLength(100);
        b.Property(x => x.IssuingAuthorityName).HasMaxLength(200);
        b.Property(x => x.VerificationSourceUrl).HasMaxLength(500);
        b.Property(x => x.PublicDescription).HasMaxLength(2000).IsRequired();
        b.Property(x => x.City).HasMaxLength(100);
        b.Property(x => x.SuspensionReasonCode).HasMaxLength(100);
        b.Ignore(x => x.DisplayName);
        b.HasIndex(x => new { x.Status, x.Track });
    }
}

public sealed class ProviderProfileConfiguration : IEntityTypeConfiguration<ProviderProfile>
{
    public void Configure(EntityTypeBuilder<ProviderProfile> b)
    {
        b.ToTable("ProviderProfiles");
        b.HasKey(x => x.Id);
        b.Property(x => x.Id).ValueGeneratedNever();
        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.DeliveryMode).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.DisplayName).HasMaxLength(150).IsRequired();
        b.Property(x => x.DeclaredTitle).HasMaxLength(200).IsRequired();
        b.Property(x => x.PracticeScope).HasMaxLength(2000);
        b.Property(x => x.ProfessionalBoundariesNote).HasMaxLength(1000);
        b.Property(x => x.City).HasMaxLength(100);
        b.Property(x => x.SuspensionReasonCode).HasMaxLength(100);
        b.PrimitiveCollection(x => x.Languages);
        b.Ignore(x => x.IsProfileComplete);
        b.HasIndex(x => x.UserId).IsUnique();
        b.HasIndex(x => new { x.Status, x.Type });
    }
}

public sealed class ServiceOfferingConfiguration : IEntityTypeConfiguration<ServiceOffering>
{
    public void Configure(EntityTypeBuilder<ServiceOffering> b)
    {
        b.ToTable("ServiceOfferings");
        b.HasKey(x => x.Id);
        b.Property(x => x.Category).HasMaxLength(100).IsRequired();
        b.Property(x => x.Description).HasMaxLength(2000).IsRequired();
        b.Property(x => x.CancellationPolicy).HasMaxLength(1000).IsRequired();
        b.PrimitiveCollection(x => x.ExplicitExclusions);
        b.HasIndex(x => new { x.ProviderProfileId, x.IsActive });
    }
}

public sealed class VerificationRecordConfiguration : IEntityTypeConfiguration<VerificationRecord>
{
    public void Configure(EntityTypeBuilder<VerificationRecord> b)
    {
        b.ToTable("VerificationRecords");
        b.HasKey(x => x.Id);
        b.Property(x => x.SubjectType).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.DeclaredPractitionerType).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.RejectionReason).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.DeclaredTitle).HasMaxLength(200);
        b.Property(x => x.DocumentType).HasMaxLength(60).IsRequired();
        b.Property(x => x.IssuingAuthority).HasMaxLength(200).IsRequired();
        b.Property(x => x.VerificationSourceUrl).HasMaxLength(500);
        b.HasIndex(x => new { x.SubjectId, x.Status, x.ExpiresAtUtc });
        b.HasIndex(x => x.ApplicantUserId);
        b.HasIndex(x => x.DocumentFileId);
    }
}

public sealed class AvailabilitySlotConfiguration : IEntityTypeConfiguration<AvailabilitySlot>
{
    public void Configure(EntityTypeBuilder<AvailabilitySlot> b)
    {
        b.ToTable("AvailabilitySlots");
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.ConcurrencyStamp).IsConcurrencyToken();
        b.HasIndex(x => new { x.ProviderProfileId, x.StartUtc, x.EndUtc });
    }
}

public sealed class BookingRequestConfiguration : IEntityTypeConfiguration<BookingRequest>
{
    public void Configure(EntityTypeBuilder<BookingRequest> b)
    {
        b.ToTable("BookingRequests");
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.IdempotencyKey).HasMaxLength(100);
        b.HasIndex(x => x.IdempotencyKey).IsUnique();
        b.Property(x => x.AdministrativeReasonForRejection).HasMaxLength(300);
        // النص مشفّر بالفعل عند وصوله من Domain — يُخزَّن كما هو
        b.Property(x => x.BeneficiaryNoteEncrypted).HasColumnType("text");
        b.HasIndex(x => x.BeneficiaryUserId);
        b.HasIndex(x => new { x.ProviderProfileIdOfAssignedService, x.Status });
        b.HasQueryFilter(x => !x.IsDeleted);
    }
}

public sealed class ConversationConfiguration : IEntityTypeConfiguration<Conversation>
{
    public void Configure(EntityTypeBuilder<Conversation> b)
    {
        b.ToTable("Conversations");
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.HasIndex(x => x.BookingRequestId).IsUnique();
        b.OwnsMany(x => x.Members, m =>
        {
            m.ToTable("ConversationMembers");
            m.WithOwner().HasForeignKey("ConversationId");
            m.Property<int>("Id");
            m.HasKey("Id");
            m.HasIndex(x => x.UserId);
        });
        b.Navigation(x => x.Members).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_members");
    }
}

public sealed class MessageConfiguration : IEntityTypeConfiguration<Message>
{
    public void Configure(EntityTypeBuilder<Message> b)
    {
        b.ToTable("Messages");
        b.HasKey(x => x.Id);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.BodyEncrypted).HasColumnType("text").IsRequired();
        b.HasIndex(x => new { x.ConversationId, x.CreatedAtUtc });
        b.HasIndex(x => x.SenderUserId);
    }
}

public sealed class ProviderCaseNoteConfiguration : IEntityTypeConfiguration<ProviderCaseNote>
{
    public void Configure(EntityTypeBuilder<ProviderCaseNote> b)
    {
        b.ToTable("ProviderCaseNotes");
        b.HasKey(x => x.Id);
        b.Property(x => x.NoteEncrypted).HasColumnType("text").IsRequired();
        b.HasIndex(x => x.BookingRequestId);
    }
}

public sealed class ProviderRecommendationConfiguration : IEntityTypeConfiguration<ProviderRecommendation>
{
    public void Configure(EntityTypeBuilder<ProviderRecommendation> b)
    {
        b.ToTable("ProviderRecommendations");
        b.HasKey(x => x.Id);
        b.Property(x => x.GuidanceTextEncrypted).HasColumnType("text").IsRequired();
        b.PrimitiveCollection(x => x.RecommendedAudioTrackIds);
        b.HasIndex(x => x.RecipientBeneficiaryUserId);
        b.HasIndex(x => x.BookingRequestId);
    }
}

public sealed class AudioTrackConfiguration : IEntityTypeConfiguration<AudioTrack>
{
    public void Configure(EntityTypeBuilder<AudioTrack> b)
    {
        b.ToTable("AudioTracks");
        b.HasKey(x => x.Id);
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.SourceLabel).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1500);
        b.Property(x => x.Category).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.MediaKind).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.AudioStorageKey).HasMaxLength(300);
        b.Property(x => x.AudioContentType).HasMaxLength(50);
        b.Property(x => x.YouTubeVideoId).HasMaxLength(11);
        b.Property(x => x.SourceUrl).HasMaxLength(500);
        b.HasIndex(x => new { x.Category, x.IsPublished });
        // القيم الفارغة (NULL) لا تتعارض في الفهرس الفريد على PostgreSQL ولا SQLite
        b.HasIndex(x => x.AudioStorageKey).IsUnique();
        b.HasIndex(x => x.YouTubeVideoId).IsUnique();
        b.HasIndex(x => x.SourceUrl);
    }
}

public sealed class UserFavoriteTrackConfiguration : IEntityTypeConfiguration<UserFavoriteTrack>
{
    public void Configure(EntityTypeBuilder<UserFavoriteTrack> b)
    {
        b.ToTable("UserFavoriteTracks");
        b.HasKey(x => x.Id);
        b.HasIndex(x => new { x.UserId, x.AudioTrackId }).IsUnique();
    }
}

public sealed class SharedContentLinkConfiguration : IEntityTypeConfiguration<SharedContentLink>
{
    public void Configure(EntityTypeBuilder<SharedContentLink> b)
    {
        b.ToTable("SharedContentLinks");
        b.HasKey(x => x.Id);
        b.Property(x => x.ShortCode).HasMaxLength(SharedContentLink.ShortCodeLength).IsRequired();
        b.HasIndex(x => x.ShortCode).IsUnique();
        b.HasIndex(x => new { x.AudioTrackId, x.CreatedByUserId });
    }
}

public sealed class ConsentRecordConfiguration : IEntityTypeConfiguration<ConsentRecord>
{
    public void Configure(EntityTypeBuilder<ConsentRecord> b)
    {
        b.ToTable("ConsentRecords");
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.PolicyVersion).HasMaxLength(20).IsRequired();
        b.Ignore(x => x.IsActive);
        b.HasIndex(x => new { x.UserId, x.Type });
    }
}

public sealed class ReportConfiguration : IEntityTypeConfiguration<Report>
{
    public void Configure(EntityTypeBuilder<Report> b)
    {
        b.ToTable("Reports");
        b.HasKey(x => x.Id);
        b.Property(x => x.TargetType).HasConversion<string>().HasMaxLength(30);
        b.Property(x => x.Category).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Severity).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(30);
        b.Property(x => x.DescriptionEncrypted).HasColumnType("text");
        b.HasIndex(x => new { x.EscalationSubjectId, x.IsSubstantiated });
        b.HasIndex(x => x.Status);
    }
}

public sealed class EscalationCaseConfiguration : IEntityTypeConfiguration<EscalationCase>
{
    public void Configure(EntityTypeBuilder<EscalationCase> b)
    {
        b.ToTable("EscalationCases");
        b.HasKey(x => x.Id);
        b.Property(x => x.Level).HasConversion<int>();
        b.HasIndex(x => new { x.SubjectAccountId, x.IsOpen });
    }
}

public sealed class AuditLogEntryConfiguration : IEntityTypeConfiguration<AuditLogEntry>
{
    public void Configure(EntityTypeBuilder<AuditLogEntry> b)
    {
        b.ToTable("AuditLogEntries");
        b.HasKey(x => x.Id);
        b.Property(x => x.Action).HasMaxLength(150).IsRequired();
        b.Property(x => x.EntityType).HasMaxLength(100).IsRequired();
        b.Property(x => x.MetadataJson).HasMaxLength(4000);
        b.Property(x => x.CorrelationId).HasMaxLength(100);
        b.HasIndex(x => new { x.Action, x.OccurredAtUtc });
        b.HasIndex(x => x.ActorUserId);
    }
}

public sealed class StoredFileConfiguration : IEntityTypeConfiguration<StoredFile>
{
    public void Configure(EntityTypeBuilder<StoredFile> b)
    {
        b.ToTable("StoredFiles");
        b.HasKey(x => x.Id);
        b.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        b.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
        b.Property(x => x.Sha256).HasMaxLength(64).IsRequired();
        b.HasIndex(x => x.StorageKey).IsUnique();
        b.HasIndex(x => x.OwnerUserId);
    }
}

// ── بنية تحتية ────────────────────────────────────────────────────────────────
public sealed class OutboxMessageConfiguration : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> b)
    {
        b.ToTable("OutboxMessages");
        b.HasKey(x => x.Id);
        b.Property(x => x.Type).HasMaxLength(300).IsRequired();
        b.Property(x => x.PayloadJson).IsRequired();
        b.Property(x => x.LastError).HasMaxLength(1000);
        b.HasIndex(x => new { x.ProcessedAtUtc, x.OccurredAtUtc });
    }
}

public sealed class IdempotencyRecordConfiguration : IEntityTypeConfiguration<IdempotencyRecord>
{
    public void Configure(EntityTypeBuilder<IdempotencyRecord> b)
    {
        b.ToTable("IdempotencyRecords");
        b.HasKey(x => x.Id);
        b.Property(x => x.Key).HasMaxLength(100).IsRequired();
        b.Property(x => x.RequestName).HasMaxLength(150).IsRequired();
        b.HasIndex(x => new { x.Key, x.UserId, x.RequestName }).IsUnique();
    }
}

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> b)
    {
        b.ToTable("RefreshTokens");
        b.HasKey(x => x.Id);
        b.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
        b.Property(x => x.ReplacedByTokenHash).HasMaxLength(64);
        b.Property(x => x.AuthMethod).HasMaxLength(20).IsRequired();
        b.HasIndex(x => x.TokenHash).IsUnique();
        b.HasIndex(x => x.UserId);
    }
}

public sealed class OtpChallengeConfiguration : IEntityTypeConfiguration<OtpChallenge>
{
    public void Configure(EntityTypeBuilder<OtpChallenge> b)
    {
        b.ToTable("OtpChallenges");
        b.HasKey(x => x.Id);
        b.Property(x => x.PhoneNumberE164).HasMaxLength(20).IsRequired();
        b.Property(x => x.CodeHash).HasMaxLength(64).IsRequired();
        b.HasIndex(x => new { x.PhoneNumberE164, x.CreatedAtUtc });
    }
}

public sealed class UserNotificationConfiguration : IEntityTypeConfiguration<UserNotification>
{
    public void Configure(EntityTypeBuilder<UserNotification> b)
    {
        b.ToTable("UserNotifications");
        b.HasKey(x => x.Id);
        b.Property(x => x.Kind).HasMaxLength(50).IsRequired();
        b.Property(x => x.Title).HasMaxLength(150).IsRequired();
        b.Property(x => x.Body).HasMaxLength(500).IsRequired();
        b.Property(x => x.Link).HasMaxLength(300);
        b.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
    }
}

public sealed class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> b)
    {
        b.Property(x => x.DisplayName).HasMaxLength(100).IsRequired();
        b.HasIndex(x => x.PhoneNumber);
    }
}
