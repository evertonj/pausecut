using PauseCut.Core;
using PauseCut.Services;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;

var builder = WebApplication.CreateBuilder(args);
// Console logging works in the terminal, Docker and the hidden desktop host without
// requiring permission to create a Windows Event Log source.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options => options.SingleLine = true);
if (string.IsNullOrEmpty(builder.Configuration["urls"])) builder.WebHost.UseUrls("http://localhost:5080");
var configuredMaxUpload = builder.Configuration.GetValue<long>("Video:MaxUploadBytes", 0);
long? maxUpload = configuredMaxUpload > 0 ? configuredMaxUpload : null;
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxUpload);
builder.Services.AddSingleton<JobStore>();
builder.Services.AddSingleton<MediaTools>();
builder.Services.AddHostedService<JobCleanup>();
builder.Services.AddHostedService<VideoWorker>();
var trustedProxy = builder.Configuration["Deployment:TrustedProxy"];
if (!string.IsNullOrWhiteSpace(trustedProxy))
{
    var proxyAddress = IPAddress.Parse(trustedProxy);
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownProxies.Add(proxyAddress);
        options.ForwardLimit = 1;
    });
}
var app = builder.Build();
if (!string.IsNullOrWhiteSpace(trustedProxy)) app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    // Forwarded scheme is accepted only from the explicitly configured proxy.
    // Reject browser mutations from other origins, including on an HTTPS site.
    var origin = context.Request.Headers.Origin.ToString();
    if (context.Request.Method != "GET" && origin.Length > 0 && origin != $"{context.Request.Scheme}://{context.Request.Host}")
    {
        context.Response.StatusCode = 403;
        return;
    }
    try { await next(); }
    catch (BadHttpRequestException ex) { context.Response.StatusCode = ex.StatusCode; await context.Response.WriteAsJsonAsync(new { error = "Arquivo maior que o limite permitido ou requisição inválida." }); }
    catch (ArgumentException ex) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = ex.Message }); }
});
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", async (MediaTools tools, CancellationToken ct) =>
{
    var processingLocation = builder.Configuration["Video:ProcessingLocation"] ?? "local";
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
    timeout.CancelAfter(TimeSpan.FromSeconds(10));
    try
    {
        await tools.CheckAsync(timeout.Token);
        return Results.Ok(new
        {
            ready = true,
            maxUploadBytes = maxUpload,
            processingLocation,
            cpuThreads = Environment.ProcessorCount,
            videoEncoder = await tools.GetEncoderLabelAsync(timeout.Token)
        });
    }
    catch (Exception ex) { return Results.Ok(new { ready = false, error = ex is OperationCanceledException ? "FFmpeg demorou para responder." : ex.Message, maxUploadBytes = maxUpload, processingLocation }); }
});

app.MapPost("/api/jobs", async (HttpRequest request, JobStore store, CancellationToken ct) =>
{
    var name = Path.GetFileName(request.Query["filename"].ToString().Replace('\\', '/'));
    if (string.IsNullOrWhiteSpace(name) || name.Length > 200 || !name.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase))
        return Results.BadRequest(new { error = "Selecione um arquivo .mp4." });
    if (request.ContentLength is null or <= 0)
        return Results.BadRequest(new { error = "Envie um arquivo MP4 não vazio com tamanho conhecido." });
    if (maxUpload is long uploadLimit && request.ContentLength > uploadLimit)
        return Results.BadRequest(new { error = $"Envie um arquivo de até {uploadLimit / 1024 / 1024} MB." });
    var job = store.Create(name);
    try
    {
        await using (var target = new FileStream(job.Input, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1024 * 1024, true))
        {
            var buffer = new byte[1024 * 1024];
            long total = 0;
            int read;
            while ((read = await request.Body.ReadAsync(buffer, ct)) > 0)
            {
                total += read;
                if (maxUpload is long streamLimit && total > streamLimit) throw new ArgumentException("Arquivo maior que o limite de upload.");
                await target.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            if (total == 0) throw new ArgumentException("O arquivo está vazio.");
        }
        lock (job.Gate) job.Status = "uploaded";
        return Results.Ok(job.Snapshot());
    }
    catch { store.Remove(job); throw; }
});

app.MapGet("/api/jobs", (JobStore store) => Results.Ok(store.Jobs.Values.OrderByDescending(j => j.Touched).Select(j => j.Snapshot())));
app.MapGet("/api/jobs/{id:guid}", (Guid id, JobStore store) => store.Jobs.TryGetValue(id, out var job) ? Results.Ok(job.Snapshot()) : Results.NotFound());
app.MapPost("/api/jobs/{id:guid}/analyze", (Guid id, CutSettings settings, JobStore store) =>
{
    settings.Validate();
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    return store.Enqueue(job, false, settings) ? Results.Accepted() : Results.Conflict(new { error = "Vídeo ocupado ou fila cheia." });
});
app.MapPost("/api/jobs/{id:guid}/export", (Guid id, JobStore store) =>
{
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    return store.Enqueue(job, true) ? Results.Accepted() : Results.Conflict(new { error = "Faça uma análise válida antes de exportar. A fila também pode estar cheia." });
});
app.MapPost("/api/jobs/{id:guid}/cancel", (Guid id, JobStore store) =>
{
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    lock (job.Gate) { if (job.Busy) job.Cancellation.Cancel(); }
    return Results.Ok();
});
app.MapDelete("/api/jobs/{id:guid}", (Guid id, JobStore store) =>
{
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    lock (job.Gate)
    {
        if (job.Busy) return Results.Conflict(new { error = "Cancele e aguarde o processamento antes de excluir." });
        try { store.Remove(job); }
        catch (IOException) { return Results.Conflict(new { error = "O vídeo está sendo lido. Feche a prévia e tente novamente." }); }
    }
    return Results.NoContent();
});
app.MapGet("/api/jobs/{id:guid}/video/{kind}", (Guid id, string kind, JobStore store) =>
{
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    lock (job.Gate)
    {
        if (kind is not ("original" or "output") || job.Status == "uploading" || (kind == "output" && job.Status != "completed")) return Results.NotFound();
        job.Touched = DateTimeOffset.UtcNow;
        var path = kind == "original" ? job.Input : Path.Combine(job.Folder, "output.mp4");
        return Results.File(File.OpenRead(path), "video/mp4", enableRangeProcessing: true);
    }
});
app.MapGet("/api/jobs/{id:guid}/download", (Guid id, JobStore store) =>
{
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    lock (job.Gate)
    {
        if (job.Status != "completed") return Results.NotFound();
        job.Touched = DateTimeOffset.UtcNow;
        return Results.File(File.OpenRead(Path.Combine(job.Folder, "output.mp4")), "video/mp4", "video-sem-pausas.mp4", enableRangeProcessing: true);
    }
});
app.MapGet("/api/jobs/{id:guid}/cuts", (Guid id, JobStore store) =>
{
    if (!store.Jobs.TryGetValue(id, out var job)) return Results.NotFound();
    lock (job.Gate) return job.Plan is null ? Results.NotFound() : Results.Json(new { job.Name, job.Settings, job.Info, job.Plan });
});
app.Run();
