# ADR-0011: محدِّد المعدل المدمج في ASP.NET Core بدل AspNetCoreRateLimit
التاريخ: 2026-09-23
الحالة: مقبول

## السياق
المرجع يذكر حزمة `AspNetCoreRateLimit`. منذ .NET 7 يوجد `Microsoft.AspNetCore.RateLimiting` مدمجاً ومدعوماً رسمياً.

## القرار
- المحدِّد المدمج بسياسات مسمّاة: `auth`، `otp` (3/دقيقة لكل IP — الأصرم)، `otp-verify`، `share`، `uploads`، `messages`، `public`، `media`، ومحدِّد عام لكل مستخدم/IP.
- فوقها حدود لكل رقم هاتف داخل `OtpService` (مهلة 60 ثانية، 5 طلبات/ساعة) — استنزاف رصيد SMS تهديد تكلفة حقيقي.
- CAPTCHA (Cloudflare Turnstile) إلزامي على: التسجيل بالبريد، طلب OTP، طلب الترقية، البلاغات. عند تعذّر التحقق: **رفض** (fail closed). تعطيله مرفوض عند الإقلاع خارج التطوير.
- `X-Forwarded-For` لا يُوثق به إلا عند `ReverseProxy:Enabled=true` — وإلا يستطيع العميل تزوير IP وتجاوز الحدود.
