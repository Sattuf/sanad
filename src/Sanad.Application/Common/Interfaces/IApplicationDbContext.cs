using Microsoft.EntityFrameworkCore;
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

namespace Sanad.Application.Common.Interfaces;

public interface IApplicationDbContext
{
    DbSet<Organization> Organizations { get; }
    DbSet<ProviderProfile> ProviderProfiles { get; }
    DbSet<ServiceOffering> ServiceOfferings { get; }
    DbSet<VerificationRecord> VerificationRecords { get; }
    DbSet<AvailabilitySlot> AvailabilitySlots { get; }
    DbSet<BookingRequest> BookingRequests { get; }
    DbSet<Conversation> Conversations { get; }
    DbSet<Message> Messages { get; }
    DbSet<ProviderCaseNote> ProviderCaseNotes { get; }
    DbSet<ProviderRecommendation> ProviderRecommendations { get; }
    DbSet<AudioTrack> AudioTracks { get; }
    DbSet<UserFavoriteTrack> UserFavoriteTracks { get; }
    DbSet<SharedContentLink> SharedContentLinks { get; }
    DbSet<ConsentRecord> ConsentRecords { get; }
    DbSet<Report> Reports { get; }
    DbSet<EscalationCase> EscalationCases { get; }
    DbSet<AuditLogEntry> AuditLogEntries { get; }
    DbSet<StoredFile> StoredFiles { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
