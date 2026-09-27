# أداة استيراد مكتبة الرقية (Sanad.LibraryImport)

أداة سطر أوامر لاستيراد مجموعة مقاطع صوتية (تلاوات/أدعية/أذكار) دفعة واحدة إلى قاعدة بيانات سند،
بنفس قواعد الأمان والمحتوى المطبَّقة في الـ API تماماً — بلا أي اختصار:

- فحص التوقيع الثنائي الفعلي للملف (MP3/M4A فقط)، وحد الحجم من `Storage:MaxAudioMegabytes`.
- فلتر العبارات المحظورة (`ContentPolicyChecker`) على العنوان والمصدر والوصف.
- بصمة SHA-256 لمنع تكرار نفس الملف الصوتي.
- كل مقطع يُستورد **غير منشور** (`IsPublished = false`) — المراجعة والنشر يدويان دائماً عبر لوحة إدارة المكتبة
  (`POST /api/v1/admin/library/tracks/{id}/publish`)، لا نشر تلقائي.
- **وضع معاينة (dry-run) هو الافتراضي**: تشغيل الأداة بدون `--commit` يتحقق من كل شيء ويكتب تقريراً
  بلا أي تعديل فعلي على القاعدة أو التخزين.

## التحضير

1. ضع ملفات الصوت (MP3 أو M4A) في مجلد واحد.
2. أنشئ ملف CSV بنفس شكل [`import-template.csv`](import-template.csv):

   | FileName | Title | SourceLabel | Description | Category |
   |---|---|---|---|---|
   | اسم الملف داخل المجلد | العنوان | المصدر/القارئ + ترخيصه | وصف اختياري (لا ادعاءات علاجية) | `QuranRecitation` أو `Dua` أو `Adhkar` (تقبل أيضاً: تلاوة/دعاء/أذكار) |

   > **مهم:** `SourceLabel` يجب أن يوثّق فعلياً من القارئ/المصدر وما إذا كان لديك إذن استخدام التسجيل.
   > كثير من التلاوات المشهورة محفوظة الحقوق — تأكد من الترخيص قبل الاستيراد.

3. يلزمك بريد حساب موجود بدور `ContentManager` ليُسجَّل كمُنشئ للمقاطع (`--created-by-email`).

## التشغيل

```powershell
# معاينة فقط (موصى به أولاً) — بلا أي كتابة
dotnet run --project tools/Sanad.LibraryImport -- `
  --folder "D:\ruqyah-audio" `
  --csv "D:\ruqyah-audio\import.csv" `
  --created-by-email content-manager@sanad.local

# بعد مراجعة التقرير، التنفيذ الفعلي
dotnet run --project tools/Sanad.LibraryImport -- `
  --folder "D:\ruqyah-audio" `
  --csv "D:\ruqyah-audio\import.csv" `
  --created-by-email content-manager@sanad.local `
  --commit
```

بالتشغيل الافتراضي تقرأ الأداة إعدادات الاتصال والتخزين من `src/Sanad.Api/appsettings.Development.json`
(نفس قاعدة/مجلد التطوير الذي يستخدمه الـ API). لتوجيهها لبيئة أخرى استخدم:

```powershell
--api-dir "C:\path\to\src\Sanad.Api" --environment Production
```

## بعد الاستيراد

كل مقطع يدخل بحالة غير منشور. راجعها في لوحة إدارة المكتبة (أو عبر
`GET /api/v1/admin/library/tracks` ثم `POST .../publish` لكل مقطع تعتمده) قبل ظهورها للمستخدمين.

تعمل الأداة بأمان لإعادة التشغيل: أي ملف صوتي بصمته (SHA-256) موجودة مسبقاً في المكتبة يُتخطّى تلقائياً،
فيمكنك إضافة صفوف جديدة إلى نفس CSV وإعادة التشغيل دون خطر ازدواج.
