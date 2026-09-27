# المرحلة 11 — تحصين الإنتاج: أمان وتوسّع

هذا الملف يجمّع ما يفصل "MVP يعمل" عن "نظام يتحمّل استخداماً حقيقياً بأمان". **لا تبدأ هذه المرحلة قبل اجتياز بوابات `08-testing-deployment-roadmap.md` §8.5**، إلا في بيئة تطوير/تدريب.

## 11.1 مفاتيح التكرار الآمن (Idempotency Keys)

`POST /bookings` و`POST /reports` يتطلبان `Idempotency-Key`. `IdempotencyBehavior` يخزّن نتيجة أول تنفيذ ناجح ويعيدها عند التكرار — ضروري خصوصاً على الجوال حيث انقطاع الشبكة شائع. لا حاجة لهذا على `POST /bookings/{id}/recommendations` أو `/provider-note` في هذا الحجم من الاستخدام، لكن أضِفه لاحقاً إن أظهر الاستخدام الفعلي حاجة (تكرار غير مقصود لتوصية نادر لكنه ممكن).

## 11.2 حذف البيانات مقابل الاحتفاظ بأثر التدقيق

`DELETE /me` يحذف البيانات الشخصية القابلة للتحديد فعلياً، ويُبقي `AuditLogEntry` بعد تجريد `ActorUserId` إلى معرّف مجهول ثابت. **نقطة جديدة يجب توضيحها في ADR قبل التنفيذ:** عند حذف حساب مستفيد له `ProviderRecommendation` مستلمة أو `BookingRequest` بملاحظة، هل تُحذف تلك السجلات أيضاً أم تُجرَّد فقط؟ الافتراض الأكثر تحفظاً: **تُجرَّد لا تُحذف** (يبقى للمختص وللتدقيق أثر أن توصية أُرسلت، بلا القدرة على ربطها بهوية شخص بعينه بعد الحذف) — وثّق هذا صراحة قبل أي تنفيذ فعلي.

## 11.3 حماية النماذج العامة من إساءة الاستخدام الآلي

- CAPTCHA على `POST /auth/register/email`، `POST /auth/phone/request-otp`، `POST /me/provider-upgrade-request`، `POST /reports`.
- حدود معدل مزدوجة (IP + حساب)، وصارمة تحديداً على `/auth/phone/request-otp` — استنزاف رصيد مزود SMS تهديد تكلفة حقيقي لا مجرد إزعاج.
- **جديد (v3):** حد معدل معتدل أيضاً على `POST /library/tracks/{id}/share-link` — منع توليد آلاف الروابط آلياً من حساب واحد.

## 11.4 إدارة الأسرار حسب البيئة

`dotnet user-secrets` محلياً، Key Vault/Vault في الإنتاج، دوران دوري لمفاتيح JWT ومفتاح `IFieldEncryptor` (منفصلان تماماً عن بعضهما)، ولإعدادات `Bootstrap:AdminEmail`/`Bootstrap:AdminTempPassword` (تُحذَف من الأسرار بعد أول إقلاع ناجح في الإنتاج، لا تبقى مُعرَّفة إلى الأبد). `gitleaks` كخطوة CI أولى دائماً.

## 11.5 نمط Outbox

كل حدث Domain — بما فيه `ProviderRecommendationSentEvent` و`EmergencyReferralTriggeredEvent` — يُكتب كسجل `OutboxMessage` ضمن نفس المعاملة، ويُنشَر عبر عملية خلفية دورية. تسليم At-Least-Once مضمون، لا تسليم متزامن قد يضيع بصمت.

## 11.6 فحوصات الصحة والمراقبة

`GET /health/live`، `GET /health/ready`. Correlation-Id في كل سطر سجل. لوحة مراقبة مع تنبيه على المئين 95 لـ `GET /directory` و`GET /library`. خطة نسخ احتياطي واستعادة لقاعدة البيانات، مع اختبار استعادة فعلي دوري لا افتراضي.

## 11.7 رؤوس أمان HTTP الكاملة

```csharp
public class SecurityHeadersMiddleware
{
    public async Task InvokeAsync(HttpContext ctx, RequestDelegate next)
    {
        ctx.Response.Headers.Append("X-Content-Type-Options", "nosniff");
        ctx.Response.Headers.Append("X-Frame-Options", "DENY");
        ctx.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
        ctx.Response.Headers.Append("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; object-src 'none'");
        await next(ctx);
    }
}
```

**استثناء واحد مضبوط بعناية:** صفحة `/public/shared/{shortCode}` (§10.7) تحتاج تشغيل صوت من رابط `AudioUrl` مستضاف — تأكد أن `Content-Security-Policy` لهذا المسار تحديداً يسمح بمصدر الوسائط الفعلي (`media-src`) دون فتح المصدر بشكل عام على بقية التطبيق.

## 11.8 التخزين المؤقت والتوسّع الأفقي

ترتيب الإضافة حسب الحاجة الفعلية المُثبَتة باختبار حمل، لا استباقاً:

1. **Redis Cache** أمام `GET /directory` و`GET /library` (الأعلى قراءة).
2. **Redis Backplane لـ SignalR** عند تعدد نسخ API.
3. **قائمة إبطال JWT في Redis**.
4. **طابور رسائل** لتوزيع الإشعارات (بما فيها إشعار "لديك توصية جديدة").
5. **نسخة قراءة (Read Replica)** لـ PostgreSQL.

## 11.9 اختبار الحمل كممارسة مستمرة

k6/Gatling بسيناريو نمو تدريجي على: `GET /directory`، `GET /library`، `POST /bookings` تحت تزامن، **و`POST /auth/phone/request-otp` تحديداً** للتأكد أن حدود المعدل وCAPTCHA تمنع استنزاف التكلفة فعلياً لا نظرياً فقط. كرر بعد كل إضافة من §11.8 لقياس الأثر الفعلي.
