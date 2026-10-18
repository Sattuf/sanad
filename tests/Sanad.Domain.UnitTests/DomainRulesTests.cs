using System.Reflection;
using FluentAssertions;
using Sanad.Domain.Common;
using Sanad.Domain.Directory;
using Sanad.Domain.Exceptions;
using Sanad.Domain.Identity;
using Sanad.Domain.PatientCare;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Domain.Safety;
using Sanad.Domain.Scheduling;
using Sanad.Domain.Verification;
using static Sanad.Domain.UnitTests.Builders;

namespace Sanad.Domain.UnitTests;

public class BookingStateMachineTests
{
    [Fact]
    public void New_booking_is_under_review_and_holds_the_slot()
    {
        var (booking, slot, _) = Booking();
        booking.Status.Should().Be(BookingStatus.UnderReview);
        slot.Status.Should().Be(SlotStatus.Held);
    }

    [Fact]
    public void Provider_accepts_then_slot_is_booked()
    {
        var (booking, slot, provider) = Booking();
        booking.AcceptByProvider(provider.Id, slot);
        booking.Status.Should().Be(BookingStatus.Accepted);
        slot.Status.Should().Be(SlotStatus.Booked);
    }

    [Fact]
    public void Disallowed_transition_throws()
    {
        var (booking, slot, provider) = Booking();
        booking.RejectByProvider(provider.Id, "خارج نطاق الخدمة", slot);
        var act = () => booking.TransitionTo(BookingStatus.Accepted);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("invalid_transition");
    }

    [Fact]
    public void Second_hold_on_same_slot_conflicts()
    {
        var (_, slot, _) = Booking();
        var act = () => slot.Hold(Now);
        act.Should().Throw<DomainConflictException>();
    }

    [Fact]
    public void Only_assigned_provider_can_accept()
    {
        var (booking, slot, _) = Booking();
        var act = () => booking.AcceptByProvider(Guid.NewGuid(), slot);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("forbidden");
    }

    [Fact]
    public void Alternative_proposal_moves_hold_to_new_slot_and_beneficiary_accepts()
    {
        var beneficiary = Guid.NewGuid();
        var (booking, slot, provider) = Booking(beneficiary);
        var alt = AvailabilitySlot.Create(provider.Id, Now.AddDays(2), Now.AddDays(2).AddHours(1), Now);

        booking.ProposeAlternative(provider.Id, slot, alt, Now);
        slot.Status.Should().Be(SlotStatus.Open);
        alt.Status.Should().Be(SlotStatus.Held);

        booking.AcceptAlternativeByBeneficiary(beneficiary, alt);
        booking.Status.Should().Be(BookingStatus.Accepted);
        alt.Status.Should().Be(SlotStatus.Booked);
    }
}

public class BeneficiaryNoteTests
{
    [Fact]
    public void Note_is_encrypted_never_stored_as_plain_text()
    {
        var (booking, _, _) = Booking();
        booking.SetBeneficiaryNote("أرغب بموعد مسائي إن أمكن", new ReversingEncryptor());
        booking.BeneficiaryNoteEncrypted.Should().NotBeNull().And.NotContain("أرغب");
    }
}

