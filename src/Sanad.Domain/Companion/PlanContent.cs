using System.Text;
using System.Text.RegularExpressions;
using Sanad.Domain.Common;
using Sanad.Domain.Exceptions;

namespace Sanad.Domain.Companion;

/*
  محتوى خطط الرقية — .claude/skills/sanad-ruqyah-app/references/content-guardrails.md.
  الخادم لا يخزّن نص القرآن: الخطة تشير إلى مقطع بمفتاحه في المصحف المدقّق المضمَّن في التطبيق
  (packages/shared/src/content/quran.ts). القائمة هنا تطابق مفاتيحه حرفياً، ويتحقق اختبار في ruqyah-app من التطابق.
*/

public enum PlanItemKind { Quran, Dhikr, Note }

/// <summary>عنصر في ورد اليوم. Quran: مفتاح المقطع. Dhikr: نص وتخريج. Note: توجيه قصير من المعدّ.</summary>
public sealed record PlanItem(PlanItemKind Kind, string? QuranKey, string? Title, string? Text, string? Source, string? Note, int Repeat);

public sealed record PlanDay(int Day, List<PlanItem> Items);

public static class QuranPassageKeys
{
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        "fatiha", "baqarah-1-5", "baqarah-102", "baqarah-163-164", "kursi", "baqarah-285-286", "imran-18-19", "araf-54-56",
        "araf-117-122", "yunus-79-82", "taha-65-69", "muminun-115-118", "saffat-1-10", "ahqaf-29-32", "rahman-33-36",
        "hashr-21-24", "jinn-1-9", "ikhlas", "falaq", "nas", "qalam-51-52", "mulk-3-4", "tawbah-14", "yunus-57", "nahl-69",
        "isra-82", "shuara-80", "fussilat-44", "kahf-39", "anbiya-87",
    };
}

/// <summary>المدد المعتمدة للخطط فقط.</summary>
public static class PlanDurations
{
    public static readonly IReadOnlySet<int> Allowed = new HashSet<int> { 7, 14, 21, 40 };
}

/// <summary>
/// ما يُرفض في وصف أي خطة (content-guardrails.md §3): الخطة توصف بمحتواها ومدتها لا بحالة المستخدم.
/// يُكمّل فلتر الادعاءات العام (IContentPolicyChecker) ولا يحلّ محله.
/// </summary>
public static partial class PlanWording
{
    private static readonly (Regex Pattern, string Category)[] Rules =
    [
        (R(@"تشخيص|اعراضك|جدول\s*(ال)?اعراض|نوع\s*(ال)?اصاب|اصابتك|حالتك\s*(هي|من)"), "تشخيص أو سؤال عن الحالة"),
        (R(@"مسحور|ممسوس|معيون|محسود|السحر\s*الماكول|السحر\s*المشروب|(ال)?مس\s*(ال)?عاشق|(ال)?عاشق|فك\s*(ال)?سحر|ابطال\s*(ال)?سحر\s*(نهائيا|تماما)"), "وصف بالحالة لا بالمحتوى"),
        (R(@"برنامج\s*علاجي|خطه\s*علاجيه|جلسه\s*علاجيه|لعلاج\s*(ال)?(سحر|عين|مس|حسد)"), "تسمية الخطة علاجاً"),
        (R(@"نسبه\s*(ال)?نجاح|حالات\s*شفيت|تشفي\s*خلال|شفاء\s*خلال|بعد\s*\d+\s*(يوم|ايام)\s*(ت|ي)شفي"), "وعد بالشفاء أو مدة له"),
        (R(@"تشتد\s*(ال)?اعراض|اشتداد\s*(ال)?اعراض|(ال)?اعراض\s*(ت|س)زيد"), "اعتبار اشتداد الأعراض دليلاً"),
        (R(@"ماء\s*مقروء|زيت\s*مقروء|عسل\s*مقروء|سدر\s*مقروء|للبيع|اطلبه\s*الان|اشتر"), "بيع أو إحالة لبائع"),
        (R(@"تفسير\s*(ال)?(حلم|احلام|رؤيا|رؤى)"), "تفسير أحلام"),
    ];

    public static void EnsureAllowed(string context, params string?[] texts)
    {
        foreach (var text in texts)
        {
            if (string.IsNullOrWhiteSpace(text)) continue;
            var normalized = Normalize(text);
            foreach (var (pattern, category) in Rules)
                if (pattern.IsMatch(normalized)) throw new ContentPolicyViolationException(context, category);
        }
    }

