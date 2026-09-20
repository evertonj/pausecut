using System.Collections.Concurrent;
using System.Threading.Channels;
using PauseCut.Core;

namespace PauseCut.Services;

public sealed class VideoJob(Guid id, string name, string folder)
{
    public readonly object Gate = new();
    public Guid Id { get; } = id;
    public string Name { get; } = name;
    public string Folder { get; } = folder;
    public string Input => Path.Combine(Folder, "input.mp4");
    public string Status { get; set; } = "uploading";
    public double Progress { get; set; }
    public string? Error { get; set; }
    public MediaInfo? Info { get; set; }
    public CutSettings? Settings { get; set; }
    public CutPlan? Plan { get; set; }
    public DateTimeOffset Touched { get; set; } = DateTimeOffset.UtcNow;
    public CancellationTokenSource Cancellation { get; set; } = new();
    public bool Busy => Status is "uploading" or "queued" or "analyzing" or "rendering";
    public object Snapshot()
    {
        lock (Gate) return new { Id, Name, Status, Progress, Error, Info, Settings, Plan };
    }
}

public sealed class JobStore(IWebHostEnvironment environment, IConfiguration config)
{
    public string Root { get; } = Path.Combine(
        config["Video:DataPath"] ?? Path.Combine(environment.ContentRootPath, "App_Data"), "jobs");
    public ConcurrentDictionary<Guid, VideoJob> Jobs { get; } = new();
    public Channel<(VideoJob Job, bool Render)> Queue { get; } = Channel.CreateBounded<(VideoJob, bool)>(
        new BoundedChannelOptions(8) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    private readonly object capacityGate = new();

    public VideoJob Create(string name)
    {
        lock (capacityGate)
        {
            if (Jobs.Count >= 20) throw new ArgumentException("O limite de 20 vídeos foi atingido. Exclua um vídeo para continuar.");
            var id = Guid.NewGuid();
            var folder = Path.Combine(Root, id.ToString("N"));
            Directory.CreateDirectory(folder);
            var job = new VideoJob(id, name, folder);
            Jobs[id] = job;
            return job;
        }
    }

    public bool Enqueue(VideoJob job, bool render, CutSettings? settings = null)
    {
        lock (job.Gate)
        {
            if (job.Busy) return false;
            if (render && (job.Status != "analyzed" || job.Plan is null || job.Plan.Kept.Count == 0)) return false;
            var previous = job.Status;
            job.Status = "queued";
            if (!Queue.Writer.TryWrite((job, render))) { job.Status = previous; return false; }
            job.Cancellation.Dispose();
            job.Cancellation = new();
            if (!render) { job.Settings = settings; job.Plan = null; }
            job.Progress = 0;
            job.Error = null;
            job.Touched = DateTimeOffset.UtcNow;
            return true;
        }
    }

    public void Remove(VideoJob job)
    {
        // Only called after processing/upload has stopped.
        Directory.Delete(job.Folder, true);
        Jobs.TryRemove(job.Id, out _);
        job.Cancellation.Dispose();
    }
}

public sealed class VideoWorker(JobStore store, MediaTools media, ILogger<VideoWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var (job, render) in store.Queue.Reader.ReadAllAsync(stoppingToken))
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(job.Cancellation.Token, stoppingToken);
            var ct = linked.Token;
            try
            {
                lock (job.Gate) job.Status = render ? "rendering" : "analyzing";
                void Progress(double value) { lock (job.Gate) job.Progress = Math.Round(value * 100, 1); }
                ct.ThrowIfCancellationRequested();
                if (render)
                {
                    await media.RenderAsync(job.Input, job.Folder, job.Info!, job.Plan!, Progress, ct);
                    lock (job.Gate) job.Status = "completed";
                }
                else
                {
                    var info = await media.ProbeAsync(job.Input, ct);
                    var silences = await media.DetectAsync(job.Input, info, job.Settings!, Progress, ct);
                    var plan = CutPlanner.Build(info.Duration, info.Fps, silences, job.Settings!);
                    if (plan.Kept.Count > 10000) throw new ArgumentException("Mais de 10.000 trechos. Aumente a duração mínima das pausas.");
                    lock (job.Gate)
                    {
                        job.Info = info;
                        job.Plan = plan;
                        job.Status = "analyzed";
                        if (plan.Kept.Count == 0) job.Error = "Todo o vídeo está abaixo do limite de volume. Diminua o limite (por exemplo, -45 dB) e analise novamente.";
                    }
                }
                lock (job.Gate) job.Progress = 100;
            }
            catch (OperationCanceledException) { lock (job.Gate) { job.Status = "cancelled"; job.Error = "Processamento cancelado."; } }
            catch (Exception ex)
            {
                logger.LogError(ex, "Video processing failed for {Id}", job.Id);
                lock (job.Gate) { job.Status = "failed"; job.Error = ex.Message; }
            }
            finally
            {
                lock (job.Gate) job.Touched = DateTimeOffset.UtcNow;
                if (job.Status != "completed")
                {
                    var partial = Path.Combine(job.Folder, "output.mp4");
                    if (File.Exists(partial)) File.Delete(partial);
                }
            }
        }
    }
}

public sealed class JobCleanup(JobStore store, IConfiguration config, ILogger<JobCleanup> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Directory.CreateDirectory(store.Root);
        // State is intentionally local and temporary; clear leftovers after a restart.
        foreach (var folder in Directory.GetDirectories(store.Root))
            if (Guid.TryParseExact(Path.GetFileName(folder), "N", out _))
                try { Directory.Delete(folder, true); } catch (IOException ex) { logger.LogWarning(ex, "Could not clean {Folder}", folder); }
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var expiry = DateTimeOffset.UtcNow.AddHours(-Math.Max(1, config.GetValue("Video:RetentionHours", 24)));
            foreach (var job in store.Jobs.Values)
                lock (job.Gate)
                    if (!job.Busy && job.Touched < expiry)
                        try { store.Remove(job); } catch (IOException ex) { logger.LogWarning(ex, "Cleanup failed for {Id}", job.Id); }
        }
    }
}
