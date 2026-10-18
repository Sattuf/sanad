using FluentAssertions;
using Sanad.Domain.Companion;
using Sanad.Domain.Exceptions;
using static Sanad.Domain.UnitTests.Builders;

namespace Sanad.Domain.UnitTests;

internal static class Companion
{
    public static readonly SafetyAttestation AllChecked = new(true, true, true, true, true, true, true);

    public static List<PlanDay> Days(int n) => Enumerable.Range(1, n).Select(d => new PlanDay(d, [
        new PlanItem(PlanItemKind.Note, null, null, "اقرأ بتدبّر وحضور قلب.", null, null, 1),
        new PlanItem(PlanItemKind.Quran, "kursi", "آية الكرسي", null, null, null, 3),
        new PlanItem(PlanItemKind.Dhikr, null, "بسم الله الذي لا يضر", "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ", "رواه أبو داود (5088)", null, 3),
    ])).ToList();

    public static PlanAuthor Author(bool consent = true)
    {
        var a = PlanAuthor.Create("الشيخ المعدّ", "إمام وخطيب، يعدّ أوراد الرقية من الكتاب والسنة.", Guid.NewGuid(), Policy, Now);
        if (consent) a.RecordConsent("إذن-2026-001", DateOnly.FromDateTime(Now.UtcDateTime), Guid.NewGuid(), Now);
        return a;
    }

    public static RuqyahPlan Draft(PlanAuthor author, Guid creator, int duration = 7) =>
        RuqyahPlan.Create("morning-evening", "تحصين الصباح والمساء", "آية الكرسي وأذكار اليوم", "آية الكرسي والأذكار الثابتة.",
            author.Id, duration, 10, Days(duration), creator, Policy, Now);

    public static RuqyahPlan Published(PlanAuthor? author = null)
    {
        author ??= Author();
        var p = Draft(author, Guid.NewGuid());
        p.SubmitForReview(p.CreatedByUserId, Now);
        p.Approve(Guid.NewGuid(), author, AllChecked, Policy, Now);
        return p;
    }
}

public class RuqyahPlanTests
{
    [Fact]
    public void Creator_cannot_review_own_plan()
    {
        var author = Companion.Author();
        var creator = Guid.NewGuid();
        var p = Companion.Draft(author, creator);
        p.SubmitForReview(creator, Now);
        var act = () => p.Approve(creator, author, Companion.AllChecked, Policy, Now);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("self_review");
    }

    [Fact]
    public void No_publication_without_written_consent_or_complete_safety_check()
    {
        var author = Companion.Author(consent: false);
        var p = Companion.Draft(author, Guid.NewGuid());
        p.SubmitForReview(p.CreatedByUserId, Now);
        var noConsent = () => p.Approve(Guid.NewGuid(), author, Companion.AllChecked, Policy, Now);
        noConsent.Should().Throw<DomainException>().Which.Code.Should().Be("publication_gate");

        author.RecordConsent("إذن-1", DateOnly.FromDateTime(Now.UtcDateTime), Guid.NewGuid(), Now);
        var partial = () => p.Approve(Guid.NewGuid(), author, Companion.AllChecked with { NoDreamInterpretation = false }, Policy, Now);
        partial.Should().Throw<DomainException>().Which.Code.Should().Be("publication_gate");

        p.Approve(Guid.NewGuid(), author, Companion.AllChecked, Policy, Now);
        p.Status.Should().Be(PlanStatus.Published);
        p.SafetyCheckedAtUtc.Should().Be(Now);
        p.DomainEvents.OfType<PlanPublishedEvent>().Should().ContainSingle();
    }

    [Fact]
    public void Published_plan_is_immutable_and_edits_create_a_new_version()
    {
        var p = Companion.Published();
        var edit = () => p.Update("عنوان", "ملخص", "محتوى", p.AuthorId, 7, 10, Companion.Days(7), Policy, Now);
        edit.Should().Throw<DomainException>().Which.Code.Should().Be("invalid_state");

        var v2 = p.NewVersion(Guid.NewGuid(), Now);
        v2.Key.Should().Be(p.Key);
        v2.Version.Should().Be(2);
        v2.PreviousVersionId.Should().Be(p.Id);
        v2.Status.Should().Be(PlanStatus.Draft);
        p.Supersede(Now);
        p.Status.Should().Be(PlanStatus.Superseded);
        p.IsServable.Should().BeTrue("المسجّلون يكملون نسختهم");
    }

