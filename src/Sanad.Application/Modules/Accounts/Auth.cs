using FluentValidation;
using MediatR;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Domain.Consent;

namespace Sanad.Application.Modules.Accounts;

public sealed record AuthResponse(Guid UserId, string Stage, bool IsNewUser, string? AccessToken, DateTimeOffset? AccessTokenExpiresAtUtc,
    string? RefreshToken, DateTimeOffset? RefreshTokenExpiresAtUtc, string? Ticket)
{
    public static AuthResponse From(AuthResult r) => new(r.UserId, r.Stage.ToString(), r.IsNewUser,
        r.Tokens?.AccessToken, r.Tokens?.AccessTokenExpiresAtUtc, r.Tokens?.RefreshToken, r.Tokens?.RefreshTokenExpiresAtUtc, r.Ticket);
}

internal static class AuthRules
{
    public const string E164Pattern = @"^\+[1-9]\d{7,14}$";

    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule) => rule
        .NotEmpty().MinimumLength(10).MaximumLength(128)
        .Matches("[A-Z]").WithMessage("كلمة المرور يجب أن تحتوي حرفاً لاتينياً كبيراً.")
        .Matches("[a-z]").WithMessage("كلمة المرور يجب أن تحتوي حرفاً لاتينياً صغيراً.")
        .Matches("[0-9]").WithMessage("كلمة المرور يجب أن تحتوي رقماً.");
}

// ── التسجيل بالبريد: دور Beneficiary فوراً، بلا أي مستند ─────────────────────────
[AllowAnonymousRequest]
public sealed record RegisterWithEmailCommand(string Email, string Password, string DisplayName, bool AcceptTerms, bool AcceptPrivacyPolicy)
    : ICommand<AuthResponse>, ISensitiveRequest;

public sealed class RegisterWithEmailCommandValidator : AbstractValidator<RegisterWithEmailCommand>
{
    public RegisterWithEmailCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).StrongPassword();
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.AcceptTerms).Equal(true).WithMessage("يجب الموافقة على شروط الاستخدام.");
        RuleFor(x => x.AcceptPrivacyPolicy).Equal(true).WithMessage("يجب الموافقة على سياسة الخصوصية.");
    }
}

public sealed class RegisterWithEmailCommandHandler(IIdentityService identity, IApplicationDbContext db, IDateTime clock, IPolicyVersionProvider policies)
    : IRequestHandler<RegisterWithEmailCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(RegisterWithEmailCommand request, CancellationToken cancellationToken)
    {
        var result = await identity.RegisterWithEmailAsync(request.Email.Trim(), request.Password, request.DisplayName.Trim(), cancellationToken);
        db.ConsentRecords.Add(ConsentRecord.Accept(result.UserId, ConsentType.TermsOfService, policies.CurrentVersion(ConsentType.TermsOfService), clock.UtcNow));
        db.ConsentRecords.Add(ConsentRecord.Accept(result.UserId, ConsentType.PrivacyPolicy, policies.CurrentVersion(ConsentType.PrivacyPolicy), clock.UtcNow));
        await db.SaveChangesAsync(cancellationToken);
        return AuthResponse.From(result);
    }
}

// ── الدخول بالبريد ─────────────────────────────────────────────────────────────
[AllowAnonymousRequest]
public sealed record LoginWithEmailCommand(string Email, string Password) : ICommand<AuthResponse>, ISensitiveRequest;

public sealed class LoginWithEmailCommandValidator : AbstractValidator<LoginWithEmailCommand>
{
    public LoginWithEmailCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}

public sealed class LoginWithEmailCommandHandler(IIdentityService identity) : IRequestHandler<LoginWithEmailCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(LoginWithEmailCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.LoginWithEmailAsync(request.Email.Trim(), request.Password, cancellationToken));
}

// ── جوجل: يُستدعى من Endpoint الـ callback بعد نجاح المصادقة الخارجية ─────────────
[AllowAnonymousRequest]
public sealed record CompleteGoogleLoginCommand(string ExternalProviderKey, string VerifiedEmail, string? DisplayName) : ICommand<AuthResponse>;

