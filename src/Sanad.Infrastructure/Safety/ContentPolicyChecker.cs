using System.Text.RegularExpressions;
using Sanad.Domain.Common;

namespace Sanad.Infrastructure.Safety;

/// <summary>
/// فلتر العبارات المحظورة — references/07-safety-guardrails.md §7.2. يعمل على النص بعد توحيده (ArabicTextNormalizer)،
/// لذا الأنماط مكتوبة بالصيغة الموحّدة (ة→ه، أ→ا، بلا تشكيل).
/// يُطبَّق بلا أي استثناء على: وصف الخدمة، الملف المهني، وصف الجهة، مقاطع المكتبة، ملاحظة المختص، وتوصية المختص.
/// القائمة تحتاج مراجعة دورية من مشرف سريري ومراجع شرعي قبل أي إطلاق فعلي (بوابة 08 §8.5).
/// </summary>
public sealed class ContentPolicyChecker : IContentPolicyChecker
{
    private const RegexOptions Options = RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Compiled;
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(250);

    public const string CategoryGuaranteedCure = "وعد بشفاء مضمون";
    public const string CategoryDefinitiveUnseenCure = "ادعاء علاج قطعي لحالة غيبية";
    public const string CategoryReplacesMedicine = "الترويج كبديل عن الطب";
    public const string CategoryMedicationDose = "وصف دواء أو جرعة";
    public const string CategoryGuaranteedResult = "ضمان نتيجة علاجية";
    public const string CategoryAbsoluteSecrecy = "ضمان سرية مطلق قد يخالف واجب الإبلاغ عن خطر";

    private static readonly (Regex Pattern, string Category)[] Rules =
    [
        (R(@"شفاء\s*(مضمون|مؤكد|اكيد|100\s*%?|كامل|تام|قطعي|نهائي)"), CategoryGuaranteedCure),
        (R(@"(نضمن|يضمن|اضمن|تضمن)\s*(لك\s*|لكم\s*)?(ال)?(شفاء|شفاءك|علاج|تعافي)"), CategoryGuaranteedCure),
        (R(@"\bguaranteed\s+(cure|healing|recovery)\b|\b100\s*%\s*(cure|healing)\b"), CategoryGuaranteedCure),

        (R(@"(علاج|شفاء)\s*(ناجع|قطعي|نهائي|مضمون|اكيد)\s*(من\s*|ل)?(ال|ل)?(سحر|عين|مس|حسد)"), CategoryDefinitiveUnseenCure),
        (R(@"(نزيل|نفك|نبطل|نعالج|ازاله|فك|ابطال)\s*(ال|لل)?(سحر|عين|مس|حسد)\s*(نهائيا|تماما|بشكل\s*نهائي|مضمون|100)"), CategoryDefinitiveUnseenCure),

        // النفي المسؤول ("ولا بديل عن الطب"، "ليست بديلاً عن الطبيب") إخلاء مسؤولية مطلوب، لا ادعاء — يُستثنى صراحة
        (R(@"(?<!(^|\s)(و)?(لا|ليس|ليست|ليسوا|غير|ليست\s*ابدا|ليس\s*ابدا)\s*)بديل(ا)?\s*(عن|ل)\s*(ال)?(طبيب|دواء|ادويه|علاج\s*الطبي|طب|مستشفي)"), CategoryReplacesMedicine),
        (R(@"(اترك|اتركي|توقف\s*عن|توقفي\s*عن|اوقف|اوقفي|لا\s*تاخذ|لا\s*تاخذي|استغن\s*عن)\s*(ال)?(دواء|ادويه|علاج|طبيب|علاجك|دواءك)"), CategoryReplacesMedicine),
        (R(@"\b(instead\s+of|replace(s)?)\s+(your\s+)?(doctor|medication|medicine)\b"), CategoryReplacesMedicine),

        (R(@"\bجرع(ه|ات|تين)\b"), CategoryMedicationDose),
        (R(@"وصفه\s*(دوائيه|طبيه)"), CategoryMedicationDose),
        (R(@"\b(ملغ|مليغرام|ملليغرام|ميليغرام|ملجم|مجم)\b"), CategoryMedicationDose),
        (R(@"\d+(\.\d+)?\s*(ملغ|مغ|مجم|ملجم|مل|سي\s*سي|mg|mcg|ml|g)\b"), CategoryMedicationDose),
        (R(@"(خذ|خذي|تناول|تناولي)\s*\d+"), CategoryMedicationDose),
        (R(@"(حبه|حبتين|قرص|قرصين|كبسوله)\s*(يوميا|كل|مرتين|ثلاث|قبل|بعد)"), CategoryMedicationDose),
        (R(@"\b(dose|dosage|prescription)\b"), CategoryMedicationDose),

        (R(@"(نتيجه|نتائج)\s*(مضمونه|مؤكده|اكيده)|ضمان\s*(ال)?(نتيجه|نتائج)|نضمن\s*(لك\s*)?(ال)?(نتيجه|نتائج)"), CategoryGuaranteedResult),
        (R(@"\bguaranteed\s+results?\b"), CategoryGuaranteedResult),

        (R(@"سريه\s*(تامه|كامله)\s*مضمونه|سريه\s*مطلقه|ضمان\s*(ال)?سريه\s*(ال)?(تامه|مطلقه|كامله)"), CategoryAbsoluteSecrecy),
    ];

    public string? FindProhibitedClaim(string text)
    {
        var normalized = ArabicTextNormalizer.Normalize(text);
        if (normalized.Length == 0) return null;
        foreach (var (pattern, category) in Rules)
        {
            try
            {
                if (pattern.IsMatch(normalized)) return category;
            }
            catch (RegexMatchTimeoutException)
            {
                // نص مصمَّم لإبطاء الفحص يُعامَل كمخالفة، لا كنص نظيف
                return "نص غير قابل للفحص";
            }
        }
        return null;
    }

    private static Regex R(string pattern) => new(pattern, Options, Timeout);
}
