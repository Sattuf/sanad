using MediatR;

namespace Sanad.Application.Common.Messaging;

/// <summary>أمر يغيّر الحالة — يُسجَّل في التدقيق تلقائياً (بيانات وصفية فقط).</summary>
public interface ICommand<out TResponse> : IRequest<TResponse> { }

/// <summary>استعلام قراءة فقط.</summary>
public interface IQuery<out TResponse> : IRequest<TResponse> { }

/// <summary>أمر يدعم مفتاح التكرار الآمن (Idempotency-Key) — الإعادة تعيد نفس النتيجة.</summary>
public interface IIdempotentCommand { }

/// <summary>
/// أمر يحمل نصاً حساساً: التدقيق لا يسجّل أي حقل منه إطلاقاً، فقط اسم العملية والنتيجة.
/// كل الأوامر تُعامَل هكذا افتراضياً — هذا الواجهة توثيق صريح لا أكثر.
/// </summary>
public interface ISensitiveRequest { }

/// <summary>طلب عام لا يتطلب مصادقة (التسجيل، الدخول، الدليل العام، رابط المشاركة).</summary>
[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class AllowAnonymousRequestAttribute : Attribute { }

/// <summary>يتطلب أحد الأدوار المذكورة. RequireMfa إلزامي للأدوار الإدارية الحساسة.</summary>
[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class RequireRolesAttribute : Attribute
{
    public RequireRolesAttribute(params string[] roles) => Roles = roles;

    public IReadOnlyList<string> Roles { get; }

    public bool RequireMfa { get; init; }
}
