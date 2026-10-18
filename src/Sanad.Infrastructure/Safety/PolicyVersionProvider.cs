using Microsoft.Extensions.Options;
using Sanad.Application.Common.Interfaces;

namespace Sanad.Infrastructure.Safety;

public sealed class PolicyVersionOptions
{
    public const string Section = "Policies";

    public Dictionary<string, string> Versions { get; set; } = new();
}

public sealed class PolicyVersionProvider(IOptions<PolicyVersionOptions> options) : IPolicyVersionProvider
{
    public string CurrentVersion(Domain.Consent.ConsentType type) =>
        options.Value.Versions.TryGetValue(type.ToString(), out var v) && !string.IsNullOrWhiteSpace(v) ? v : "1.0";
}