    [Theory]
    [InlineData("خطة لعلاج السحر المأكول")]
    [InlineData("ورد للمس العاشق")]
    [InlineData("اعرف نوع الإصابة أولاً")]
    [InlineData("تشفى خلال أسبوع")]
    [InlineData("إذا اشتدت الأعراض فهذا دليل؛ تشتد الأعراض مع الرقية")]
    [InlineData("ماء مقروء عليه للبيع")]
    [InlineData("مع تفسير الأحلام")]
    public void Plans_are_described_by_content_not_by_condition(string summary)
    {
        var author = Companion.Author();
        var act = () => RuqyahPlan.Create("plan-x", "خطة", summary, "محتوى", author.Id, 7, 10, Companion.Days(7), Guid.NewGuid(), Policy, Now);
        act.Should().Throw<ContentPolicyViolationException>();
    }

    [Fact]
    public void Plan_structure_is_validated()
    {
        var a = Companion.Author();
        Action wrongDuration = () => RuqyahPlan.Create("plan-x", "خطة", "ملخص", "محتوى", a.Id, 10, 10, Companion.Days(10), Guid.NewGuid(), Policy, Now);
        wrongDuration.Should().Throw<DomainException>();
        Action wrongDays = () => RuqyahPlan.Create("plan-x", "خطة", "ملخص", "محتوى", a.Id, 7, 10, Companion.Days(6), Guid.NewGuid(), Policy, Now);
        wrongDays.Should().Throw<DomainException>();

        var unknownPassage = Companion.Days(7);
        unknownPassage[0].Items[1] = unknownPassage[0].Items[1] with { QuranKey = "baqarah-1-286" };
        Action quran = () => RuqyahPlan.Create("plan-x", "خطة", "ملخص", "محتوى", a.Id, 7, 10, unknownPassage, Guid.NewGuid(), Policy, Now);
        quran.Should().Throw<DomainException>().WithMessage("*المصحف المدقّق*");

        var noSource = Companion.Days(7);
        noSource[2].Items[2] = noSource[2].Items[2] with { Source = " " };
        Action dhikr = () => RuqyahPlan.Create("plan-x", "خطة", "ملخص", "محتوى", a.Id, 7, 10, noSource, Guid.NewGuid(), Policy, Now);
        dhikr.Should().Throw<DomainException>().WithMessage("*التخريج*");

        Action badKey = () => RuqyahPlan.Create("Plan X", "خطة", "ملخص", "محتوى", a.Id, 7, 10, Companion.Days(7), Guid.NewGuid(), Policy, Now);
        badKey.Should().Throw<DomainException>();
    }

    [Fact]
    public void Editing_author_profile_drops_consent()
    {
        var a = Companion.Author();
        a.UpdateProfile(a.DisplayName, a.Bio, Policy, Now);
        a.HasConsent.Should().BeTrue("لا تغيير فلا يسقط الإذن");
        a.UpdateProfile("اسم آخر", a.Bio, Policy, Now);
        a.HasConsent.Should().BeFalse();
    }
}

public class PlanEnrollmentTests
{
    [Fact]
    public void Only_published_plans_can_be_started()
    {
        var author = Companion.Author();
        var draft = Companion.Draft(author, Guid.NewGuid());
        var act = () => PlanEnrollment.Start(Guid.NewGuid(), draft, null, Now);
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Device_days_are_merged_and_bounded_by_duration()
    {
        var e = PlanEnrollment.Start(Guid.NewGuid(), Companion.Published(), WirdReminder.AfterFajr, Now);
        e.RecordCompletedDays([1, 2], new DateOnly(2026, 9, 2), Now);
        e.RecordCompletedDays([2, 3], new DateOnly(2026, 9, 1), Now);
        e.CompletedDays.Should().Equal(1, 2, 3);
        e.LastCompletedOn.Should().Be(new DateOnly(2026, 9, 2), "الأحدث يبقى");
        e.CurrentDay.Should().Be(4);

        var act = () => e.RecordCompletedDays([8], null, Now);
        act.Should().Throw<DomainException>();
        e.Stop(Now);
        var stopped = () => e.RecordCompletedDays([4], null, Now);
        stopped.Should().Throw<DomainException>();
    }
}

public class KhatmaTests
{
    private static Khatma Group(out Guid owner)
    {
        owner = Guid.NewGuid();
        return Khatma.Create(owner, "أم محمد", KhatmaMode.Group, "ختمة الأسرة", "enc:x", null, Now);
    }

    [Fact]
    public void Solo_khatma_belongs_entirely_to_owner_and_completion_raises_event_once()
    {
        var owner = Guid.NewGuid();
        var k = Khatma.Create(owner, "أنا", KhatmaMode.Solo, "ختمتي", null, null, Now);
        k.Juz.Should().HaveCount(30).And.OnlyContain(j => j.AssigneeUserId == owner);
        for (var i = 1; i <= 30; i++) k.SetDone(owner, i, true, Now);
        k.SetDone(owner, 30, true, Now);
        k.IsComplete.Should().BeTrue();
        k.DomainEvents.OfType<KhatmaCompletedEvent>().Should().ContainSingle();
        var join = () => k.Join(Guid.NewGuid(), "ضيف", Now);
        join.Should().Throw<DomainException>();
    }