    /// <summary>توحيد بسيط: حذف التشكيل والتطويل، أ/إ/آ→ا، ة→ه، ى→ي.</summary>
    internal static string Normalize(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var c in text)
        {
            if (c is >= 'ً' and <= 'ٟ' or 'ٰ' or 'ـ') continue;
            sb.Append(c switch
            {
                'أ' or 'إ' or 'آ' or 'ٱ' => 'ا',
                'ة' => 'ه',
                'ى' => 'ي',
                _ => c,
            });
        }
        return sb.ToString();
    }

    private static Regex R(string pattern) =>
        new(pattern, RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Compiled, TimeSpan.FromMilliseconds(250));
}

/// <summary>
/// إقرار المراجع الشرعي بفحص الأمان على قائمة content-guardrails.md §3 بنداً بنداً. لا نشر دون إقرار كل البنود.
/// </summary>
public sealed record SafetyAttestation(
    bool NoSymptomQuestions,
    bool NoConditionLabels,
    bool NoHealingPromise,
    bool NoLeavingMedicalCare,
    bool NoSales,
    bool NoExhaustingPractices,
    bool NoWorseningAsProof,
    bool NoDreamInterpretation)
{
    public bool IsComplete => NoSymptomQuestions && NoConditionLabels && NoHealingPromise && NoLeavingMedicalCare && NoSales
                              && NoExhaustingPractices && NoWorseningAsProof && NoDreamInterpretation;
}

internal static partial class PlanContentRules
{
    public const int MaxItemsPerDay = 60;

    public static List<PlanDay> Validate(IReadOnlyList<PlanDay>? days, int durationDays, IContentPolicyChecker policy)
    {
        if (days is null || days.Count != durationDays) throw new DomainException($"عدد أيام الورد يجب أن يساوي مدة الخطة ({durationDays}).");
        var clean = new List<PlanDay>(days.Count);
        for (var i = 0; i < days.Count; i++)
        {
            var d = days[i];
            if (d.Day != i + 1) throw new DomainException("أيام الخطة مرقّمة من 1 بالتتابع.");
            if (d.Items is null || d.Items.Count is 0 or > MaxItemsPerDay) throw new DomainException($"اليوم {d.Day}: بين عنصر و{MaxItemsPerDay} عنصراً.");
            if (d.Items.All(x => x.Kind == PlanItemKind.Note)) throw new DomainException($"اليوم {d.Day}: لا ورد فيه غير الملاحظات.");
            clean.Add(new PlanDay(d.Day, d.Items.Select(x => ValidateItem(x, d.Day, policy)).ToList()));
        }
        return clean;
    }

    private static PlanItem ValidateItem(PlanItem item, int day, IContentPolicyChecker policy)
    {
        var ctx = $"اليوم {day}";
        switch (item.Kind)
        {
            case PlanItemKind.Quran:
                if (item.QuranKey is null || !QuranPassageKeys.All.Contains(item.QuranKey))
                    throw new DomainException($"{ctx}: مقطع قرآني غير معروف في المصحف المدقّق.");
                var qTitle = Guard.Required(item.Title, "عنوان المقطع", 150);
                var qNote = Guard.Optional(item.Note, "الفائدة", 1000);
                Repeat(item.Repeat, ctx);
                ContentPolicy.EnsureAllowed(policy, ctx, qTitle, qNote);
                PlanWording.EnsureAllowed(ctx, qTitle, qNote);
                return new PlanItem(PlanItemKind.Quran, item.QuranKey, qTitle, null, null, qNote, item.Repeat);
            case PlanItemKind.Dhikr:
                var title = Guard.Required(item.Title, "عنوان الذكر", 150);
                var text = Guard.Required(item.Text, "نص الذكر", 3000);
                var source = Guard.Required(item.Source, "التخريج", 300);
                var note = Guard.Optional(item.Note, "الفائدة", 1000);
                Repeat(item.Repeat, ctx);
                ContentPolicy.EnsureAllowed(policy, ctx, title, text, source, note);
                PlanWording.EnsureAllowed(ctx, title, note);
                return new PlanItem(PlanItemKind.Dhikr, null, title, text, source, note, item.Repeat);
            case PlanItemKind.Note:
                var n = Guard.Required(item.Text, "توجيه المعدّ", 300);
                ContentPolicy.EnsureAllowed(policy, ctx, n);
                PlanWording.EnsureAllowed(ctx, n);
                return new PlanItem(PlanItemKind.Note, null, null, n, null, null, 1);
            default:
                throw new DomainException($"{ctx}: نوع عنصر غير معروف.");
        }
    }

    private static void Repeat(int repeat, string ctx)
    {
        if (repeat is < 1 or > 1000) throw new DomainException($"{ctx}: عدد التكرار بين 1 و1000.");
    }

    public static string ValidKey(string? key)
    {
        if (key is null || !KeyPattern().IsMatch(key)) throw new DomainException("معرّف الخطة: حروف لاتينية صغيرة وأرقام وشرطات (3–60).");
        return key;
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{2,59}$")]
    private static partial Regex KeyPattern();
}
