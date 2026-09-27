namespace Sanad.Domain.Common;

/// <summary>
/// تشفير الحقول الحساسة (ملاحظة المستفيد، ملاحظة المختص، التوصية، الرسائل، وصف البلاغ).
/// مفتاحه منفصل تماماً عن مفتاح توقيع JWT.
/// </summary>
public interface IFieldEncryptor
{
    string Encrypt(string plainText);
    string Decrypt(string cipherText);
}
