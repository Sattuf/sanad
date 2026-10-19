using System.Net;
using System.Net.Http.Headers;
using FluentAssertions;
using Sanad.Api.IntegrationTests.Infrastructure;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests.Security;

/// <summary>
/// الوصول إلى بيانات الغير (IDOR): مستفيد آخر ومختص آخر يحاولان قراءة كل ما يخص حجز المستفيد A أو تعديله
/// بمعرّفاته الحقيقية. المعرّف الحقيقي يجب أن يُعامَل تماماً كمعرّف غير موجود (نفس الرمز، لا نجاح) — فلا يكشف وجوده —
/// ولا تتغير الحالة، ولا يتسرب النص المشفّر. الأجسام صالحة، فيصل الطلب إلى فحص الملكية لا إلى التحقق من المدخلات فقط.
/// (الختمات والتسجيل في الخطط مغطّاة في CompanionTests.)
/// </summary>
public sealed class CrossUserAccessTests(MatrixFixture fx) : IClassFixture<MatrixFixture>
{
    private const string SecretNote = "ملاحظة سرية للمستفيد أ";
    private const string SecretMessage = "رسالة خاصة في المحادثة";

    private sealed record Victim(Session Beneficiary, TestApi.Practitioner Provider, Guid Booking, Guid Conversation, Guid Recommendation);

    private async Task<Victim> VictimAsync()
    {
        var api = fx.Api;
        var p = await api.PublishedPractitionerAsync();
        var a = await api.RegisterBeneficiaryAsync();
        var booking = await api.AcceptedBookingAsync(a, p, 0, SecretNote);
        var conv = await Ok(await api.Client(a).PostAsync($"/api/v1/bookings/{booking}/conversation", null));
        var convId = Guid.Parse(conv["id"]!.GetValue<string>());
        await Ok(await api.Client(a).PostAsync($"/api/v1/conversations/{convId}/messages", Body(new { body = SecretMessage })));
        await Ok(await api.Client(p.Session).PostAsync($"/api/v1/bookings/{booking}/recommendations", Body(new { guidanceText = "المحافظة على أذكار الصباح والمساء." })));
        var recs = await Ok(await api.Client(a).GetAsync("/api/v1/me/recommendations"));
        var rec = Guid.Parse(recs.AsArray().Single()!["id"]!.GetValue<string>());
        return new Victim(a, p, booking, convId, rec);
    }

    /// <summary>الطلب نفسه بالمعرّف الحقيقي وبمعرّف عشوائي: نفس الرمز، لا نجاح، ولا نص سري.</summary>
    private static async Task ShouldBeHidden(Func<Guid, Task<HttpResponseMessage>> call, Guid realId, string what)
    {
        using var real = await call(realId);
        using var missing = await call(Guid.NewGuid());
        var body = await real.Content.ReadAsStringAsync();
        real.IsSuccessStatusCode.Should().BeFalse($"{what} must be refused ({body})");
        real.StatusCode.Should().Be(missing.StatusCode, $"{what} must look exactly like a nonexistent id ({body})");
        body.Should().NotContain(SecretNote).And.NotContain(SecretMessage);
    }

    [Fact]
    public async Task Another_beneficiary_cannot_read_or_change_anything_of_a_booking()
    {
        var v = await VictimAsync();
        var b = fx.Api.Client(await fx.Api.RegisterBeneficiaryAsync());

        await ShouldBeHidden(id => b.GetAsync($"/api/v1/bookings/{id}"), v.Booking, "booking");
        await ShouldBeHidden(id => b.GetAsync($"/api/v1/bookings/{id}/note"), v.Booking, "beneficiary note");
        foreach (var action in new[] { "cancel", "accept", "dispute", "complete", "reject", "propose-alternative", "conversation" })
            await ShouldBeHidden(id => b.PostAsync($"/api/v1/bookings/{id}/{action}", Body(ActionBody(action, v))), v.Booking, $"booking {action}");
        await ShouldBeHidden(id => b.GetAsync($"/api/v1/bookings/{id}/recommendations"), v.Booking, "booking recommendations");

        await ShouldBeHidden(id => b.GetAsync($"/api/v1/conversations/{id}/messages"), v.Conversation, "messages");
        await ShouldBeHidden(id => b.PostAsync($"/api/v1/conversations/{id}/messages", Body(new { body = "تطفل" })), v.Conversation, "post message");
        await ShouldBeHidden(id => b.PostAsync($"/api/v1/conversations/{id}/report",
            Body(new { category = "Harassment", severity = "Medium", description = (string?)null })), v.Conversation, "report conversation");
        await ShouldBeHidden(id => b.PostAsync($"/api/v1/me/recommendations/{id}/acknowledge", null), v.Recommendation, "acknowledge recommendation");

        // ولا شيء من ذلك ظهر في قوائمه
        (await Ok(await b.GetAsync("/api/v1/me/bookings"))).AsArray().Should().BeEmpty();
        (await Ok(await b.GetAsync("/api/v1/me/conversations"))).AsArray().Should().BeEmpty();
        (await Ok(await b.GetAsync("/api/v1/me/recommendations"))).AsArray().Should().BeEmpty();

        await VictimUnchanged(v);
    }

