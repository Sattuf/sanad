using FluentAssertions;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Ruqyah;
using static Sanad.Domain.UnitTests.Builders;

namespace Sanad.Domain.UnitTests;

public class WrittenDuaTests
{
    private static WrittenDua Draft(Guid author) =>
        WrittenDua.Create("hamm", "دعاء الكرب", "لَا إِلَهَ إِلَّا اللَّهُ الْعَظِيمُ الْحَلِيمُ", "رواه البخاري (6346)", null, 1, 0, author, Policy, Now);

    [Fact]
    public void Author_cannot_publish_own_dua()
    {
        var author = Guid.NewGuid();
        var dua = Draft(author);
        dua.SubmitForReview(Now);
        var act = () => dua.Approve(author, Policy, Now);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("self_review");
    }

    [Fact]
    public void Second_reviewer_publishes_and_any_edit_returns_it_to_draft()
    {
        var dua = Draft(Guid.NewGuid());
        dua.SubmitForReview(Now);
        dua.Approve(Guid.NewGuid(), Policy, Now);
        dua.Status.Should().Be(WrittenDuaStatus.Published);
        dua.PublishedAtUtc.Should().Be(Now);

        dua.Update("hamm", "دعاء الكرب", "نص معدّل", "رواه البخاري (6346)", null, 1, 0, Policy, Now);
        dua.Status.Should().Be(WrittenDuaStatus.Draft);
        dua.PublishedAtUtc.Should().BeNull();
    }

    [Fact]
    public void Draft_cannot_be_published_without_review_and_claims_are_rejected()
    {
        var dua = Draft(Guid.NewGuid());
        var skip = () => dua.Approve(Guid.NewGuid(), Policy, Now);
        skip.Should().Throw<DomainException>().Which.Code.Should().Be("invalid_state");

        var claim = () => WrittenDua.Create("shifa", "دعاء", "نص", "مصدر", "شفاء مضمون", 1, 0, Guid.NewGuid(), Policy, Now);
        claim.Should().Throw<ContentPolicyViolationException>();
    }
}

public class DailyWirdProgressTests
{
    [Fact]
    public void Records_counts_and_completion_and_drops_zero_entries()
    {
        var p = DailyWirdProgress.Start(Guid.NewGuid(), "sleep", new DateOnly(2026, 9, 1), Now);
        p.Record(new Dictionary<string, int> { ["s0"] = 1, ["s1"] = 0, ["d:0f8fad5b-d9cb-469f-a165-70867728950e"] = 3 }, 2, 2, Now);
        p.Counts.Should().HaveCount(2);
        p.IsComplete.Should().BeTrue();
    }

    [Theory]
    [InlineData("S0", 1)]
    [InlineData("s0", -1)]
    [InlineData("s0", 5000)]
    public void Rejects_invalid_keys_or_counts(string key, int value)
    {
        var p = DailyWirdProgress.Start(Guid.NewGuid(), "sleep", new DateOnly(2026, 9, 1), Now);
        var act = () => p.Record(new Dictionary<string, int> { [key] = value }, 0, 1, Now);
        act.Should().Throw<DomainException>();
    }
}

public class ReminderDeviceTests
{
    private static ReminderDevice Device(string tz, TimeOnly? morning = null, TimeOnly? evening = null, TimeOnly? sleep = null)
    {
        var d = ReminderDevice.Register(Guid.NewGuid(), "https://fcm.googleapis.com/fcm/send/abc", new string('B', 87), new string('a', 22), Now);
        d.Schedule(tz, morning, evening, sleep, Now);
        return d;
    }

    [Fact]
    public void Slot_is_due_in_the_users_local_time_once_per_day()
    {
        // 03:40 UTC = 06:40 في الرياض (UTC+3)
        var device = Device("Asia/Riyadh", morning: new TimeOnly(6, 30));
        var at = new DateTimeOffset(2026, 9, 30, 3, 40, 0, TimeSpan.Zero);

        var due = device.DueSlots(at);
        due.Should().ContainSingle().Which.Should().Be((ReminderSlot.Morning, new DateOnly(2026, 9, 30)));

        device.MarkSent(ReminderSlot.Morning, new DateOnly(2026, 9, 30));
        device.DueSlots(at.AddMinutes(1)).Should().BeEmpty("أُرسل تذكير اليوم");
        device.DueSlots(at.AddDays(1)).Should().ContainSingle("اليوم التالي تذكير جديد");
    }

    [Fact]
    public void Slot_is_not_sent_before_its_time_or_after_the_window()
    {
        var device = Device("Asia/Riyadh", morning: new TimeOnly(6, 30));
        device.DueSlots(new DateTimeOffset(2026, 9, 30, 3, 29, 0, TimeSpan.Zero)).Should().BeEmpty();
        device.DueSlots(new DateTimeOffset(2026, 9, 30, 4, 0, 0, TimeSpan.Zero)).Should().BeEmpty("تجاوز نصف ساعة: لا يصل تذكير الصباح متأخراً");
    }

    [Fact]
    public void Late_night_slot_window_crosses_midnight_and_belongs_to_the_previous_day()
    {
        var device = Device("UTC", sleep: new TimeOnly(23, 50));
        var due = device.DueSlots(new DateTimeOffset(2026, 10, 1, 0, 5, 0, TimeSpan.Zero));
        due.Should().ContainSingle().Which.Should().Be((ReminderSlot.Sleep, new DateOnly(2026, 9, 30)));
    }

    [Fact]
    public void Unknown_time_zone_and_malformed_keys_are_rejected()
    {
        var act = () => Device("Mars/Olympus");
        act.Should().Throw<DomainException>();
        var bad = () => ReminderDevice.Register(Guid.NewGuid(), "https://fcm.googleapis.com/x", "not valid!", "a", Now);
        bad.Should().Throw<DomainException>();
    }
}
