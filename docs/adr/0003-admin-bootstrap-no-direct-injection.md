# ADR-0003: لا حقن مباشر في قاعدة البيانات لأي حساب إداري، حتى الأول
التاريخ: 2026-09-23
الحالة: مقبول

## السياق
"من يعتمد أول مدير قبل وجود أي مدير أصلاً؟" — الحل السهل (INSERT مباشر) يتجاوز تجزئة كلمة المرور وسجل التدقيق وشرط 2FA.

## القرار
- `AdminBootstrapSeeder` يعمل عند الإقلاع **فقط** إن لم يوجد أي `SystemAdmin`، و**فقط** إن أُعدّ `Bootstrap:AdminEmail` و`Bootstrap:AdminTempPassword` صراحة (user-secrets / Key Vault).
- الإنشاء عبر Identity API (تجزئة صحيحة)، مع `MustChangePassword = true` و`TwoFactorEnabled = true`، وسجل تدقيق `System.AdminBootstrapped`.
- أول دخول يمر إلزامياً بـ: تغيير كلمة المرور ← إعداد تطبيق المصادقة ← جلسة `amr=mfa`.
- كل مدير أو منسق لاحق يُنشأ حصراً عبر `AssignRoleCommand` من `SystemAdmin` قائم. **`SystemAdmin` نفسه لا يُمنح من التطبيق إطلاقاً.**

## الأثر
- اختبار إلزامي: تشغيل الـ Seeder مرتين ينتج مديراً واحداً (`T10_admin_bootstrap_seeder_runs_only_once`).
- بعد أول إقلاع ناجح في الإنتاج تُحذف أسرار `Bootstrap:*`.