public sealed class CompleteGoogleLoginCommandHandler(IIdentityService identity) : IRequestHandler<CompleteGoogleLoginCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(CompleteGoogleLoginCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.CompleteGoogleLoginAsync(request.ExternalProviderKey, request.VerifiedEmail, request.DisplayName, cancellationToken));
}

// ── أبل (من الجوال): يُستدعى بعد التحقق من رمز الهوية وnonce في الـ Endpoint ───────────
[AllowAnonymousRequest]
public sealed record CompleteAppleLoginCommand(string ExternalProviderKey, string? VerifiedEmail, string? DisplayName) : ICommand<AuthResponse>;

public sealed class CompleteAppleLoginCommandHandler(IIdentityService identity) : IRequestHandler<CompleteAppleLoginCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(CompleteAppleLoginCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.CompleteExternalLoginAsync(ExternalLoginProvider.Apple, request.ExternalProviderKey, request.VerifiedEmail,
            request.DisplayName, cancellationToken));
}

// ── الهاتف OTP (خلف CAPTCHA وحد معدل صارم في الـ Endpoint) ──────────────────────
[AllowAnonymousRequest]
public sealed record RequestPhoneOtpCommand(string PhoneNumber) : ICommand<Unit>;

public sealed class RequestPhoneOtpCommandValidator : AbstractValidator<RequestPhoneOtpCommand>
{
    public RequestPhoneOtpCommandValidator() =>
        RuleFor(x => x.PhoneNumber).NotEmpty().Matches(AuthRules.E164Pattern).WithMessage("رقم الهاتف يجب أن يكون بصيغة دولية مثل ‎+9665XXXXXXXX.");
}

public sealed class RequestPhoneOtpCommandHandler(IIdentityService identity) : IRequestHandler<RequestPhoneOtpCommand, Unit>
{
    public async Task<Unit> Handle(RequestPhoneOtpCommand request, CancellationToken cancellationToken)
    {
        await identity.RequestPhoneOtpAsync(request.PhoneNumber, cancellationToken);
        return Unit.Value;
    }
}

/// <summary>البريد اختياري — يُرفَق بالحساب عند إنشائه أو استكماله لاحقاً (تصدير، إشعارات، استرجاع الحساب).</summary>
[AllowAnonymousRequest]
public sealed record VerifyPhoneOtpCommand(string PhoneNumber, string Code, string? Email = null) : ICommand<AuthResponse>, ISensitiveRequest;

public sealed class VerifyPhoneOtpCommandValidator : AbstractValidator<VerifyPhoneOtpCommand>
{
    public VerifyPhoneOtpCommandValidator()
    {
        RuleFor(x => x.PhoneNumber).NotEmpty().Matches(AuthRules.E164Pattern);
        RuleFor(x => x.Code).NotEmpty().Matches(@"^\d{6}$").WithMessage("رمز التحقق من 6 أرقام.");
        RuleFor(x => x.Email).EmailAddress().MaximumLength(256).When(x => !string.IsNullOrWhiteSpace(x.Email));
    }
}

public sealed class VerifyPhoneOtpCommandHandler(IIdentityService identity) : IRequestHandler<VerifyPhoneOtpCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(VerifyPhoneOtpCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.VerifyPhoneOtpAsync(request.PhoneNumber, request.Code, request.Email?.Trim(), cancellationToken));
}

// ── مراحل الدخول الوسيطة (كلمة مرور مؤقتة، إعداد/إدخال 2FA) ─────────────────────
[AllowAnonymousRequest]
public sealed record ChangeRequiredPasswordCommand(string Ticket, string NewPassword) : ICommand<AuthResponse>, ISensitiveRequest;

public sealed class ChangeRequiredPasswordCommandValidator : AbstractValidator<ChangeRequiredPasswordCommand>
{
    public ChangeRequiredPasswordCommandValidator()
    {
        RuleFor(x => x.Ticket).NotEmpty().MaximumLength(200);
        RuleFor(x => x.NewPassword).StrongPassword();
    }
}