public class VerificationTests
{
    [Fact]
    public void Document_outside_the_allowed_list_is_refused_at_request()
    {
        var act = () => VerificationRecord.RequestProviderUpgrade(Guid.NewGuid(), PractitionerType.ReligiousPractitioner, "راقٍ شرعي",
            VerificationDocumentTypes.OrganizationRegistration, "جهة", Guid.NewGuid(), Now);
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Expired_verification_is_no_longer_valid()
    {
        var v = ApprovedUpgrade();
        v.IsCurrentlyValid(Now).Should().BeTrue();
        v.ExpireIfPastDue(Now.AddYears(2));
        v.Status.Should().Be(VerificationStatus.Expired);
        v.IsCurrentlyValid(Now.AddYears(2)).Should().BeFalse();
    }

    [Fact]
    public void No_publication_without_valid_verification()
    {
        var v = ApprovedUpgrade();
        var p = ProviderProfile.CreateFromApprovedUpgrade(v, "مختص", Now);
        p.UpdateProfile("مختص", "لقب", "نطاق", ["ar"], ServiceDeliveryMode.Both, null, "حدود", Policy);
        var act = () => p.Publish(v, Now.AddYears(2));
        act.Should().Throw<DomainException>().Which.Code.Should().Be("publication_gate");
    }

    [Fact]
    public void Organization_cannot_publish_with_pending_verification()
    {
        var org = Organization.Create("جهة وقفية", null, OrganizationTrack.WaqfFree, null, null, null, "وصف", null, Policy);
        var v = VerificationRecord.RequestForOrganization(org.Id, VerificationDocumentTypes.OrganizationRegistration, "وزارة", null, null, Now);
        var act = () => org.Publish(v, Now);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("publication_gate");
    }
}

public class EscalationTests
{
    [Theory]
    [InlineData(1, false, false, EscalationLevel.Warning)]
    [InlineData(2, false, false, EscalationLevel.Restriction)]
    [InlineData(3, false, false, EscalationLevel.Suspension)]
    [InlineData(1, true, false, EscalationLevel.Suspension)]
    [InlineData(0, false, true, EscalationLevel.RegulatoryReferral)]
    public void Level_is_computed_from_documented_reports(int count, bool severe, bool crime, EscalationLevel expected) =>
        EscalationCase.ComputeLevel(count, severe, crime).Should().Be(expected);

    [Fact]
    public void Level_never_decreases_automatically_without_coordinator()
    {
        var e = EscalationCase.Open(Guid.NewGuid());
        e.Recompute(3, false, false, null, Now);
        e.Level.Should().Be(EscalationLevel.Suspension);

        e.Recompute(0, false, false, null, Now.AddDays(200));
        e.Level.Should().Be(EscalationLevel.Suspension, "لا تراجع تلقائي بدون reviewedByCoordinatorId");

        e.Recompute(0, false, false, Guid.NewGuid(), Now.AddDays(200));
        e.Level.Should().Be(EscalationLevel.Warning);
    }
}

public class PatientCareTests
{
    [Fact]
    public void Case_note_only_by_assigned_provider()
    {
        var (booking, slot, provider) = Booking();
        booking.AcceptByProvider(provider.Id, slot);
        var act = () => ProviderCaseNote.Create(booking, Guid.NewGuid(), "ملاحظة", new ReversingEncryptor(), Policy, Now);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("forbidden");
    }

    [Fact]
    public void Case_note_with_prohibited_claim_is_rejected()
    {
        var (booking, slot, provider) = Booking();
        booking.AcceptByProvider(provider.Id, slot);
        var act = () => ProviderCaseNote.Create(booking, provider.Id, "شفاء مضمون", new ReversingEncryptor(), Policy, Now);
        act.Should().Throw<ContentPolicyViolationException>();
    }

