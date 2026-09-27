# ADR-0001: Clean Architecture داخل Modular Monolith، وتوثيق كل قرار غير محسوم
التاريخ: 2026-09-23
الحالة: مقبول

## السياق
الحزمة المرجعية (`references/01-solution-architecture.md`) تفرض أربع طبقات واتجاه اعتماد من الخارج للداخل، وتُلزم بتوثيق كل قرار غير محسوم في ADR بدلاً من التوقف عنده.

## القرار
- أربعة مشاريع: `Sanad.Domain` ← `Sanad.Application` ← `Sanad.Infrastructure` / `Sanad.Api`. Domain لا يعتمد على أي مكتبة بنية تحتية (مفحوص آلياً في `ArchitecturalGuardrailTests`).
- Minimal APIs مجمّعة حسب الوحدة، MediatR 12 (آخر إصدار بترخيص مفتوح) للأوامر والاستعلامات.
- كل قرار يتخذ الافتراض **الأكثر تحفظاً** من ناحية الخصوصية والسلامة، ويوثَّق هنا.

## الأثر
- واجهات السلامة (`IContentPolicyChecker`, `ISafeReferralEvaluator`, `IFieldEncryptor`) موضوعة في Domain لا Application، لأن كيانات Domain تستدعيها عند الإنشاء — وهذا لا يكسر قاعدة الاعتماد.
- FluentAssertions مثبّت على 7.x وMediatR على 12.x لتجنّب تراخيص تجارية في الإصدارات الأحدث.
