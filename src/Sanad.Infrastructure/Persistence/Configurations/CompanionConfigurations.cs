using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sanad.Domain.Companion;

namespace Sanad.Infrastructure.Persistence.Configurations;

// تطبيق «سند» للرقية الذاتية — ADR-0021. النيّة (IntentionEncrypted) ورمز الدعوة (InviteCodeEncrypted) نص مشفّر خام،
// ولا فهرس عليهما. البحث عن الدعوة بالـ Hash فقط.

public sealed class PlanAuthorConfiguration : IEntityTypeConfiguration<PlanAuthor>
{
    public void Configure(EntityTypeBuilder<PlanAuthor> b)
    {
        b.ToTable("PlanAuthors");
        b.HasKey(x => x.Id);
        b.Property(x => x.DisplayName).HasMaxLength(80).IsRequired();
        b.Property(x => x.Bio).HasMaxLength(300).IsRequired();
        b.Property(x => x.ConsentRef).HasMaxLength(100);
        b.Ignore(x => x.HasConsent);
    }
}

public sealed class RuqyahPlanConfiguration : IEntityTypeConfiguration<RuqyahPlan>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public void Configure(EntityTypeBuilder<RuqyahPlan> b)
    {
        b.ToTable("RuqyahPlans");
        b.HasKey(x => x.Id);
        b.Property(x => x.Key).HasMaxLength(60).IsRequired();
        b.Property(x => x.Title).HasMaxLength(80).IsRequired();
        b.Property(x => x.Summary).HasMaxLength(200).IsRequired();
        b.Property(x => x.Contents).HasMaxLength(600).IsRequired();
        b.Property(x => x.ReviewNote).HasMaxLength(500);
        b.Property(x => x.WithdrawReason).HasMaxLength(300);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        // أيام الورد وثيقة واحدة تُقرأ وتُكتب معاً — مراجَعة كوحدة ولا يُستعلم عن عناصرها
        b.Property(x => x.Days).HasColumnType("text").HasConversion(
            v => JsonSerializer.Serialize(v, Json),
            v => JsonSerializer.Deserialize<List<PlanDay>>(v, Json) ?? new List<PlanDay>(),
            new ValueComparer<List<PlanDay>>(
                (a, c) => JsonSerializer.Serialize(a, Json) == JsonSerializer.Serialize(c, Json),
                v => JsonSerializer.Serialize(v, Json).GetHashCode(),
                v => JsonSerializer.Deserialize<List<PlanDay>>(JsonSerializer.Serialize(v, Json), Json)!));
        b.Ignore(x => x.IsServable);
        b.HasIndex(x => new { x.Key, x.Version }).IsUnique();
        b.HasIndex(x => x.Status);
        b.HasIndex(x => x.AuthorId);
    }
}

public sealed class PlanEnrollmentConfiguration : IEntityTypeConfiguration<PlanEnrollment>
{
    public void Configure(EntityTypeBuilder<PlanEnrollment> b)
    {
        b.ToTable("PlanEnrollments");
        b.HasKey(x => x.Id);
        b.Property(x => x.PlanKey).HasMaxLength(60).IsRequired();
        b.Property(x => x.Reminder).HasConversion<string>().HasMaxLength(20);
        b.PrimitiveCollection(x => x.CompletedDays);
        b.Ignore(x => x.IsFinished);
        b.Ignore(x => x.CurrentDay);
        b.HasIndex(x => new { x.UserId, x.IsActive });
        b.HasIndex(x => x.PlanId);
    }
}

public sealed class KhatmaConfiguration : IEntityTypeConfiguration<Khatma>
{
    public void Configure(EntityTypeBuilder<Khatma> b)
    {
        b.ToTable("Khatmas");
        b.HasKey(x => x.Id);
        b.Property(x => x.Mode).HasConversion<string>().HasMaxLength(10);
        b.Property(x => x.Title).HasMaxLength(80).IsRequired();
        b.Property(x => x.IntentionEncrypted).HasColumnType("text");
        b.Property(x => x.InviteCodeHash).HasMaxLength(128);
        b.Property(x => x.InviteCodeEncrypted).HasColumnType("text");
        b.HasIndex(x => x.InviteCodeHash).IsUnique();
        b.HasIndex(x => x.OwnerUserId);
        b.Ignore(x => x.DoneCount);
        b.Ignore(x => x.IsComplete);

        b.OwnsMany(x => x.Members, m =>
        {
            m.ToTable("KhatmaMembers");
            m.WithOwner().HasForeignKey("KhatmaId");
            m.Property<int>("Id");
            m.HasKey("Id");
            m.Property(x => x.DisplayName).HasMaxLength(40).IsRequired();
            m.HasIndex(x => x.UserId);
        });
        b.Navigation(x => x.Members).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_members");

        b.OwnsMany(x => x.Juz, j =>
        {
            j.ToTable("KhatmaJuz");
            j.WithOwner().HasForeignKey("KhatmaId");
            j.Property<int>("Id");
            j.HasKey("Id");
            j.Ignore(x => x.IsDone);
            j.HasIndex("KhatmaId", nameof(KhatmaJuz.Index)).IsUnique();
        });
        b.Navigation(x => x.Juz).UsePropertyAccessMode(PropertyAccessMode.Field).HasField("_juz");
    }
}

public sealed class CompanionEventCounterConfiguration : IEntityTypeConfiguration<CompanionEventCounter>
{
    public void Configure(EntityTypeBuilder<CompanionEventCounter> b)
    {
        b.ToTable("CompanionEventCounters");
        b.HasKey(x => x.Id);
        b.Property(x => x.Name).HasMaxLength(40).IsRequired();
        b.Property(x => x.Dimension).HasMaxLength(20).IsRequired();
        b.HasIndex(x => new { x.Day, x.Name, x.Dimension }).IsUnique();
    }
}
