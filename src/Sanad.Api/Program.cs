using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Azure.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Sanad.Api;
using Sanad.Api.Authorization;
using Sanad.Api.Endpoints;
using Sanad.Api.Middleware;
using Sanad.Application;
using Sanad.Infrastructure;
using Sanad.Infrastructure.Identity;
using Sanad.Infrastructure.RateLimiting;
using Sanad.Infrastructure.Realtime;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// ── الأسرار: user-secrets محلياً، Key Vault في الإنتاج (إن أُعدّ) ─────────────────
if (builder.Configuration["KeyVault:Uri"] is { Length: > 0 } vaultUri)
    builder.Configuration.AddAzureKeyVault(new Uri(vaultUri), new DefaultAzureCredential());

builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    // الكتابة إلى الطرفية متزامنة وتحجز خيط الطلب: تحت 100 مستخدم متزامن رفعت p95 من 72 إلى 380 ms (tests/load)
    .WriteTo.Async(a => a.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] ({CorrelationId}) {SourceContext}: {Message:lj}{NewLine}{Exception}")));

StartupGuards.Validate(builder.Configuration, builder.Environment);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});
// traceId في جسم الخطأ = معرّف الترابط في الرأس وفي كل سطر سجل (الافتراضي معرّف Activity المختلف عنهما)
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = c => c.ProblemDetails.Extensions["traceId"] = c.HttpContext.TraceIdentifier);
builder.Services.AddExceptionHandler<SanadExceptionHandler>();

// ── المصادقة: JWT لكل الـ API + جوجل كمزود خارجي (إن أُعدّ) ────────────────────
var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
var auth = builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = jwt.GetSigningKey(),
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = JwtRegisteredClaimNames.Sub,
            RoleClaimType = SanadClaims.Role,
        };
        o.Events = new JwtBearerEvents
        {
            // SignalR يمرر الرمز في الاستعلام لأن WebSocket لا يدعم الترويسات
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs")) ctx.Token = token;
                return Task.CompletedTask;
            },
            // قائمة الإبطال: jti مُبطَل، أو رمز صادر قبل إبطال شامل لجلسات المستخدم
            OnTokenValidated = async ctx =>
            {
                var store = ctx.HttpContext.RequestServices.GetRequiredService<TokenRevocationStore>();
                var principal = ctx.Principal!;
                var sub = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
                var jti = principal.FindFirstValue(JwtRegisteredClaimNames.Jti);
                _ = long.TryParse(principal.FindFirstValue(SanadClaims.IssuedAtMs), out var iatMs);
                if (!Guid.TryParse(sub, out var userId) || await store.IsRevokedAsync(jti, userId, iatMs, ctx.HttpContext.RequestAborted))
                    ctx.Fail("revoked");
                else
                    ((ClaimsIdentity)principal.Identity!).AddClaim(new Claim(ClaimTypes.NameIdentifier, sub!));
            },
        };
    });

if (builder.Configuration["Auth:Google:ClientId"] is { Length: > 0 } googleClientId)
{
    auth.AddCookie(AuthEndpoints.ExternalScheme, o =>
        {
            o.Cookie.Name = "sanad.external";
            o.Cookie.HttpOnly = true;
            o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            o.Cookie.SameSite = SameSiteMode.Lax;
            o.ExpireTimeSpan = TimeSpan.FromMinutes(5);
        })
        .AddGoogle(o =>
        {
            o.ClientId = googleClientId;
            o.ClientSecret = builder.Configuration["Auth:Google:ClientSecret"]!;
            o.SignInScheme = AuthEndpoints.ExternalScheme;
            o.CallbackPath = "/signin-google";
            o.ClaimActions.MapJsonKey("urn:google:email_verified", "email_verified");
        });
}

builder.Services.AddAuthorization(Policies.Register);

