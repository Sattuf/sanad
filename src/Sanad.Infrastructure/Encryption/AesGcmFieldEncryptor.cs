using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Sanad.Domain.Common;

namespace Sanad.Infrastructure.Encryption;

public sealed class FieldEncryptionOptions
{
    public const string Section = "Encryption";

    /// <summary>مفتاح واحد 32 بايت Base64 (الإعداد البسيط) — يُعامَل كمفتاح بمعرّف "k1".</summary>
    public string? FieldKeyBase64 { get; set; }

    /// <summary>حلقة مفاتيح للدوران الدوري: معرّف ← مفتاح Base64. التشفير بالمفتاح النشط، وفك التشفير بأي مفتاح في الحلقة.</summary>
    public Dictionary<string, string> Keys { get; set; } = new();

    public string? ActiveKeyId { get; set; }
}

/// <summary>
/// تشفير الحقول الحساسة بـ AES-256-GCM (مصادَق: يكشف أي عبث بالنص المشفّر)، مع Nonce عشوائي لكل قيمة.
/// الصيغة: v1.{keyId}.{base64(nonce|tag|ciphertext)} — الـ Nonce ملحق بالقيمة نفسها لا في عمود منفصل.
/// المفتاح منفصل تماماً عن مفتاح توقيع JWT (ADR-0004).
/// </summary>
public sealed class AesGcmFieldEncryptor : IFieldEncryptor
{
    private const string Version = "v1";
    private const int NonceSize = 12;
    private const int TagSize = 16;

    private readonly Dictionary<string, byte[]> _keys;
    private readonly string _activeKeyId;

    public AesGcmFieldEncryptor(IOptions<FieldEncryptionOptions> options)
    {
        var o = options.Value;
        _keys = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        if (!string.IsNullOrWhiteSpace(o.FieldKeyBase64)) _keys["k1"] = DecodeKey(o.FieldKeyBase64, "k1");
        foreach (var (id, value) in o.Keys)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Contains('.', StringComparison.Ordinal))
                throw new InvalidOperationException("معرّف مفتاح التشفير غير صالح.");
            _keys[id] = DecodeKey(value, id);
        }
        if (_keys.Count == 0)
            throw new InvalidOperationException("مفتاح تشفير الحقول الحساسة غير مُعدّ (Encryption:FieldKeyBase64). لا تشغيل بلا تشفير.");
        _activeKeyId = o.ActiveKeyId ?? (_keys.ContainsKey("k1") && o.Keys.Count == 0 ? "k1" : _keys.Keys.Last());
        if (!_keys.ContainsKey(_activeKeyId)) throw new InvalidOperationException("المفتاح النشط غير موجود في حلقة المفاتيح.");
    }

    public string Encrypt(string plainText)
    {
        ArgumentNullException.ThrowIfNull(plainText);
        var plain = Encoding.UTF8.GetBytes(plainText);
        var payload = new byte[NonceSize + TagSize + plain.Length];
        var nonce = payload.AsSpan(0, NonceSize);
        var tag = payload.AsSpan(NonceSize, TagSize);
        var cipher = payload.AsSpan(NonceSize + TagSize);
        RandomNumberGenerator.Fill(nonce);

        using var aes = new AesGcm(_keys[_activeKeyId], TagSize);
        aes.Encrypt(nonce, plain, cipher, tag, AssociatedData(_activeKeyId));
        CryptographicOperations.ZeroMemory(plain);
        return $"{Version}.{_activeKeyId}.{Convert.ToBase64String(payload)}";
    }

    public string Decrypt(string cipherText)
    {
        ArgumentNullException.ThrowIfNull(cipherText);
        var parts = cipherText.Split('.', 3);
        if (parts.Length != 3 || parts[0] != Version || !_keys.TryGetValue(parts[1], out var key))
            throw new CryptographicException("صيغة نص مشفّر غير معروفة أو مفتاح غير متاح.");

        var payload = Convert.FromBase64String(parts[2]);
        if (payload.Length < NonceSize + TagSize) throw new CryptographicException("نص مشفّر تالف.");
        var plain = new byte[payload.Length - NonceSize - TagSize];
        using var aes = new AesGcm(key, TagSize);
        aes.Decrypt(payload.AsSpan(0, NonceSize), payload.AsSpan(NonceSize + TagSize), payload.AsSpan(NonceSize, TagSize), plain, AssociatedData(parts[1]));
        return Encoding.UTF8.GetString(plain);
    }

    private static byte[] AssociatedData(string keyId) => Encoding.ASCII.GetBytes($"sanad-field|{Version}|{keyId}");

    private static byte[] DecodeKey(string base64, string id)
    {
        byte[] key;
        try { key = Convert.FromBase64String(base64); }
        catch (FormatException) { throw new InvalidOperationException($"مفتاح التشفير {id} ليس Base64 صالحاً."); }
        if (key.Length != 32) throw new InvalidOperationException($"مفتاح التشفير {id} يجب أن يكون 32 بايت (AES-256).");
        return key;
    }
}
