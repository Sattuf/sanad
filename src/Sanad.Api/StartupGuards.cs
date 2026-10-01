namespace Sanad.Api;

/// <summary>
/// فحوصات إقلاع صارمة: خارج التطوير والاختبار لا يُسمح بتشغيل النظام بإعدادات غير آمنة.
/// </summary>
public static class StartupGuards
{
    public static void Validate(IConfiguration config, IHostEnvironment env)
    {
        var problems = new List<string>();

        if (string.IsNullOrWhiteSpace(config["Encryption:FieldKeyBase64"]) && !config.GetSection("Encryption:Keys").GetChildren().Any())
            problems.Add("Encryption:FieldKeyBase64 (مفتاح تشفير الحقول الحساسة) غير مُعدّ.");
        if (string.IsNullOrWhiteSpace(config["Auth:Jwt:SigningKeyBase64"]))
            problems.Add("Auth:Jwt:SigningKeyBase64 غير مُعدّ.");
        if (config["Encryption:FieldKeyBase64"] is { Length: > 0 } fk && fk == config["Auth:Jwt:SigningKeyBase64"])
            problems.Add("مفتاح تشفير الحقول يجب أن يكون منفصلاً تماماً عن مفتاح توقيع JWT.");

        if (!env.IsDevelopment() && !env.IsEnvironment("Testing"))
        {
            if (!config.GetValue("Captcha:Enabled", true)) problems.Add("لا يُسمح بتعطيل CAPTCHA خارج التطوير.");
            if (config.GetValue("Captcha:Enabled", true) && string.IsNullOrWhiteSpace(config["Captcha:SecretKey"]))
                problems.Add("Captcha:SecretKey غير مُعدّ.");
            if (string.Equals(config["Database:Provider"], "Sqlite", StringComparison.OrdinalIgnoreCase))
                problems.Add("SQLite للتطوير/الاختبار فقط — استخدم PostgreSQL في الإنتاج (ADR-0002).");
            if (config.GetValue("Otp:DevelopmentLogCodes", false)) problems.Add("Otp:DevelopmentLogCodes مسموح في التطوير فقط.");
            if (string.IsNullOrWhiteSpace(config["Otp:HmacKeyBase64"])) problems.Add("Otp:HmacKeyBase64 غير مُعدّ.");
            if (string.IsNullOrWhiteSpace(config["Storage:UrlSigningKeyBase64"])) problems.Add("Storage:UrlSigningKeyBase64 غير مُعدّ.");
            // التوسّع الأفقي (ADR-0020): أكثر من نسخة تحتاج Redis (Cache، Backplane لـ SignalR، إبطال الرموز، رموز الدخول
            // المؤقتة) وتخزين كائنات مشتركاً. الاستثناء الوحيد نشر بنسخة واحدة يُعلَن صراحةً.
            if (!config.GetValue("Deployment:SingleInstance", false))
            {
                if (string.IsNullOrWhiteSpace(config.GetConnectionString("Redis")))
                    problems.Add("ConnectionStrings:Redis مطلوب في الإنتاج (أو Deployment:SingleInstance=true لنشر بنسخة واحدة فقط).");
                if (!string.Equals(config["Storage:Provider"], "S3", StringComparison.OrdinalIgnoreCase))
                    problems.Add("Storage:Provider=S3 مطلوب في الإنتاج — القرص المحلي لا يُشارك بين النسخ (أو Deployment:SingleInstance=true).");
            }
            if (string.Equals(config["Storage:Provider"], "S3", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(config["Storage:S3:Bucket"])) problems.Add("Storage:S3:Bucket غير مُعدّ.");
                if (string.IsNullOrWhiteSpace(config["Storage:S3:AccessKey"]) != string.IsNullOrWhiteSpace(config["Storage:S3:SecretKey"]))
                    problems.Add("Storage:S3:AccessKey وSecretKey يُعدّان معاً أو يُتركان معاً (لاعتماد دور الخادم).");
                if (config["Storage:S3:PublicBaseUrl"] is { Length: > 0 } cdn && !cdn.StartsWith("https://", StringComparison.Ordinal))
                    problems.Add("Storage:S3:PublicBaseUrl يجب أن يكون https.");
            }
            if (config.GetValue("WebPush:Enabled", false) &&
                (string.IsNullOrWhiteSpace(config["WebPush:PublicKey"]) || string.IsNullOrWhiteSpace(config["WebPush:PrivateKey"])))
                problems.Add("WebPush:Enabled مفعّل بلا مفاتيح VAPID (WebPush:PublicKey / WebPush:PrivateKey).");
        }

        if (problems.Count > 0)
            throw new InvalidOperationException("إعدادات غير آمنة — الإقلاع مرفوض:\n- " + string.Join("\n- ", problems));
    }
}