// ── حدود المعدل: مزدوجة (مستخدم/IP)، وصارمة على OTP — مشتركة بين النسخ عبر Redis (ADR-0020) ──
var limits = builder.Configuration.GetSection("RateLimiting");
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/problem+json";
        await ctx.HttpContext.Response.WriteAsync("{\"status\":429,\"title\":\"طلبات كثيرة جداً — حاول بعد قليل.\",\"code\":\"rate_limited\"}", ct);
    };

    static string Partition(HttpContext ctx) =>
        ctx.User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    static string Ip(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

    // الحد المُعلَن في الإعداد هو الحد الكلي لكل النسخ معاً حين يوجد Redis؛ بدونه (تطوير/نسخة واحدة) لكل نسخة
    RateLimitPartition<string> Fixed(HttpContext ctx, string subject, string name, int defaultLimit, TimeSpan window) =>
        RateLimitPartitions.FixedWindow(ctx, name, subject, limits.GetValue(name, defaultLimit), window);

    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => Fixed(ctx, Partition(ctx), "GlobalPerMinute", 300, TimeSpan.FromMinutes(1)));
    o.AddPolicy("auth", ctx => Fixed(ctx, Ip(ctx), "AuthPerMinute", 10, TimeSpan.FromMinutes(1)));
    o.AddPolicy("otp", ctx => Fixed(ctx, Ip(ctx), "OtpRequestsPerMinute", 3, TimeSpan.FromMinutes(1)));
    o.AddPolicy("otp-verify", ctx => Fixed(ctx, Ip(ctx), "OtpVerifyPerMinute", 10, TimeSpan.FromMinutes(1)));
    o.AddPolicy("share", ctx => Fixed(ctx, Partition(ctx), "ShareLinksPerHour", 30, TimeSpan.FromHours(1)));
    o.AddPolicy("uploads", ctx => Fixed(ctx, Partition(ctx), "UploadsPerHour", 20, TimeSpan.FromHours(1)));
    o.AddPolicy("messages", ctx => Fixed(ctx, Partition(ctx), "MessagesPerMinute", 30, TimeSpan.FromMinutes(1)));
    // تخمين رموز الدعوة: لكل حساب حد بالساعة على المعاينة والانضمام معاً
    o.AddPolicy("invite", ctx => Fixed(ctx, Partition(ctx), "KhatmaInvitesPerHour", 30, TimeSpan.FromHours(1)));
    o.AddPolicy("public", ctx => Fixed(ctx, Ip(ctx), "PublicPerMinute", 120, TimeSpan.FromMinutes(1)));
    o.AddPolicy("media", ctx => Fixed(ctx, Ip(ctx), "MediaPerMinute", 240, TimeSpan.FromMinutes(1)));
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Frontend:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"])
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()
    .WithExposedHeaders(CorrelationIdMiddleware.Header)));

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    o.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Sanad API",
        Version = "v1",
        Description = "سند — دليل جهات ومستشارين موثّق إدارياً، مجاني بالكامل. طبقة توثيق ووساطة وحجز وإحالة، لا تشخيص ولا علاج.",
    });
    o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
    });
    o.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }] = [],
    });
    o.CustomSchemaIds(t => t.FullName!.Replace("+", ".", StringComparison.Ordinal));
});

var app = builder.Build();

// ── ترتيب الـ Middleware — references/05-api-layer-and-security.md §5.5 ─────────
// خلف موازن أحمال موثوق فقط — وإلا يستطيع العميل تزوير IP وتجاوز حدود المعدل
if (app.Configuration.GetValue("ReverseProxy:Enabled", false)) app.UseForwardedHeaders();
// سجل الطلبات خارج معالج الاستثناءات: يرى الحالة النهائية (404/403/400) لا 500 لكل استثناء معالَج،
// ومعرّف الترابط خارجهما ليصل إلى كل سطر سجل بما فيه سطر الخطأ
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseSerilogRequestLogging(o => o.GetLevel = (ctx, _, ex) =>
    ex is not null || ctx.Response.StatusCode >= 500 ? Serilog.Events.LogEventLevel.Error : Serilog.Events.LogEventLevel.Information);
// سطر «An unhandled exception has occurred» من الإطار مكتوم في appsettings (Serilog Override):
// كان يُكتب ERROR لكل 404 و403 معالَج، والـ 500 الحقيقي يسجّله SanadExceptionHandler مع الاستثناء
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseMiddleware<SecurityHeadersMiddleware>();
// Swagger وسيط لا نقطة نهاية، فيأتي قبل التفويض: منذ .NET 10 تسري سياسة FallbackPolicy (مستخدم مسجَّل)
// على كل طلب بلا نقطة نهاية أيضاً، فكان swagger.json يُرفض بـ 401 (وفحص ZAP يعتمد عليه)
if (app.Environment.IsDevelopment())
    app.UseSwagger().UseSwaggerUI(o => o.DocumentTitle = "Sanad API");
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
    app.MapGet("/", () => Results.Redirect("/swagger")).AllowAnonymous().ExcludeFromDescription();

app.MapAuthEndpoints();
app.MapAccountEndpoints();
app.MapPublicEndpoints();
app.MapBookingEndpoints();
app.MapAdminEndpoints();
app.MapCompanionEndpoints();
app.MapHub<ChatHub>("/hubs/chat");

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") }).AllowAnonymous();

app.Run();

public partial class Program;
