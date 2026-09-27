# ADR-0002: PostgreSQL للإنتاج، SQLite للتطوير والاختبار فقط
التاريخ: 2026-09-23
الحالة: مقبول

## السياق
المرجع يحدد PostgreSQL + Testcontainers. بيئة التطوير الحالية لا يتوفر فيها Docker ولا PostgreSQL، ولا نريد أن يتوقف التطوير أو الاختبار على ذلك.

## القرار
- `Database:Provider` = `Postgres` (افتراضي) أو `Sqlite`.
- الإنتاج: PostgreSQL حصراً، بهجرات EF (`Persistence/Migrations`)، مع `xmin` كقفل تفاؤلي على الحجز. **الإقلاع خارج Development/Testing يرفض SQLite** (`StartupGuards`).
- التطوير/الاختبار: SQLite ملف، والمخطط عبر `EnsureCreated`. كل `DateTimeOffset` يُخزَّن كـ UtcTicks لأن SQLite لا يدعم مقارنتها أو ترتيبها.
- القفل التفاؤلي على فترة الإتاحة (`AvailabilitySlot.ConcurrencyStamp`) مستقل عن المزود — يعمل في الاثنين.
- اختبار Testcontainers لـ PostgreSQL موجود ويُفعَّل بـ `SANAD_TEST_POSTGRES=1` (في CI).

## الأثر
- أي تغيير في النموذج يتطلب: `dotnet ef migrations add <Name> -p src/Sanad.Infrastructure -s src/Sanad.Api -o Persistence/Migrations`.
- البحث النصي حالياً مطابقة نصية في الذاكرة على مجموعة مرشحين محدودة (500) — كافٍ لحجم MVP. عند النمو: فهرس `tsvector` على الأعمدة العلنية فقط (لا المشفّرة أبداً).