    [Fact]
    public void Members_read_only_their_own_juz()
    {
        var k = Group(out var owner);
        var member = Guid.NewGuid();
        k.Join(member, "أحمد", Now);
        k.Claim(member, [11, 12], Now);
        var steal = () => k.Claim(owner, [11], Now);
        steal.Should().Throw<DomainConflictException>();
        var markOthers = () => k.SetDone(owner, 12, true, Now);
        markOthers.Should().Throw<DomainException>().Which.Code.Should().Be("forbidden");

        k.SetDone(owner, 1, true, Now);
        k.Juz.Single(j => j.Index == 1).AssigneeUserId.Should().Be(owner, "الجزء المتاح يصير لمن قرأه");

        var outsider = () => k.SetDone(Guid.NewGuid(), 2, true, Now);
        outsider.Should().Throw<DomainException>().Which.Code.Should().Be("forbidden");
    }

    [Fact]
    public void Auto_distribution_spreads_free_juz_contiguously()
    {
        var k = Group(out var owner);
        var b = Guid.NewGuid();
        var c = Guid.NewGuid();
        k.Join(b, "ب", Now.AddMinutes(1));
        k.Join(c, "ج", Now.AddMinutes(2));
        k.AutoDistribute(owner, Now);
        k.Juz.Count(j => j.AssigneeUserId == owner).Should().Be(10);
        k.Juz.Where(j => j.Index <= 10).Should().OnlyContain(j => j.AssigneeUserId == owner);
        k.Juz.Where(j => j.Index > 20).Should().OnlyContain(j => j.AssigneeUserId == c);
        var notOwner = () => k.AutoDistribute(b, Now);
        notOwner.Should().Throw<DomainException>().Which.Code.Should().Be("forbidden");
    }

    [Fact]
    public void Leaving_frees_unread_juz_and_keeps_read_ones()
    {
        var k = Group(out _);
        var m = Guid.NewGuid();
        k.Join(m, "م", Now);
        k.Claim(m, [5, 6], Now);
        k.SetDone(m, 5, true, Now);
        k.Leave(m, Now);
        k.IsMember(m).Should().BeFalse();
        k.Juz.Single(j => j.Index == 5).IsDone.Should().BeTrue();
        k.Juz.Single(j => j.Index == 6).AssigneeUserId.Should().BeNull();
    }

    [Fact]
    public void Ownership_passes_to_oldest_member_on_account_deletion()
    {
        var k = Group(out var owner);
        var first = Guid.NewGuid();
        k.Join(first, "أول", Now.AddMinutes(1));
        k.Join(Guid.NewGuid(), "ثان", Now.AddMinutes(2));
        k.HandOverFrom(owner, Now).Should().BeTrue();
        k.OwnerUserId.Should().Be(first);

        var lonely = Khatma.Create(Guid.NewGuid(), "وحدي", KhatmaMode.Group, "ختمة", null, null, Now);
        lonely.HandOverFrom(lonely.OwnerUserId, Now).Should().BeFalse("لا أحد يرثها فتُحذف");
    }

    [Fact]
    public void Member_names_are_sanitised_and_capacity_is_limited()
    {
        var k = Group(out _);
        var u = Guid.NewGuid();
        k.Join(u, "‮أحمد‏", Now);
        k.Members.Single(m => m.UserId == u).DisplayName.Should().Be("أحمد");
        var tag = () => k.Join(Guid.NewGuid(), "<b>x</b>", Now);
        tag.Should().Throw<DomainException>();
        for (var i = k.Members.Count; i < Khatma.MaxMembers; i++) k.Join(Guid.NewGuid(), $"عضو {i}", Now);
        var full = () => k.Join(Guid.NewGuid(), "زائد", Now);
        full.Should().Throw<DomainException>();
    }
}

public class CompanionEventCounterTests
{
    [Fact]
    public void Only_allowlisted_events_and_dimensions_are_counted()
    {
        CompanionEventCounter.IsAllowed("plan_started", "7").Should().BeTrue();
        CompanionEventCounter.IsAllowed("plan_started", "user@example.com").Should().BeFalse();
        CompanionEventCounter.IsAllowed("search_query", "x").Should().BeFalse();
        var c = CompanionEventCounter.Start(new DateOnly(2026, 9, 1), "khatma_juz_done", "group", Now);
        c.Add(3);
        c.Count.Should().Be(3);
    }
}
