using FluentAssertions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Sanad.Application.Common.Interfaces;
using Sanad.Application.Modules.Accounts;
using Sanad.Application.Modules.Companion;
using Sanad.Application.Modules.Ruqyah;

namespace Sanad.Application.UnitTests;

/// <summary>
/// جسم فيه مجموعة null يجب أن يُرفض كمدخل غير صالح (400)، لا أن يرمي داخل المحقق (500).
/// AddApplication يجعل كل قاعدة تتوقف عند أول إخفاق، فلا تصل Must إلى Count على null.
/// </summary>
public class ValidatorNullSafetyTests
{
    private static readonly IDateTime Clock = Substitute.For<IDateTime>();

    static ValidatorNullSafetyTests()
    {
        Clock.UtcNow.Returns(new DateTimeOffset(2026, 10, 19, 9, 0, 0, TimeSpan.Zero));
        new ServiceCollection().AddApplication();
    }

    public static TheoryData<IValidator, object> NullCollections() => new()
    {
        { new RecordCompanionEventsCommandValidator(), new RecordCompanionEventsCommand(null!) },
        { new SyncMyPlanProgressCommandValidator(Clock), new SyncMyPlanProgressCommand(Guid.NewGuid(), null!, null) },
        { new SaveMyWirdCommandValidator(Clock), new SaveMyWirdCommand("morning", new DateOnly(2026, 10, 19), null!, 0, 1) },
        { new CreatePlanCommandValidator(), new CreatePlanCommand("k", "عنوان", "ملخص", "المحتوى", Guid.NewGuid(), 7, 10, null!) },
        { new BeginTwoFactorSetupValidator(), new BeginTwoFactorSetupCommand(null!) },
        { new RefreshTokenValidator(), new RefreshTokenCommand(null!) },
    };

    [Theory]
    [MemberData(nameof(NullCollections))]
    public async Task Null_input_is_a_validation_failure_not_an_exception(IValidator validator, object command)
    {
        var context = (IValidationContext)Activator.CreateInstance(typeof(ValidationContext<>).MakeGenericType(command.GetType()), command)!;
        var act = () => validator.ValidateAsync(context);
        (await act.Should().NotThrowAsync()).Subject.IsValid.Should().BeFalse();
    }
}
