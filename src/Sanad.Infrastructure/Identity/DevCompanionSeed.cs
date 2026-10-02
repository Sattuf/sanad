using System.Reflection;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sanad.Domain.Common;
using Sanad.Domain.Companion;
using Sanad.Infrastructure.Persistence;

namespace Sanad.Infrastructure.Identity;

/// <summary>
/// خطط تطبيق «سند» في بيئة التطوير فقط: الخطط المضمَّنة في ruqyah-app نفسها (DevSeed/companion-plans.json،
/// مولَّد بـ npm run export:dev-plans) تُنشر عبر بوابة Domain كاملة — معدّ بإذن تطوير، ومنشئ ومراجع مختلفان،
/// وفحص أمان، وفلتر الادعاءات. أسماء المعدّين نائبة؛ لا اسم شيخ حقيقي في أي بيانات تطوير.
/// </summary>
public static class DevCompanionSeed
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    public sealed record SeedAuthor(string Key, string DisplayName, string Bio);

    public sealed record SeedPlan(string Key, string Title, string Summary, string Contents, string AuthorKey, int DurationDays, int MinutesPerDay,
        List<PlanDay> Days);

    public sealed record SeedFile(List<SeedAuthor> Authors, List<SeedPlan> Plans);

    public static SeedFile Load()
    {
        var asm = typeof(DevCompanionSeed).Assembly;
        var name = asm.GetManifestResourceNames().Single(n => n.EndsWith("companion-plans.json", StringComparison.Ordinal));
        using var stream = asm.GetManifestResourceStream(name)!;
        return JsonSerializer.Deserialize<SeedFile>(stream, Json) ?? throw new InvalidOperationException("ملف بذور الخطط فارغ.");
    }

    /// <summary>ينشئ المعدّين والخطط منشورةً. يعيد الخطط لتُضاف — بلا حفظ، ليبقى ضمن معاملة المستدعي.</summary>
    public static (List<PlanAuthor> Authors, List<RuqyahPlan> Plans) Build(SeedFile file, IContentPolicyChecker policy, DateTimeOffset now)
    {
        // منشئ ومراجع مختلفان كما تشترط المراجعة الشرعية بعينين
        var creator = Guid.Parse("00000000-0000-0000-0000-00000000c0de");
        var reviewer = Guid.Parse("00000000-0000-0000-0000-0000000feed5");
        var all = new SafetyAttestation(true, true, true, true, true, true, true, true);
        var authors = new Dictionary<string, PlanAuthor>();
        var n = 0;
        foreach (var a in file.Authors)
        {
            var author = PlanAuthor.Create(a.DisplayName, a.Bio, creator, policy, now);
            author.RecordConsent($"DEV-{++n:0000}", DateOnly.FromDateTime(now.UtcDateTime), creator, now);
            authors[a.Key] = author;
        }
        var plans = file.Plans.Select(p =>
        {
            var author = authors[p.AuthorKey];
            var plan = RuqyahPlan.Create(p.Key, p.Title, p.Summary, p.Contents, author.Id, p.DurationDays, p.MinutesPerDay, p.Days, creator, policy, now);
            plan.SubmitForReview(creator, now);
            plan.Approve(reviewer, author, all, policy, now);
            plan.ClearDomainEvents();
            return plan;
        }).ToList();
        return (authors.Values.ToList(), plans);
    }

    public static async Task SeedAsync(SanadDbContext db, IContentPolicyChecker policy, CancellationToken ct)
    {
        if (await db.PlanAuthors.AnyAsync(ct)) return;
        var (authors, plans) = Build(Load(), policy, DateTimeOffset.UtcNow);
        db.PlanAuthors.AddRange(authors);
        db.RuqyahPlans.AddRange(plans);
        await db.SaveChangesAsync(ct);
    }
}
