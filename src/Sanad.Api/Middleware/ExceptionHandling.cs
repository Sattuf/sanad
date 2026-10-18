using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Domain.Exceptions;

namespace Sanad.Api.Middleware;

/// <summary>
/// تحويل الاستثناءات إلى ProblemDetails موحّد. لا تفاصيل داخلية في الاستجابة أبداً.
/// إن رُصد مؤشر خطر خلال الطلب، تُضمَّن معلومات الإحالة العاجلة حتى في استجابة الخطأ.
/// </summary>
public sealed class SanadExceptionHandler(IProblemDetailsService problemDetails, ILogger<SanadExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var (status, title, code) = Map(exception);
        if (status >= 500) logger.LogError(exception, "Unhandled exception");

        var problem = new ProblemDetails { Status = status, Title = title, Instance = httpContext.Request.Path };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;
        switch (exception)
        {
            case RequestValidationException v:
                problem.Extensions["errors"] = v.Errors;
                break;
            case ContentPolicyViolationException c:
                problem.Extensions["policyCategory"] = c.Category;
                break;
        }

        httpContext.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = problem, Exception = exception });
    }

    private static (int Status, string Title, string Code) Map(Exception ex) => ex switch
    {
        RequestValidationException => (400, "طلب غير صالح.", "validation_failed"),
        ContentPolicyViolationException c => (400, c.Message, c.Code),
        DomainConflictException d => (409, d.Message, d.Code),
        DomainException { Code: "forbidden" } d => (403, d.Message, d.Code),
        DomainException { Code: "invalid_state" or "invalid_transition" or "publication_gate" } d => (409, d.Message, d.Code),
        DomainException d => (400, d.Message, d.Code),
        NotFoundException n => (404, n.Message, "not_found"),
        UnauthenticatedException u => (401, u.Message, "unauthenticated"),
        AuthenticationFailedException a => (401, a.Message, "authentication_failed"),
        MfaRequiredException m => (403, m.Message, "mfa_required"),
        ForbiddenAccessException f => (403, f.Message, "forbidden"),
        ConflictException c => (409, c.Message, "conflict"),
        TooManyRequestsException t => (429, t.Message, "too_many_requests"),
        ExternalSourceException e => (502, e.Message, "source_unavailable"),
        DbUpdateConcurrencyException => (409, "تغيّرت البيانات بواسطة طلب آخر في نفس اللحظة — أعد المحاولة.", "concurrency_conflict"),
        DbUpdateException => (409, "تعذّر الحفظ بسبب تعارض مع بيانات قائمة.", "conflict"),
        BadHttpRequestException b => (b.StatusCode, "طلب غير صالح.", "bad_request"),
        _ => (500, "حدث خطأ غير متوقع. تم تسجيله للمراجعة.", "internal_error"),
    };
}
