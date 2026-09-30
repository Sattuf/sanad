#!/usr/bin/env python3
"""
يولّد frontend/src/features/ruqyah/quran.ts من نص المصحف بالرسم العثماني.

المصدر: حزمة npm ‏quran-json@3.1.2 (نص موسوعة القرآن الكريم QuranEnc، رخصة CC BY-SA 4.0).
الاستخدام:
    npm pack quran-json@3.1.2 && tar xzf quran-json-3.1.2.tgz
    python3 frontend/scripts/gen-quran.py package/dist/quran.json

يكتب:
  - quran: المقاطع المعروضة في المجموعات (مفتاح ← سورة ونطاق آيات).
  - citedAyat: النص الكامل لكل آية يُستشهد بجزء منها في content.ts بصيغة ﴿…﴾ [السورة: رقم]،
    ليتحقق الاختبار أن كل اقتباس مطابق حرفياً للمصحف.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/features/ruqyah/quran.ts"
CONTENT = ROOT / "src/features/ruqyah/content.ts"

# (المفتاح، السورة، من آية، إلى آية)
PASSAGES = [
    ("fatiha", 1, 1, 7), ("baqarah-1-5", 2, 1, 5), ("baqarah-102", 2, 102, 102), ("baqarah-163-164", 2, 163, 164),
    ("kursi", 2, 255, 255), ("baqarah-285-286", 2, 285, 286), ("imran-18-19", 3, 18, 19), ("araf-54-56", 7, 54, 56),
    ("araf-117-122", 7, 117, 122), ("yunus-79-82", 10, 79, 82), ("taha-65-69", 20, 65, 69), ("muminun-115-118", 23, 115, 118),
    ("saffat-1-10", 37, 1, 10), ("ahqaf-29-32", 46, 29, 32), ("rahman-33-36", 55, 33, 36), ("hashr-21-24", 59, 21, 24),
    ("jinn-1-9", 72, 1, 9), ("ikhlas", 112, 1, 4), ("falaq", 113, 1, 5), ("nas", 114, 1, 6),
    ("qalam-51-52", 68, 51, 52), ("mulk-3-4", 67, 3, 4),
    ("tawbah-14", 9, 14, 14), ("yunus-57", 10, 57, 57), ("nahl-69", 16, 68, 69), ("isra-82", 17, 82, 82), ("shuara-80", 26, 80, 80),
    ("fussilat-44", 41, 44, 44), ("kahf-39", 18, 39, 39), ("anbiya-87", 21, 87, 88),
]

CITATION = re.compile(r"﴿[^﴾]+﴾\s*\[([^:\]]+):\s*(\d+)\]")


def main(path: str) -> None:
    q = json.load(open(path, encoding="utf-8"))
    by_name = {c["name"]: c for c in q}
    js = lambda v: json.dumps(v, ensure_ascii=False)

    out = [
        "// مُولَّد آلياً من نص المصحف بالرسم العثماني (موسوعة القرآن الكريم QuranEnc، عبر حزمة quran-json 3.1.2، رخصة CC BY-SA 4.0).",
        "// لا يُعدَّل يدوياً — يُعاد توليده بـ frontend/scripts/gen-quran.py، وأي تعديل على نص الآيات يمر بمراجعة شرعية.",
        "",
        "export interface QuranPassage { surah: number; surahName: string; from: number; to: number; ayat: string[] }",
        "",
        "export const quran = {",
    ]
    for key, s, a, b in PASSAGES:
        ch = q[s - 1]
        ayat = [v["text"] for v in ch["verses"] if a <= v["id"] <= b]
        assert len(ayat) == b - a + 1, key
        out.append(f'  "{key}": {{ surah: {s}, surahName: {js(ch["name"])}, from: {a}, to: {b}, ayat: {js(ayat)} }},')
    out += ["} satisfies Record<string, QuranPassage>;", "", "export type QuranKey = keyof typeof quran;", ""]

    cited = {}
    for m in CITATION.finditer(CONTENT.read_text(encoding="utf-8")):
        name, ayah = m.group(1).strip(), int(m.group(2))
        if name not in by_name:
            sys.exit(f"سورة غير معروفة في الاستشهاد: {name}")
        cited[f"{name}:{ayah}"] = by_name[name]["verses"][ayah - 1]["text"]
    out.append("/** النص الكامل للآيات المستشهد بها في content.ts — مفتاحها «اسم السورة:رقم الآية». */")
    out.append("export const citedAyat: Record<string, string> = {")
    for k in sorted(cited):
        out.append(f"  {js(k)}: {js(cited[k])},")
    out += ["};", ""]

    OUT.write_text("\n".join(out), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(PASSAGES)} مقطعاً، {len(cited)} آية مستشهداً بها")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "package/dist/quran.json")
