using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Safety;
using Sanad.Domain.Common;

namespace Sanad.Infrastructure.Safety;

/// <summary>
/// كاشف مؤشرات الخطر العاجل (إيذاء النفس، نية الانتحار، تهديد بالأذى، اعتداء، خطر على قاصر).
/// الانحياز مقصود نحو الحساسية العالية: إيجابية كاذبة تعني عرض معلومات طوارئ لا يحتاجها المستخدم،
/// أما سلبية كاذبة فقد تكلّف حياة. القائمة تتطلب مراجعة مشرف سريري محلي قبل أي إطلاق فعلي (08 §8.5).
/// </summary>
public sealed class SafeReferralEvaluator : ISafeReferralEvaluator
{
    private const RegexOptions Options = RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Compiled;
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(250);

    private static readonly Regex[] Indicators =
    [
        R(@"انتحار|انتحر|بنتحر|سانتحر|راح\s*انتحر"),
        R(@"(اقتل|اؤذي|اذي|اجرح|اضر|اعذب)\s*(نفسي|روحي|حالي)"),
        R(@"(ابي|اريد|بدي|ودي|ابغي|ابغى|نفسي)\s*(ا)?موت"),
        R(@"(لا|ما)\s*(اريد|ابي|ابغي|ابغى|بدي)\s*(ان\s*)?(اعيش|الحياه|اكمل\s*حياتي)"),
        R(@"(انهي|اخلص\s*من|انهاء)\s*(حياتي|عمري)"),
        R(@"فقدت\s*(الرغبه|الامل)\s*(في|ب)\s*(الحياه|العيش)"),
        R(@"(لا|ما\s*في|مافي|ليس\s*هناك)\s*(فائده|معني|معنى|داعي)\s*(من|ل)\s*(حياتي|العيش|وجودي)"),
        R(@"(ساقتل|راح\s*اقتل|سوف\s*اقتل|ناوي\s*اقتل|اقتله|اقتلها|اقتلهم)"),
        R(@"(يهددني|يهددوني|تهديد\s*بالقتل|هددني\s*بالقتل)"),
        R(@"(اعتدي|اعتداء|يعتدي|تحرش|يتحرش)\s*(علي|علي[َّ]?|جنسي|بي)"),
        R(@"(طفل|طفله|قاصر|ابني|بنتي|ولدي).{0,30}(اعتداء|يؤذي|يضرب|تحرش|يعتدي)"),
        R(@"(اسمع|تسمع|يسمع)\s*اصوات\s*(تامرني|تطلب\s*مني|تقول\s*لي\s*اقتل)"),
        R(@"\b(suicid(e|al)|kill\s+myself|end\s+my\s+life|self[-\s]?harm|want\s+to\s+die|hurt\s+myself)\b"),
    ];

    public bool RequiresImmediateEmergencyReferral(SafetySignal signal)
    {
        ArgumentNullException.ThrowIfNull(signal);
        var normalized = ArabicTextNormalizer.Normalize(signal.Text);
        if (normalized.Length == 0) return false;
        foreach (var indicator in Indicators)
        {
            try
            {
                if (indicator.IsMatch(normalized)) return true;
            }
            catch (RegexMatchTimeoutException)
            {
                return true; // عند الشك: الإحالة أولاً
            }
        }
        return false;
    }

    private static Regex R(string pattern) => new(pattern, Options, Timeout);
}

public sealed class SafetySignalContext : ISafetySignalContext
{
    public bool EmergencyReferralTriggered { get; private set; }

    public void Flag() => EmergencyReferralTriggered = true;
}

public sealed class EmergencyReferralOptions
{
    public const string Section = "Safety:Emergency";

    public string Message { get; set; } =
        "إن كنت أنت أو أي شخص في خطر مباشر الآن، اتصل بالطوارئ فوراً. سند ليست خدمة طوارئ ولا تتابع الرسائل لحظياً.";

    public List<EmergencyContactDto> Contacts { get; set; } = [];
}

public sealed class EmergencyReferralInfoProvider(IOptions<EmergencyReferralOptions> options) : IEmergencyReferralInfoProvider
{
    // 112 يعمل من الجوال في معظم الدول ويحوّل للطوارئ المحلية — يُستكمَل بأرقام بلد التشغيل عبر الإعدادات
    private static readonly EmergencyContactDto[] Fallback = [new("رقم الطوارئ الدولي من الجوال", "112")];

    public EmergencyReferralDto Get()
    {
        var o = options.Value;
        var contacts = o.Contacts.Count > 0 ? o.Contacts : [.. Fallback];
        return new EmergencyReferralDto(true, o.Message, contacts, "/emergency");
    }
}

public sealed class PolicyVersionOptions
{
    public const string Section = "Policies";

    public Dictionary<string, string> Versions { get; set; } = new();
}

public sealed class PolicyVersionProvider(IOptions<PolicyVersionOptions> options) : IPolicyVersionProvider
{
    public string CurrentVersion(Domain.Consent.ConsentType type) =>
        options.Value.Versions.TryGetValue(type.ToString(), out var v) && !string.IsNullOrWhiteSpace(v) ? v : "1.0";
}