public sealed class ChangeRequiredPasswordCommandHandler(IIdentityService identity) : IRequestHandler<ChangeRequiredPasswordCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(ChangeRequiredPasswordCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.ChangeRequiredPasswordAsync(request.Ticket, request.NewPassword, cancellationToken));
}

[AllowAnonymousRequest]
public sealed record BeginTwoFactorSetupCommand(string Ticket) : ICommand<TwoFactorSetupInfo>;

public sealed class BeginTwoFactorSetupValidator : AbstractValidator<BeginTwoFactorSetupCommand>
{
    public BeginTwoFactorSetupValidator() => RuleFor(x => x.Ticket).NotEmpty().MaximumLength(200);
}

public sealed class BeginTwoFactorSetupCommandHandler(IIdentityService identity) : IRequestHandler<BeginTwoFactorSetupCommand, TwoFactorSetupInfo>
{
    public Task<TwoFactorSetupInfo> Handle(BeginTwoFactorSetupCommand request, CancellationToken cancellationToken) =>
        identity.BeginTwoFactorSetupAsync(request.Ticket, cancellationToken);
}

[AllowAnonymousRequest]
public sealed record CompleteTwoFactorSetupCommand(string Ticket, string Code) : ICommand<AuthResponse>, ISensitiveRequest;

public sealed class CompleteTwoFactorSetupCommandHandler(IIdentityService identity) : IRequestHandler<CompleteTwoFactorSetupCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(CompleteTwoFactorSetupCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.CompleteTwoFactorSetupAsync(request.Ticket, request.Code, cancellationToken));
}

[AllowAnonymousRequest]
public sealed record VerifyTwoFactorCommand(string Ticket, string Code) : ICommand<AuthResponse>, ISensitiveRequest;

public sealed class VerifyTwoFactorCommandHandler(IIdentityService identity) : IRequestHandler<VerifyTwoFactorCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(VerifyTwoFactorCommand request, CancellationToken cancellationToken) =>
        AuthResponse.From(await identity.VerifyTwoFactorAsync(request.Ticket, request.Code, cancellationToken));
}

public sealed class TwoFactorCodeValidator : AbstractValidator<VerifyTwoFactorCommand>
{
    public TwoFactorCodeValidator()
    {
        RuleFor(x => x.Ticket).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Code).NotEmpty().Matches(@"^\d{6}$");
    }
}

public sealed class TwoFactorSetupCodeValidator : AbstractValidator<CompleteTwoFactorSetupCommand>
{
    public TwoFactorSetupCodeValidator()
    {
        RuleFor(x => x.Ticket).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Code).NotEmpty().Matches(@"^\d{6}$");
    }
}

// ── الرموز ─────────────────────────────────────────────────────────────────────
[AllowAnonymousRequest]
public sealed record RefreshTokenCommand(string RefreshToken) : ICommand<AuthTokens>, ISensitiveRequest;

public sealed class RefreshTokenValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenValidator() => RuleFor(x => x.RefreshToken).NotEmpty().MaximumLength(500);
}

public sealed class RefreshTokenCommandHandler(IIdentityService identity) : IRequestHandler<RefreshTokenCommand, AuthTokens>
{
    public Task<AuthTokens> Handle(RefreshTokenCommand request, CancellationToken cancellationToken) =>
        identity.RefreshAsync(request.RefreshToken, cancellationToken);
}

public sealed record RevokeTokenCommand(string? RefreshToken, string? AccessTokenJti, DateTimeOffset? AccessTokenExpiresAtUtc) : ICommand<Unit>, ISensitiveRequest;

public sealed class RevokeTokenCommandHandler(IIdentityService identity, ICurrentUser currentUser) : IRequestHandler<RevokeTokenCommand, Unit>
{
    public async Task<Unit> Handle(RevokeTokenCommand request, CancellationToken cancellationToken)
    {
        await identity.RevokeAsync(currentUser.UserId!.Value, request.RefreshToken, request.AccessTokenJti, request.AccessTokenExpiresAtUtc, cancellationToken);
        return Unit.Value;
    }
}
