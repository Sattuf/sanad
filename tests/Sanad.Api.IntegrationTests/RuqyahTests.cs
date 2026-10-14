using System.Net;
using FluentAssertions;
using Sanad.Api.IntegrationTests.Infrastructure;
using static Sanad.Api.IntegrationTests.Infrastructure.TestApi;

namespace Sanad.Api.IntegrationTests;

/// <summary>«الرقية والتحصين»: الورد اليومي في الحساب، والأدعية المكتوبة بمراجعة شرعية من شخص ثانٍ.</summary>
[Collection("api")]
public sealed class RuqyahTests(ApiFixture fixture)
{
    private readonly TestApi _api = fixture.Api;

    private static string Today => DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");

    [Fact]
    public async Task Wird_progress_is_saved_per_user_and_counts_the_streak()
    {
        var me = _api.Client(await _api.RegisterBeneficiaryAsync());
        var yesterday = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1).ToString("yyyy-MM-dd");

        (await me.PutAsync("/api/v1/me/wird", Body(new { collectionId = "sleep", day = yesterday, counts = new { s0 = 1, s1 = 1 }, completedItems = 2, totalItems = 2 })))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await me.PutAsync("/api/v1/me/wird", Body(new { collectionId = "morning-evening", day = Today, counts = new { s0 = 1, s4 = 3 }, completedItems = 2, totalItems = 10 })))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        // حفظ ثانٍ لليوم نفسه يحدّث الصف ولا يكرره
        (await me.PutAsync("/api/v1/me/wird", Body(new { collectionId = "morning-evening", day = Today, counts = new { s0 = 1, s4 = 3, s5 = 1 }, completedItems = 3, totalItems = 10 })))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        var wird = await Ok(await me.GetAsync($"/api/v1/me/wird?day={Today}"));
        var today = wird["collections"]!.AsArray().Single()!;
        today["collectionId"]!.GetValue<string>().Should().Be("morning-evening");
        today["counts"]!["s4"]!.GetValue<int>().Should().Be(3);
        today["completedItems"]!.GetValue<int>().Should().Be(3);
        wird["streak"]!.GetValue<int>().Should().Be(1, "أمس مكتمل، واليوم لم يكتمل بعد فلا يقطع السلسلة");

        var other = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await Ok(await other.GetAsync($"/api/v1/me/wird?day={Today}")))["collections"]!.AsArray().Should().BeEmpty();

        (await me.PutAsync("/api/v1/me/wird", Body(new { collectionId = "sleep", day = "2020-01-01", counts = new { s0 = 1 }, completedItems = 1, totalItems = 1 })))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await me.PutAsync("/api/v1/me/wird", Body(new { collectionId = "sleep", day = Today, counts = new { s0 = 1 }, completedItems = 5, totalItems = 1 })))
            .StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await _api.Client().GetAsync($"/api/v1/me/wird?day={Today}")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Written_dua_is_published_only_after_review_by_a_second_content_manager()
    {
        var author = _api.Client(await _api.ContentManagerAsync());
        var reviewer = _api.Client(await _api.StaffAsync("ContentManager"));
        var title = Unique("دعاء");

        var dua = await Ok(await author.PostAsync("/api/v1/admin/ruqyah/duas", Body(new
        {
            collectionId = "hamm",
            title,
            text = "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ",
            source = "رواه البخاري (6369)",
            repeat = 1,
            sortOrder = 10,
        })));
        var id = dua["id"]!.GetValue<string>();
        dua["status"]!.GetValue<string>().Should().Be("Draft");

        async Task<bool> IsPublic() => (await Ok(await _api.Client().GetAsync("/api/v1/public/ruqyah/duas")))
            .AsArray().Any(d => d!["id"]!.GetValue<string>() == id);

        (await IsPublic()).Should().BeFalse();
        (await author.PostAsync($"/api/v1/admin/ruqyah/duas/{id}/review", Body(new { action = "Approve" })))
            .StatusCode.Should().Be(HttpStatusCode.Conflict, "لا يُنشر ما لم يُرسل للمراجعة");

        await Ok(await author.PostAsync($"/api/v1/admin/ruqyah/duas/{id}/review", Body(new { action = "Submit" })));
        var self = await author.PostAsync($"/api/v1/admin/ruqyah/duas/{id}/review", Body(new { action = "Approve" }));
        self.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ReadJson(self))["code"]!.GetValue<string>().Should().Be("self_review");

        var published = await Ok(await reviewer.PostAsync($"/api/v1/admin/ruqyah/duas/{id}/review", Body(new { action = "Approve" })));
        published["status"]!.GetValue<string>().Should().Be("Published");
        (await IsPublic()).Should().BeTrue();

        // أي تعديل يعيده مسودة ويسحبه من العرض
        await Ok(await author.PutAsync($"/api/v1/admin/ruqyah/duas/{id}", Body(new
        {
            collectionId = "hamm",
            title,
            text = "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ",
            source = "رواه البخاري (6369)",
            repeat = 1,
            sortOrder = 10,
        })));
        (await IsPublic()).Should().BeFalse();
    }

    [Fact]
    public async Task Written_dua_rejects_guaranteed_cure_claims_and_is_staff_only()
    {
        var cm = _api.Client(await _api.ContentManagerAsync());
        var claim = await cm.PostAsync("/api/v1/admin/ruqyah/duas", Body(new
        {
            collectionId = "shifa",
            title = "دعاء",
            text = "نص",
            source = "مصدر",
            note = "شفاء مضمون 100%",
            repeat = 1,
            sortOrder = 0,
        }));
        claim.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var beneficiary = _api.Client(await _api.RegisterBeneficiaryAsync());
        (await beneficiary.GetAsync("/api/v1/admin/ruqyah/duas")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
