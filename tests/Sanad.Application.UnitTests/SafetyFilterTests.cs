using FluentAssertions;
using Sanad.Domain.Common;
using Sanad.Infrastructure.Safety;

namespace Sanad.Application.UnitTests;

public class ContentPolicyCheckerTests
{
    private readonly ContentPolicyChecker _checker = new();

    [Theory]
    [InlineData("شفاء مضمون بإذن الله", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("شِفَاءٌ مَضْمُونٌ", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("شفـــاء مضمـــون", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("نضمن لك الشفاء", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("علاج ناجع للسحر", ContentPolicyChecker.CategoryDefinitiveUnseenCure)]
    [InlineData("نزيل العين نهائيا", ContentPolicyChecker.CategoryDefinitiveUnseenCure)]
    [InlineData("نتيجة مضمونة", ContentPolicyChecker.CategoryGuaranteedResult)]
    public void Prohibited_claims_are_detected_despite_diacritics_and_variants(string text, string expectedCategory) =>
        _checker.FindProhibitedClaim(text).Should().Be(expectedCategory);

    [Theory]
    [InlineData("نلتزم بالسرية وفق سياسة الخصوصية")]
    [InlineData("مجموعة أدعية مأثورة من مصادر موثوقة")]
    [InlineData("مدة الجلسة 45 دقيقة")]
    public void Neutral_administrative_text_passes(string text) =>
        _checker.FindProhibitedClaim(text).Should().BeNull();
}
