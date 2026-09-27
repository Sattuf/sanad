using FluentAssertions;
using Sanad.Domain.Common;
using Sanad.Infrastructure.Safety;

namespace Sanad.Application.UnitTests;

public class ContentPolicyCheckerTests
{
    private readonly ContentPolicyChecker _checker = new();

    [Theory]
    [InlineData("خذ 500 ملغ مرتين يومياً", ContentPolicyChecker.CategoryMedicationDose)]
    [InlineData("خذ ٥٠٠ ملغ", ContentPolicyChecker.CategoryMedicationDose)]
    [InlineData("الجرعة المناسبة حبة يومياً", ContentPolicyChecker.CategoryMedicationDose)]
    [InlineData("وصفة دوائية مجربة", ContentPolicyChecker.CategoryMedicationDose)]
    [InlineData("take 20 mg daily", ContentPolicyChecker.CategoryMedicationDose)]
    [InlineData("شفاء مضمون بإذن الله", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("شِفَاءٌ مَضْمُونٌ", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("شفـــاء مضمـــون", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("نضمن لك الشفاء", ContentPolicyChecker.CategoryGuaranteedCure)]
    [InlineData("علاج ناجع للسحر", ContentPolicyChecker.CategoryDefinitiveUnseenCure)]
    [InlineData("نزيل العين نهائيا", ContentPolicyChecker.CategoryDefinitiveUnseenCure)]
    [InlineData("بديل عن الطبيب", ContentPolicyChecker.CategoryReplacesMedicine)]
    [InlineData("الرقية بديل عن الدواء", ContentPolicyChecker.CategoryReplacesMedicine)]
    [InlineData("اترك الدواء واستمع للرقية", ContentPolicyChecker.CategoryReplacesMedicine)]
    [InlineData("نتيجة مضمونة", ContentPolicyChecker.CategoryGuaranteedResult)]
    [InlineData("سرية تامة مضمونة", ContentPolicyChecker.CategoryAbsoluteSecrecy)]
    public void Prohibited_claims_are_detected_despite_diacritics_and_variants(string text, string expectedCategory) =>
        _checker.FindProhibitedClaim(text).Should().Be(expectedCategory);

    [Theory]
    [InlineData("جلسات استشارة وتوجيه إداري، مع إحالة للطبيب عند الحاجة")]
    [InlineData("تم إلغاء الموعد والحجز ملغي")]
    [InlineData("نلتزم بالسرية وفق السياسة مع واجب الإبلاغ عند الخطر")]
    [InlineData("مجموعة أدعية مأثورة من مصادر موثوقة")]
    [InlineData("خصص وقتاً هادئاً للاستماع إلى آية الكرسي، وتابع مع طبيبك المعالج")]
    [InlineData("مدة الجلسة 45 دقيقة")]
    [InlineData("لا ادعاء بعلاج قطعي ولا بديل عن الطب. أشجع على مراجعة الطبيب دائماً.")]
    [InlineData("الرقية ليست بديلاً عن الطبيب المعالج")]
    public void Neutral_administrative_text_passes(string text) =>
        _checker.FindProhibitedClaim(text).Should().BeNull();
}

public class SafeReferralEvaluatorTests
{
    private readonly SafeReferralEvaluator _evaluator = new();

    [Theory]
    [InlineData("أفكر في الانتحار")]
    [InlineData("أُريد أن أؤذي نفسي")]
    [InlineData("ابي اموت")]
    [InlineData("لا أريد أن أعيش")]
    [InlineData("سأنهي حياتي")]
    [InlineData("يهددني بالقتل")]
    [InlineData("I want to kill myself")]
    public void Risk_indicators_trigger_referral(string text) =>
        _evaluator.RequiresImmediateEmergencyReferral(new SafetySignal(text)).Should().BeTrue();

    [Theory]
    [InlineData("أرغب بموعد مسائي إن أمكن")]
    [InlineData("أعاني من قلق بسيط قبل الامتحانات")]
    [InlineData("")]
    public void Ordinary_text_does_not_trigger(string text) =>
        _evaluator.RequiresImmediateEmergencyReferral(new SafetySignal(text)).Should().BeFalse();
}
