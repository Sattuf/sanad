using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Sanad.Api.IntegrationTests;

/// <summary>الإقلاع في الإنتاج يُرفض بإعدادات لا تتحمل التوسّع الأفقي (ADR-0020).</summary>
public sealed class StartupGuardsTests
{
    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Sanad.Api";
        public string ContentRootPath { get; set; } = "/";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static readonly Dictionary<string, string?> SecureBase = new()
    {
        ["Encryption:FieldKeyBase64"] = "field-key",
        ["Auth:Jwt:SigningKeyBase64"] = "jwt-key",
        ["Captcha:SecretKey"] = "captcha",
        ["Database:Provider"] = "Postgres",
        ["Otp:HmacKeyBase64"] = "otp",
        ["Storage:UrlSigningKeyBase64"] = "sign",
    };

    private static Action Validate(Dictionary<string, string?> extra, string env = "Production")
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(SecureBase.Concat(extra)).Build();
        return () => StartupGuards.Validate(config, new Env(env));
    }

    [Fact]
    public void Production_requires_redis_and_object_storage()
    {
        Validate([]).Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("ConnectionStrings:Redis").And.Contain("Storage:Provider=S3");
    }

    [Fact]
    public void Production_with_redis_and_s3_starts()
    {
        Validate(new()
        {
            ["ConnectionStrings:Redis"] = "redis:6379",
            ["Storage:Provider"] = "S3",
            ["Storage:S3:Bucket"] = "sanad-media",
            ["Storage:S3:PublicBaseUrl"] = "https://media.sanad.app",
        }).Should().NotThrow();
    }

    [Fact]
    public void Single_instance_is_an_explicit_opt_out()
    {
        Validate(new() { ["Deployment:SingleInstance"] = "true" }).Should().NotThrow();
    }

    [Fact]
    public void S3_settings_are_checked()
    {
        Validate(new()
        {
            ["ConnectionStrings:Redis"] = "redis:6379",
            ["Storage:Provider"] = "S3",
            ["Storage:S3:AccessKey"] = "only-access",
            ["Storage:S3:PublicBaseUrl"] = "http://insecure",
        }).Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("Bucket").And.Contain("SecretKey").And.Contain("https");
    }

    [Fact]
    public void Development_needs_neither()
    {
        Validate([], "Development").Should().NotThrow();
    }
}
