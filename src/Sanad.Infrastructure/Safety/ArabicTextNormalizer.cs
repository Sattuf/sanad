using System.Globalization;
using System.Text;

namespace Sanad.Infrastructure.Safety;

/// <summary>
/// توحيد النص العربي قبل الفحص حتى لا يُتجاوز الفلتر بالتشكيل أو التطويل أو اختلاف الهمزات أو الأرقام الهندية:
/// إزالة التشكيل والتطويل، أ/إ/آ → ا، ى → ي، ة → ه، الأرقام العربية-الهندية → لاتينية، ومسافات موحّدة.
/// </summary>
public static class ArabicTextNormalizer
{
    public static string Normalize(string? text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        var sb = new StringBuilder(text.Length);
        var lastWasSpace = false;
        foreach (var raw in text.Normalize(NormalizationForm.FormC))
        {
            var c = raw;
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == UnicodeCategory.NonSpacingMark || c == 'ـ' /* تطويل */ || c is '‌' or '‍' or '‎' or '‏') continue;

            c = c switch
            {
                'أ' or 'إ' or 'آ' or 'ٱ' => 'ا',
                'ى' => 'ي',
                'ة' => 'ه',
                >= '٠' and <= '٩' => (char)('0' + (c - '٠')),
                >= '۰' and <= '۹' => (char)('0' + (c - '۰')),
                '٪' => '%',
                _ => char.ToLowerInvariant(c),
            };

            if (char.IsWhiteSpace(c))
            {
                if (!lastWasSpace) sb.Append(' ');
                lastWasSpace = true;
                continue;
            }
            lastWasSpace = false;
            sb.Append(c);
        }
        return sb.ToString().Trim();
    }
}
