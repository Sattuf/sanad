namespace Sanad.Application.Common.Exceptions;

public sealed class NotFoundException : Exception
{
    public NotFoundException(string entityName, object key) : base($"{entityName} ({key}) غير موجود.") { }
}

/// <summary>غير مصرَّح بالوصول لهذا المورد. يُترجَم إلى 403 (أو 404 حيث يجب عدم كشف وجود المورد).</summary>
public sealed class ForbiddenAccessException : Exception
{
    public ForbiddenAccessException(string message = "لا تملك صلاحية تنفيذ هذه العملية.") : base(message) { }
}

/// <summary>مصدر خارجي معتمد (كتالوج قرآني، YouTube) لم يستجب أو ردّ بما لا يُقبل. يُترجَم إلى 502.</summary>
public sealed class ExternalSourceException(string message) : Exception(message);

public sealed class UnauthenticatedException : Exception
{
    public UnauthenticatedException() : base("يتطلب هذا الطلب تسجيل الدخول.") { }
}

/// <summary>فشل مصادقة (بيانات دخول، رمز تحقق، رمز تحديث). رسالة عامة لا تكشف أي تفاصيل عن وجود الحساب.</summary>
public sealed class AuthenticationFailedException : Exception
{
    public AuthenticationFailedException(string message = "بيانات الدخول غير صحيحة.") : base(message) { }
}

/// <summary>العملية الإدارية تتطلب جلسة موثّقة بالتحقق الثنائي.</summary>
public sealed class MfaRequiredException : Exception
{
    public MfaRequiredException() : base("هذه العملية الإدارية تتطلب تسجيل دخول بالتحقق الثنائي (2FA).") { }
}

public sealed class RequestValidationException : Exception
{
    public RequestValidationException(IDictionary<string, string[]> errors)
        : base("طلب غير صالح.") => Errors = new Dictionary<string, string[]>(errors);

    public RequestValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = [message] }) { }

    public IReadOnlyDictionary<string, string[]> Errors { get; }
}

public sealed class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}

public sealed class TooManyRequestsException : Exception
{
    public TooManyRequestsException(string message) : base(message) { }
}
