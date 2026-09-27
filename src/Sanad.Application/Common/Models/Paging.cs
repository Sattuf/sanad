namespace Sanad.Application.Common.Models;

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public static class Paging
{
    public static (int Page, int PageSize) Normalize(int? page, int? pageSize, int max = 50) =>
        (Math.Max(1, page ?? 1), Math.Clamp(pageSize ?? 20, 1, max));
}
