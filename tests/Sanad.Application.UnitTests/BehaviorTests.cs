using FluentAssertions;
using FluentValidation;
using MediatR;
using NSubstitute;
using Sanad.Application.Common.Behaviors;
using Sanad.Application.Common.Exceptions;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Common.Messaging;
using Sanad.Application.Modules.Accounts;
using Sanad.Application.Modules.Scheduling;
using Sanad.Application.Modules.Verification;
using Sanad.Domain.Identity;

namespace Sanad.Application.UnitTests;

public class AuthorizationBehaviorTests
{
    private static ICurrentUser User(Guid? id, bool mfa = false, params string[] roles)
    {
        var u = Substitute.For<ICurrentUser>();
        u.UserId.Returns(id);
        u.IsMfaAuthenticated.Returns(mfa);
        u.IsInRole(Arg.Any<string>()).Returns(ci => roles.Contains(ci.Arg<string>()));
        return u;
    }

    private static Task<TResponse> Run<TRequest, TResponse>(TRequest request, ICurrentUser user) where TRequest : notnull =>
        new AuthorizationBehavior<TRequest, TResponse>(user).Handle(request, () => Task.FromResult(default(TResponse)!), CancellationToken.None);

    [Fact]
    public async Task Requests_require_authentication_by_default()
    {
        var act = () => Run<GetMyBookingsQuery, IReadOnlyList<BookingSummaryDto>>(new GetMyBookingsQuery(), User(null));
        await act.Should().ThrowAsync<UnauthenticatedException>();
    }

    [Fact]
    public async Task Anonymous_requests_are_allowed_only_when_marked()
    {
        var act = () => Run<LoginWithEmailCommand, AuthResponse>(new LoginWithEmailCommand("a@b.c", "x"), User(null));
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task Missing_role_is_forbidden()
    {
        var act = () => Run<GetVerificationQueueQuery, IReadOnlyList<VerificationQueueItemDto>>(new GetVerificationQueueQuery(null),
            User(Guid.NewGuid(), true, SanadRoles.Beneficiary));
        await act.Should().ThrowAsync<ForbiddenAccessException>();
    }

    [Fact]
    public async Task Staff_role_without_mfa_session_is_refused()
    {
        var act = () => Run<GetVerificationQueueQuery, IReadOnlyList<VerificationQueueItemDto>>(new GetVerificationQueueQuery(null),
            User(Guid.NewGuid(), false, SanadRoles.Coordinator));
        await act.Should().ThrowAsync<MfaRequiredException>();
    }

    [Fact]
    public async Task Staff_role_with_mfa_passes()
    {
        var act = () => Run<GetVerificationQueueQuery, IReadOnlyList<VerificationQueueItemDto>>(new GetVerificationQueueQuery(null),
            User(Guid.NewGuid(), true, SanadRoles.Coordinator));
        await act.Should().NotThrowAsync();
    }
}

public class ValidationBehaviorTests
{
    [Fact]
    public async Task Invalid_request_is_rejected_with_field_errors()
    {
        var sut = new ValidationBehavior<AssignRoleCommand, Unit>([new AssignRoleCommandValidator()]);
        var act = () => sut.Handle(new AssignRoleCommand(Guid.NewGuid(), SanadRole.SystemAdmin), () => Task.FromResult(Unit.Value), CancellationToken.None);
        var ex = await act.Should().ThrowAsync<RequestValidationException>();
        ex.Which.Errors.Should().ContainKey("role");
    }
}

public class IdempotencyBehaviorTests
{
    [Fact]
    public async Task Repeated_key_returns_stored_response_without_executing_again()
    {
        var request = Substitute.For<IRequestContext>();
        request.IdempotencyKey.Returns("key-1");
        var user = Substitute.For<ICurrentUser>();
        var userId = Guid.NewGuid();
        user.UserId.Returns(userId);
        var store = new InMemoryStore();
        var sut = new IdempotencyBehavior<CreateBookingRequestCommand, BookingCreatedDto>(request, user, store);
        var cmd = new CreateBookingRequestCommand(Guid.NewGuid(), Guid.NewGuid(), null, false);
        var calls = 0;
        Task<BookingCreatedDto> Next()
        {
            calls++;
            return Task.FromResult(new BookingCreatedDto(Guid.NewGuid(), "UnderReview", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch));
        }

        var first = await sut.Handle(cmd, Next, CancellationToken.None);
        var second = await sut.Handle(cmd, Next, CancellationToken.None);

        calls.Should().Be(1);
        second.Id.Should().Be(first.Id);
    }

    private sealed class InMemoryStore : IIdempotencyStore
    {
        private readonly Dictionary<string, string> _items = new();

        public Task<string?> GetResponseAsync(string key, Guid? userId, string requestName, CancellationToken ct) =>
            Task.FromResult(_items.GetValueOrDefault($"{key}|{userId}|{requestName}"));

        public Task SaveResponseAsync(string key, Guid? userId, string requestName, string responseJson, CancellationToken ct)
        {
            _items[$"{key}|{userId}|{requestName}"] = responseJson;
            return Task.CompletedTask;
        }
    }
}

public class RequestSecurityMarkersTests
{
    /// <summary>كل أمر إداري حساس يتطلب جلسة 2FA — فحص شامل بالانعكاس على كل الطلبات.</summary>
    [Fact]
    public void Every_staff_request_requires_mfa()
    {
        var staffRoles = new[] { SanadRoles.Coordinator, SanadRoles.ContentManager, SanadRoles.SystemAdmin, SanadRoles.PrivacySecurityOfficer };
        var requests = typeof(DependencyInjection).Assembly.GetTypes()
            .Where(t => t.GetInterfaces().Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IRequest<>)));
        foreach (var t in requests)
        {
            var attr = (RequireRolesAttribute?)Attribute.GetCustomAttribute(t, typeof(RequireRolesAttribute));
            if (attr is not null && attr.Roles.All(staffRoles.Contains))
                attr.RequireMfa.Should().BeTrue($"{t.Name} طلب إداري يجب أن يتطلب 2FA");
        }
    }
}
