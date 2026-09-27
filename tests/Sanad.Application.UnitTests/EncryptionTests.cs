using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.Extensions.Options;
using Sanad.Infrastructure.Encryption;

namespace Sanad.Application.UnitTests;

public class AesGcmFieldEncryptorTests
{
    private static string Key() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    private static AesGcmFieldEncryptor Create(FieldEncryptionOptions o) => new(Options.Create(o));

    [Fact]
    public void Round_trip_and_ciphertext_contains_no_plain_text()
    {
        var sut = Create(new FieldEncryptionOptions { FieldKeyBase64 = Key() });
        const string plain = "ملاحظة خاصة: أعاني من أرق شديد";
        var cipher = sut.Encrypt(plain);

        cipher.Should().NotContain("أرق").And.StartWith("v1.k1.");
        sut.Decrypt(cipher).Should().Be(plain);
    }

    [Fact]
    public void Same_plain_text_encrypts_differently_each_time()
    {
        var sut = Create(new FieldEncryptionOptions { FieldKeyBase64 = Key() });
        sut.Encrypt("نص").Should().NotBe(sut.Encrypt("نص"));
    }

    [Fact]
    public void Tampered_ciphertext_is_rejected()
    {
        var sut = Create(new FieldEncryptionOptions { FieldKeyBase64 = Key() });
        var parts = sut.Encrypt("نص حساس").Split('.');
        var bytes = Convert.FromBase64String(parts[2]);
        bytes[^1] ^= 0x01;
        var act = () => sut.Decrypt($"{parts[0]}.{parts[1]}.{Convert.ToBase64String(bytes)}");
        act.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void Rotated_key_ring_still_decrypts_old_values()
    {
        var oldKey = Key();
        var old = Create(new FieldEncryptionOptions { Keys = new() { ["2026a"] = oldKey }, ActiveKeyId = "2026a" });
        var cipher = old.Encrypt("قيمة قديمة");

        var rotated = Create(new FieldEncryptionOptions { Keys = new() { ["2026a"] = oldKey, ["2026b"] = Key() }, ActiveKeyId = "2026b" });
        rotated.Decrypt(cipher).Should().Be("قيمة قديمة");
        rotated.Encrypt("جديد").Should().StartWith("v1.2026b.");
    }

    [Fact]
    public void Missing_key_refuses_to_start()
    {
        var act = () => Create(new FieldEncryptionOptions());
        act.Should().Throw<InvalidOperationException>();
    }
}
