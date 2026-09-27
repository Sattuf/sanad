using CsvHelper;
using CsvHelper.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Sanad.Domain.Common;
using Sanad.Domain.Identity;
using Sanad.Domain.RuqyahLibrary;
using Sanad.Infrastructure.Identity;
using Sanad.Infrastructure.Persistence;
using Sanad.Infrastructure.Safety;
using Sanad.Infrastructure.Storage;
using System.Globalization;
using System.Security.Cryptography;

// ── أداة استيراد جماعي لمكتبة الرقية (Quran/Dua audio) ──────────────────────────
// تعيد استخدام نفس قواعد الأمان والمحتوى المطبَّقة في الـ API (فحص التوقيع الثنائي MP3/M4A،
// فلتر العبارات المحظورة، حد الحجم) بلا أي اختصار. تعمل مباشرة على قاعدة البيانات (بلا HTTP)،
// وتُنشئ المقاطع غير منشورة دائماً — المراجعة والنشر يدويان عبر واجهة/واجهة API الإدارية الموجودة.
// وضع المعاينة (dry-run) هو الافتراضي: لا كتابة فعلية بدون --commit.

var options = CliOptions.Parse(args);
if (options is null) return 1;

var apiDir = Path.GetFullPath(options.ApiDir);
if (!Directory.Exists(apiDir))
{
    Console.Error.WriteLine($"[خطأ] مجلد Sanad.Api غير موجود: {apiDir} (مرّر --api-dir لتحديد المسار الصحيح)");
    return 1;
}

var config = new ConfigurationBuilder()
    .SetBasePath(apiDir)
    .AddJsonFile("appsettings.json", optional: true)
    .AddJsonFile($"appsettings.{options.Environment}.json", optional: true)
    .AddEnvironmentVariables("SANAD_")
    .Build();

var connectionString = config.GetConnectionString("Sanad");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.Error.WriteLine("[خطأ] لم يُعثر على ConnectionStrings:Sanad — تأكد من --api-dir أو --environment.");
    return 1;
}
var provider = config["Database:Provider"] ?? "Postgres";
if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
{
    // "Data Source=sanad_dev.db" في appsettings يُفهم نسبياً لمجلد src/Sanad.Api عند تشغيل الـ API؛
    // نحاكي ذلك هنا كي تُقرأ/تُكتب نفس القاعدة فعلياً لا نسخة جديدة فارغة في مجلد الأداة.
    var csb = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString);
    if (!Path.IsPathRooted(csb.DataSource)) csb.DataSource = Path.Combine(apiDir, csb.DataSource);
    connectionString = csb.ConnectionString;
}
var storageOptions = new StorageOptions();
config.GetSection(StorageOptions.Section).Bind(storageOptions);
if (!Path.IsPathRooted(storageOptions.RootPath)) storageOptions.RootPath = Path.Combine(apiDir, storageOptions.RootPath);

Console.WriteLine($"قاعدة البيانات: {provider} — التخزين: {storageOptions.RootPath}");
Console.WriteLine(options.Commit ? "الوضع: تنفيذ فعلي (--commit)" : "الوضع: معاينة فقط (dry-run) — لن تُكتب أي بيانات. أضف --commit للتنفيذ الفعلي.");
Console.WriteLine();

var dbOptions = new DbContextOptionsBuilder<SanadDbContext>();
if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase)) dbOptions.UseSqlite(connectionString);
else dbOptions.UseNpgsql(connectionString);

await using var db = new SanadDbContext(dbOptions.Options);
var storage = new LocalFileStorage(Microsoft.Extensions.Options.Options.Create(storageOptions));
var inspector = new FileSignatureInspector(Microsoft.Extensions.Options.Options.Create(storageOptions));
var policy = new ContentPolicyChecker();

var createdByUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == options.CreatedByEmail);
if (createdByUser is null)
{
    Console.Error.WriteLine($"[خطأ] لا يوجد مستخدم بالبريد: {options.CreatedByEmail}");
    return 1;
}
var isContentManager = await db.UserRoles.AsNoTracking()
    .Join(db.Roles.AsNoTracking(), ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
    .AnyAsync(x => x.UserId == createdByUser.Id && x.Name == SanadRoles.ContentManager);
if (!isContentManager)
    Console.WriteLine($"[تنبيه] المستخدم {options.CreatedByEmail} ليس له دور {SanadRoles.ContentManager} حالياً — سيُسجَّل كمُنشئ على أي حال.");

if (!File.Exists(options.CsvPath))
{
    Console.Error.WriteLine($"[خطأ] ملف CSV غير موجود: {options.CsvPath}");
    return 1;
}
if (!Directory.Exists(options.FolderPath))
{
    Console.Error.WriteLine($"[خطأ] مجلد المقاطع غير موجود: {options.FolderPath}");
    return 1;
}

using var reader = new StreamReader(options.CsvPath);
using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture) { Delimiter = "," });
var rows = csv.GetRecords<ImportRow>().ToList();
Console.WriteLine($"عدد السطور في CSV: {rows.Count}");
Console.WriteLine();

var imported = 0;
var skippedDuplicate = 0;
var rejected = 0;
var reportLines = new List<string> { "FileName,Result,Reason" };

foreach (var row in rows)
{
    var label = row.FileName ?? "(بلا اسم ملف)";
    var (outcome, reason) = await ProcessRowAsync(row);
    switch (outcome)
    {
        case RowOutcome.Imported: imported++; reportLines.Add($"{label},استيراد,"); break;
        case RowOutcome.Duplicate: skippedDuplicate++; reportLines.Add($"{label},مكرر (تخطّي),{reason}"); break;
        case RowOutcome.Rejected: rejected++; reportLines.Add($"{label},رفض,{reason}"); break;
    }
}

var reportPath = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(options.CsvPath))!, $"import-report-{DateTime.Now:yyyyMMdd-HHmmss}.csv");
await File.WriteAllLinesAsync(reportPath, reportLines);

Console.WriteLine();
Console.WriteLine($"تم: {imported} — مكرر (تخطّي): {skippedDuplicate} — مرفوض: {rejected}");
Console.WriteLine($"تقرير مفصّل: {reportPath}");
if (!options.Commit)
    Console.WriteLine("هذه معاينة فقط. أعد التشغيل بإضافة --commit لتنفيذ الاستيراد فعلياً بعد التأكد من التقرير.");
else
    Console.WriteLine("كل المقاطع المستوردة غير منشورة (IsPublished = false). راجعها وانشرها يدوياً من لوحة إدارة المكتبة.");

return 0;

async Task<(RowOutcome Outcome, string? Reason)> ProcessRowAsync(ImportRow row)
{
    if (string.IsNullOrWhiteSpace(row.FileName)) return (RowOutcome.Rejected, "اسم الملف فارغ");
    var filePath = Path.Combine(options!.FolderPath, row.FileName);
    if (!File.Exists(filePath)) return (RowOutcome.Rejected, "الملف غير موجود في المجلد");

    if (!Enum.TryParse<AudioTrackCategory>(NormalizeCategory(row.Category), true, out var category))
        return (RowOutcome.Rejected, $"تصنيف غير معروف: {row.Category} (المسموح: QuranRecitation, Dua, Adhkar)");

    var bytes = await File.ReadAllBytesAsync(filePath);
    if (bytes.Length == 0) return (RowOutcome.Rejected, "الملف فارغ");

    var header = bytes.AsSpan(0, Math.Min(64, bytes.Length));
    var inspection = inspector.Inspect(Sanad.Application.Common.Interfaces.UploadKind.LibraryAudio, header, bytes.Length);
    if (!inspection.IsAllowed) return (RowOutcome.Rejected, inspection.Error ?? "نوع/حجم الملف غير مسموح");

    var sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    if (await db.StoredFiles.AsNoTracking().AnyAsync(f => f.Sha256 == sha))
        return (RowOutcome.Duplicate, "نفس بصمة الملف موجودة مسبقاً في المكتبة");

    int durationSeconds;
    try
    {
        // مدة الصوت من وسوم الملف مباشرة (بلا ffmpeg)
        durationSeconds = ReadDurationSeconds(filePath);
        _ = AudioTrack.Create(row.Title ?? "", row.SourceLabel ?? "", row.Description, category,
            "pending", inspection.NormalizedContentType!, durationSeconds, createdByUser!.Id, policy);
    }
    catch (Sanad.Domain.Exceptions.DomainException ex)
    {
        return (RowOutcome.Rejected, ex.Message);
    }

    if (!options.Commit) return (RowOutcome.Imported, null); // معاينة: "سيُستورد" بدون كتابة فعلية

    var key = $"library-audio/{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}{inspection.Extension}";
    await using (var stream = new MemoryStream(bytes)) await storage.SaveAsync(key, stream, inspection.NormalizedContentType!, CancellationToken.None);
    db.StoredFiles.Add(StoredFile.Register(createdByUser!.Id, StoredFilePurpose.LibraryAudio, key, inspection.NormalizedContentType!, bytes.Length, sha, DateTimeOffset.UtcNow));

    var finalTrack = AudioTrack.Create(row.Title ?? "", row.SourceLabel ?? "", row.Description, category,
        key, inspection.NormalizedContentType!, durationSeconds, createdByUser.Id, policy);
    db.AudioTracks.Add(finalTrack);
    await db.SaveChangesAsync();

    return (RowOutcome.Imported, null);
}

