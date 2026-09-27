using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Sanad.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Sanad.Api.IntegrationTests;

/// <summary>يعمل فقط حيث يتوفر Docker (CI) — فعّله بـ SANAD_TEST_POSTGRES=1.</summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("SANAD_TEST_POSTGRES") != "1")
            Skip = "PostgreSQL/Testcontainers غير مفعّل (SANAD_TEST_POSTGRES=1 يتطلب Docker).";
    }
}

public sealed class PostgresMigrationTests
{
    [PostgresFact]
    public async Task Migrations_apply_cleanly_on_postgres_16()
    {
        await using var container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
        await container.StartAsync();

        var options = new DbContextOptionsBuilder<SanadDbContext>().UseNpgsql(container.GetConnectionString()).Options;
        await using var db = new SanadDbContext(options);
        await db.Database.MigrateAsync();

        (await db.Database.GetPendingMigrationsAsync()).Should().BeEmpty();
        (await db.ProviderProfiles.CountAsync()).Should().Be(0);
    }
}