    [Fact]
    public void Recommendation_requires_accepted_booking()
    {
        var (booking, _, provider) = Booking();
        var act = () => ProviderRecommendation.Create(booking, provider.Id, "استمع يومياً", [], new ReversingEncryptor(), Policy, Now);
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Recommendation_rejects_unpublished_track()
    {
        var (booking, slot, provider) = Booking();
        booking.AcceptByProvider(provider.Id, slot);
        var act = () => ProviderRecommendation.Create(booking, provider.Id, "استمع لهذا المقطع", [Track(published: false)],
            new ReversingEncryptor(), Policy, Now);
        act.Should().Throw<DomainException>().Which.Code.Should().Be("track_not_published");
    }

    [Fact]
    public void Valid_recommendation_is_encrypted_and_addressed_to_beneficiary()
    {
        var beneficiary = Guid.NewGuid();
        var (booking, slot, provider) = Booking(beneficiary);
        booking.AcceptByProvider(provider.Id, slot);
        var rec = ProviderRecommendation.Create(booking, provider.Id, "خصص وقتاً هادئاً للاستماع", [Track(published: true)],
            new ReversingEncryptor(), Policy, Now);
        rec.RecipientBeneficiaryUserId.Should().Be(beneficiary);
        rec.GuidanceTextEncrypted.Should().NotContain("هادئاً");
        rec.DomainEvents.OfType<ProviderRecommendationSentEvent>().Should().ContainSingle();
    }
}

public class LibraryTests
{
    [Fact]
    public void Share_link_only_for_published_track()
    {
        var act = () => SharedContentLink.Create(Track(published: false), Guid.NewGuid());
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Share_code_is_random_and_fixed_length()
    {
        var track = Track(published: true);
        var codes = Enumerable.Range(0, 50).Select(_ => SharedContentLink.Create(track, null).ShortCode).ToList();
        codes.Should().OnlyHaveUniqueItems();
        codes.Should().AllSatisfy(c => c.Should().HaveLength(SharedContentLink.ShortCodeLength));
    }

    [Fact]
    public void Track_with_prohibited_description_cannot_be_created()
    {
        var act = () => AudioTrack.Create("رقية", "مصدر", "شفاء مضمون من كل داء", AudioTrackCategory.Dua, "k/x.mp3", "audio/mpeg", 60, Guid.NewGuid(), Policy);
        act.Should().Throw<ContentPolicyViolationException>();
    }

    [Fact]
    public void YouTube_track_may_have_unknown_duration_but_stored_audio_may_not()
    {
        var video = AudioTrack.CreateFromYouTube("تلاوة", "قناة سند", null, AudioTrackCategory.QuranRecitation, "dQw4w9WgXcQ", 0, Guid.NewGuid(), Policy);
        video.MediaKind.Should().Be(AudioTrackMediaKind.YouTube);
        video.AudioStorageKey.Should().BeNull();
        video.SourceUrl.Should().Be("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

        var stored = () => AudioTrack.Create("تلاوة", "مصدر", null, AudioTrackCategory.QuranRecitation, "k/x.mp3", "audio/mpeg", 0, Guid.NewGuid(), Policy);
        stored.Should().Throw<DomainException>();
    }

    [Theory]
    [InlineData("short")]
    [InlineData("dQw4w9WgXcQ?x")]
    [InlineData("<script>abc")]
    public void YouTube_track_rejects_invalid_video_id(string videoId)
    {
        var act = () => AudioTrack.CreateFromYouTube("تلاوة", "قناة", null, AudioTrackCategory.Dua, videoId, 0, Guid.NewGuid(), Policy);
        act.Should().Throw<DomainException>();
    }

    [Theory]
    [InlineData("http://everyayah.com/data/x/001001.mp3")]
    [InlineData("javascript:alert(1)")]
    public void Track_source_url_must_be_https(string url)
    {
        var act = () => AudioTrack.Create("تلاوة", "مصدر", null, AudioTrackCategory.Dua, "k/x.mp3", "audio/mpeg", 60, Guid.NewGuid(), Policy, url);
        act.Should().Throw<DomainException>();
    }
}

/// <summary>SKILL.md البند 2 و7: لا تصنيف لحالة المستفيد، ولا أي كيان مالي — فحص بنيوي على كامل طبقة Domain.</summary>
public class ArchitecturalGuardrailTests
{
    private static readonly string[] ForbiddenFragments =
    [
        "محسود", "ممسوس", "مسحور", "Diagnos", "Possess", "Envied", "Bewitch", "Treatment", "Cure", "Payment", "Subscription", "Price", "FinanceOfficer",
    ];

    [Fact]
    public void Domain_has_no_classification_diagnosis_or_financial_concepts()
    {
        var assembly = typeof(BaseEntity).Assembly;
        var names = assembly.GetTypes().SelectMany(t => new[] { t.Name }
            .Concat(t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static).Select(p => p.Name))
            .Concat(t.IsEnum ? Enum.GetNames(t) : [])).ToList();

        foreach (var fragment in ForbiddenFragments)
            names.Should().NotContain(n => n.Contains(fragment, StringComparison.OrdinalIgnoreCase), $"«{fragment}» ممنوع في Domain");
    }

    [Fact]
    public void Domain_references_no_infrastructure_assembly()
    {
        var refs = typeof(BaseEntity).Assembly.GetReferencedAssemblies().Select(a => a.Name!).ToList();
        refs.Should().NotContain(r => r.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) ||
                                      r.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) ||
                                      r.StartsWith("Sanad.", StringComparison.Ordinal));
    }
}