    [Fact]
    public async Task Another_provider_cannot_reach_the_booking_or_the_first_providers_profile()
    {
        var v = await VictimAsync();
        var other = await fx.Api.PublishedPractitionerAsync();
        var p2 = fx.Api.Client(other.Session);

        await ShouldBeHidden(id => p2.GetAsync($"/api/v1/bookings/{id}"), v.Booking, "booking");
        await ShouldBeHidden(id => p2.GetAsync($"/api/v1/bookings/{id}/note"), v.Booking, "beneficiary note");
        await ShouldBeHidden(id => p2.GetAsync($"/api/v1/bookings/{id}/provider-note"), v.Booking, "case notes");
        await ShouldBeHidden(id => p2.PostAsync($"/api/v1/bookings/{id}/provider-note", Body(new { text = "ملاحظة دخيلة" })), v.Booking, "write case note");
        await ShouldBeHidden(id => p2.PostAsync($"/api/v1/bookings/{id}/recommendations", Body(new { guidanceText = "توصية دخيلة" })), v.Booking, "recommend");
        foreach (var action in new[] { "accept", "reject", "complete", "propose-alternative" })
            await ShouldBeHidden(id => p2.PostAsync($"/api/v1/bookings/{id}/{action}", Body(ActionBody(action, v))), v.Booking, $"booking {action}");
        await ShouldBeHidden(id => p2.GetAsync($"/api/v1/conversations/{id}/messages"), v.Conversation, "messages");

        // ملف المختص الأول: خدمته ومواعيده
        await ShouldBeHidden(id => p2.PutAsync($"/api/v1/me/provider-profile/offerings/{id}",
            Body(new { category = "رقية", description = "تعديل دخيل", cancellationPolicy = "لا", sessionDurationMinutes = 30 })), v.Provider.OfferingId, "edit offering");
        await ShouldBeHidden(id => p2.DeleteAsync($"/api/v1/me/provider-profile/slots/{id}"), v.Provider.SlotIds[1], "delete slot");
        var availability = await Ok(await fx.Api.Client(v.Beneficiary).GetAsync($"/api/v1/providers/{v.Provider.ProviderProfileId}/availability"));
        availability.AsArray().Select(s => s!["id"]!.GetValue<string>()).Should().Contain(v.Provider.SlotIds[1].ToString());

        await VictimUnchanged(v);
    }

    [Fact]
    public async Task A_beneficiary_cannot_upload_into_the_content_library()
    {
        var b = fx.Api.Client(await fx.Api.RegisterBeneficiaryAsync());
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]); // ترويسة ID3: ملف صوتي سليم الشكل
        file.Headers.ContentType = new MediaTypeHeaderValue("audio/mpeg");
        form.Add(file, "file", "x.mp3");
        (await b.PostAsync("/api/v1/admin/library/uploads", form)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>جسم صالح لكل فعل، فيصل الطلب إلى فحص الملكية.</summary>
    private static object ActionBody(string action, Victim v) => action switch
    {
        "reject" => new { administrativeReason = "سبب إداري" },
        "propose-alternative" => new { alternativeSlotId = v.Provider.SlotIds[2] },
        _ => new { },
    };

    /// <summary>صاحب الحجز يرى بياناته كما هي: الحالة والملاحظة والرسالة والتوصية غير مقروءة.</summary>
    private async Task VictimUnchanged(Victim v)
    {
        var a = fx.Api.Client(v.Beneficiary);
        (await Ok(await a.GetAsync($"/api/v1/bookings/{v.Booking}")))["status"]!.GetValue<string>().Should().Be("Accepted");
        (await Ok(await a.GetAsync($"/api/v1/bookings/{v.Booking}/note")))["note"]!.GetValue<string>().Should().Be(SecretNote);
        var messages = (await Ok(await a.GetAsync($"/api/v1/conversations/{v.Conversation}/messages"))).AsArray();
        messages.Select(m => m!["body"]!.GetValue<string>()).Should().Equal(SecretMessage);
        var rec = (await Ok(await a.GetAsync("/api/v1/me/recommendations"))).AsArray().Single()!;
        rec["acknowledgedAtUtc"].Should().BeNull();
        (await Ok(await fx.Api.Client(v.Provider.Session).GetAsync($"/api/v1/bookings/{v.Booking}/provider-note"))).AsArray().Should().BeEmpty();
    }
}
