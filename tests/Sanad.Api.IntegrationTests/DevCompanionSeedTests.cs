using FluentAssertions;
using Sanad.Domain.Companion;
using Sanad.Infrastructure.Identity;
using Sanad.Infrastructure.Safety;

namespace Sanad.Api.IntegrationTests;

/// <summary>بذور خطط التطوير تمر على بوابة النشر كاملة بالفلتر الحقيقي — لا اختصار ولا نص يخالف الضوابط.</summary>
public sealed class DevCompanionSeedTests
{
    [Fact]
    public void Bundled_plans_from_ruqyah_app_pass_every_publication_rule()
    {
        var file = DevCompanionSeed.Load();
        file.Plans.Should().NotBeEmpty();
        var (authors, plans) = DevCompanionSeed.Build(file, new ContentPolicyChecker(), DateTimeOffset.UtcNow);
        authors.Should().OnlyContain(a => a.HasConsent);
        plans.Should().HaveCount(file.Plans.Count).And.OnlyContain(p => p.Status == PlanStatus.Published && p.ReviewerUserId != p.CreatedByUserId);
        plans.Select(p => p.DurationDays).Should().OnlyContain(d => PlanDurations.Allowed.Contains(d));
    }
}