static int ReadDurationSeconds(string path)
{
    try
    {
        using var tagFile = TagLib.File.Create(path);
        var seconds = (int)Math.Round(tagFile.Properties.Duration.TotalSeconds);
        return seconds is > 0 and <= 4 * 3600 ? seconds : 1;
    }
    catch
    {
        return 1; // سيُرفض غالباً لاحقاً لو كانت المدة غير منطقية؛ لا نوقف الاستيراد بسبب فشل قراءة الوسوم فقط
    }
}

static string NormalizeCategory(string? raw)
{
    var v = (raw ?? "").Trim();
    return v switch
    {
        "تلاوة" or "قرآن" or "قرءان" => "QuranRecitation",
        "دعاء" or "أدعية" or "ادعية" => "Dua",
        "أذكار" or "اذكار" => "Adhkar",
        _ => v,
    };
}

internal enum RowOutcome { Imported, Duplicate, Rejected }

internal sealed class ImportRow
{
    public string? FileName { get; set; }
    public string? Title { get; set; }
    public string? SourceLabel { get; set; }
    public string? Description { get; set; }
    public string? Category { get; set; }
}

internal sealed class CliOptions
{
    public required string FolderPath { get; init; }
    public required string CsvPath { get; init; }
    public required string CreatedByEmail { get; init; }
    public bool Commit { get; init; }
    public string ApiDir { get; set; } = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src", "Sanad.Api");
    public string Environment { get; set; } = "Development";

    public static CliOptions? Parse(string[] args)
    {
        string? folder = null, csv = null, email = null, apiDir = null, env = null;
        var commit = false;
        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--folder": folder = args[++i]; break;
                case "--csv": csv = args[++i]; break;
                case "--created-by-email": email = args[++i]; break;
                case "--api-dir": apiDir = args[++i]; break;
                case "--environment": env = args[++i]; break;
                case "--commit": commit = true; break;
                case "--help": case "-h": PrintUsage(); return null;
                default:
                    Console.Error.WriteLine($"[خطأ] خيار غير معروف: {args[i]}");
                    PrintUsage();
                    return null;
            }
        }
        if (folder is null || csv is null || email is null)
        {
            Console.Error.WriteLine("[خطأ] --folder و --csv و --created-by-email مطلوبة.");
            PrintUsage();
            return null;
        }
        var options = new CliOptions { FolderPath = folder, CsvPath = csv, CreatedByEmail = email, Commit = commit };
        if (apiDir is not null) options.ApiDir = apiDir;
        if (env is not null) options.Environment = env;
        return options;
    }

    private static void PrintUsage()
    {
        Console.WriteLine("""
            الاستخدام:
              dotnet run --project tools/Sanad.LibraryImport -- \
                --folder <مجلد المقاطع الصوتية> \
                --csv <ملف CSV: FileName,Title,SourceLabel,Description,Category> \
                --created-by-email <بريد حساب ContentManager موجود> \
                [--commit] [--api-dir <مسار src/Sanad.Api>] [--environment Development]

            بدون --commit تعمل الأداة في وضع معاينة فقط (dry-run): تتحقق من كل شيء وتكتب تقريراً بلا أي تعديل على القاعدة أو التخزين.
            """);
    }
}
