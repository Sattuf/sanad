using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Sanad.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Sanad.Api.IntegrationTests;

/// <summary>
/// اختبارات PostgreSQL الحقيقي: Testcontainers حيث يتوفر Docker (SANAD_TEST_POSTGRES=1 في CI)،
/// أو خادم قائم بلا Docker عبر SANAD_TEST_PG_CONNECTION (تُنشأ قاعدة مؤقتة لكل اختبار وتُحذف بعده).
/// </summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("SANAD_TEST_POSTGRES") != "1" && PostgresTestDatabase.ExistingServer is null)
            Skip = "PostgreSQL غير مفعّل (SANAD_TEST_POSTGRES=1 مع Docker، أو SANAD_TEST_PG_CONNECTION).";
    }
}

public sealed class PostgresTestDatabase : IAsyncDisposable
{
    public static string? ExistingServer => Environment.GetEnvironmentVariable("SANAD_TEST_PG_CONNECTION") is { Length: > 0 } c ? c : null;

    private readonly PostgreSqlContainer? _container;
    private readonly string? _databaseName;

    private PostgresTestDatabase(string connectionString, PostgreSqlContainer? container, string? databaseName)
    {
        ConnectionString = connectionString;
        _container = container;
        _databaseName = databaseName;
    }

    public string ConnectionString { get; }

    public static async Task<PostgresTestDatabase> CreateAsync()
    {
        if (ExistingServer is { } server)
        {
            var name = $"sanad_test_{Guid.NewGuid():N}";
            await using (var admin = new NpgsqlConnection(server))
            {
                await admin.OpenAsync();
                await using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", admin);
                await create.ExecuteNonQueryAsync();
            }
            return new PostgresTestDatabase(new NpgsqlConnectionStringBuilder(server) { Database = name }.ConnectionString, null, name);
        }
        var container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
        await container.StartAsync();
        return new PostgresTestDatabase(container.GetConnectionString(), container, null);
    }

    public async ValueTask DisposeAsync()
    {
        if (_container is not null) await _container.DisposeAsync();
        if (_databaseName is not null && ExistingServer is { } server)
        {
            NpgsqlConnection.ClearAllPools();
            await using var admin = new NpgsqlConnection(server);
            await admin.OpenAsync();
            await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }
}

public sealed class PostgresMigrationTests
{
    [PostgresFact]
    public async Task Migrations_apply_cleanly_on_postgres_16()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();

        var options = new DbContextOptionsBuilder<SanadDbContext>().UseNpgsql(database.ConnectionString).Options;
        await using var db = new SanadDbContext(options);
        await db.Database.MigrateAsync();

        (await db.Database.GetPendingMigrationsAsync()).Should().BeEmpty();
        (await db.ProviderProfiles.CountAsync()).Should().Be(0);
    }
}
