using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using PauseCut.Core;

namespace PauseCut.Services;

public record MediaInfo(double Duration, double Fps, string FrameRate, double VideoStart);

public sealed class MediaTools(IConfiguration config, ILogger<MediaTools> logger)
{
    private sealed record EncoderProfile(string Codec, string Label, bool Hardware, string[] Arguments);
    private string Ffmpeg => config["Video:FfmpegPath"] ?? "ffmpeg";
    private string Ffprobe => config["Video:FfprobePath"] ?? "ffprobe";
    private readonly SemaphoreSlim encoderGate = new(1, 1);
    private EncoderProfile? selectedEncoder;
    private int ThreadCount => Math.Max(1, Environment.ProcessorCount);
    private static string Number(double n) => n.ToString("0.#########", CultureInfo.InvariantCulture);

    private EncoderProfile CpuEncoder => new("libx264", $"CPU nativa · {ThreadCount} threads", false,
        ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", ThreadCount.ToString(CultureInfo.InvariantCulture)]);

    private static readonly EncoderProfile[] HardwareEncoders =
    [
        new("h264_nvenc", "GPU NVIDIA · NVENC", true,
            ["-c:v", "h264_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr", "-cq", "20", "-b:v", "0", "-pix_fmt", "yuv420p"]),
        new("h264_qsv", "GPU Intel · Quick Sync", true,
            ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "20", "-pix_fmt", "nv12"]),
        new("h264_amf", "GPU AMD · AMF", true,
            ["-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20", "-qp_b", "22", "-pix_fmt", "nv12"])
    ];

    public async Task CheckAsync(CancellationToken ct)
    {
        await RunAsync(Ffmpeg, ["-version"], ct);
        await RunAsync(Ffprobe, ["-version"], ct);
        await GetEncoderAsync(ct);
    }

    public async Task<string> GetEncoderLabelAsync(CancellationToken ct) => (await GetEncoderAsync(ct)).Label;

    private async Task<EncoderProfile> GetEncoderAsync(CancellationToken ct)
    {
        if (selectedEncoder is not null) return selectedEncoder;
        await encoderGate.WaitAsync(ct);
        try
        {
            if (selectedEncoder is not null) return selectedEncoder;
            var preference = (config["Video:Encoder"] ?? "auto").Trim().ToLowerInvariant();
            if (preference is "cpu" or "libx264") return selectedEncoder = CpuEncoder;
            var candidates = preference switch
            {
                "nvidia" or "nvenc" or "h264_nvenc" => HardwareEncoders.Where(e => e.Codec == "h264_nvenc"),
                "intel" or "qsv" or "h264_qsv" => HardwareEncoders.Where(e => e.Codec == "h264_qsv"),
                "amd" or "amf" or "h264_amf" => HardwareEncoders.Where(e => e.Codec == "h264_amf"),
                _ => HardwareEncoders.AsEnumerable()
            };
            foreach (var candidate in candidates)
            {
                try
                {
                    var arguments = new List<string>
                    {
                        "-hide_banner", "-nostdin", "-f", "lavfi", "-i", "color=c=black:s=128x72:r=30:d=0.2", "-an"
                    };
                    arguments.AddRange(candidate.Arguments);
                    arguments.AddRange(["-frames:v", "2", "-f", "null", "-"]);
                    await RunAsync(Ffmpeg, arguments, ct, logFailure: false);
                    logger.LogInformation("Selected video encoder {Encoder}", candidate.Label);
                    return selectedEncoder = candidate;
                }
                catch (InvalidOperationException)
                {
                    logger.LogInformation("Video encoder {Encoder} is unavailable; trying the next option", candidate.Codec);
                }
            }
            logger.LogInformation("Using native CPU encoder with {Threads} logical processors", ThreadCount);
            return selectedEncoder = CpuEncoder;
        }
        finally { encoderGate.Release(); }
    }

    public async Task<MediaInfo> ProbeAsync(string path, CancellationToken ct)
    {
        var result = await RunAsync(Ffprobe,
            ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], ct);
        using var document = JsonDocument.Parse(result.Output);
        var streams = document.RootElement.GetProperty("streams").EnumerateArray().ToArray();
        var video = streams.FirstOrDefault(s => s.GetProperty("codec_type").GetString() == "video"
            && (!s.TryGetProperty("disposition", out var d) || !d.TryGetProperty("attached_pic", out var a) || a.GetInt32() == 0));
        if (video.ValueKind == JsonValueKind.Undefined) throw new ArgumentException("O arquivo não contém vídeo.");
        if (!streams.Any(s => s.GetProperty("codec_type").GetString() == "audio"))
            throw new ArgumentException("O vídeo não contém uma faixa de áudio.");
        var duration = ReadDouble(video, "duration");
        if (duration <= 0) duration = ReadDouble(document.RootElement.GetProperty("format"), "duration");
        if (duration <= 0 || !double.IsFinite(duration)) throw new ArgumentException("Não foi possível ler a duração do vídeo.");
        var rate = video.GetProperty("avg_frame_rate").GetString() ?? "30/1";
        var parts = rate.Split('/');
        var fps = parts.Length == 2 && double.TryParse(parts[0], CultureInfo.InvariantCulture, out var num)
            && double.TryParse(parts[1], CultureInfo.InvariantCulture, out var den) && den > 0 ? num / den : 30;
        if (!double.IsFinite(fps) || fps < 1 || fps > 120) { fps = 30; rate = "30/1"; }
        return new(duration, fps, rate, ReadDouble(video, "start_time"));
    }

    private static double ReadDouble(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && double.TryParse(value.ToString(), CultureInfo.InvariantCulture, out var n) ? n : 0;

    public async Task<IReadOnlyList<Interval>> DetectAsync(string input, MediaInfo info, CutSettings settings,
        Action<double> progress, CancellationToken ct)
    {
        var silences = new List<Interval>();
        double? start = null;
        var regex = new Regex(@"silence_(start|end):\s*(-?\d+(?:\.\d+)?)", RegexOptions.CultureInvariant);
        // Give audio the same origin as the video, filling delayed audio with silence.
        var filter = $"asetpts=PTS-({Number(info.VideoStart)})/TB,aresample=48000:async=1:first_pts=0,apad,atrim=duration={Number(info.Duration)},silencedetect=noise={Number(settings.ThresholdDb)}dB:d={Number(settings.MinSilenceMs / 1000d)}";
        await RunAsync(Ffmpeg, ["-hide_banner", "-nostdin", "-copyts", "-i", input, "-map", "0:a:0", "-af", filter,
            "-vn", "-progress", "pipe:1", "-nostats", "-f", "null", "-"], ct,
            line =>
            {
                foreach (Match match in regex.Matches(line))
                {
                    var time = double.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
                    if (match.Groups[1].Value == "start") start = time;
                    else if (start.HasValue) { silences.Add(new(start.Value, time)); start = null; }
                }
            }, line => ReadProgress(line, info.Duration, progress));
        if (start.HasValue) silences.Add(new(start.Value, info.Duration));
        return silences;
    }

    public async Task RenderAsync(string input, string folder, MediaInfo info, CutPlan plan,
        Action<double> progress, CancellationToken ct)
    {
        if (plan.Kept.Count == 0) throw new ArgumentException("Todo o vídeo foi identificado como silêncio. Ajuste o limite de volume.");
        var encoder = await GetEncoderAsync(ct);
        var batches = plan.Kept.Chunk(24).ToArray();
        var paths = new List<string>();
        double completed = 0;
        try
        {
            for (var batchIndex = 0; batchIndex < batches.Length; batchIndex++)
            {
                var batch = batches[batchIndex];
                // Seek near the batch; normalize timestamps relative to the source timeline.
                var origin = batch[0].Start;
                var length = batch[^1].End - origin;
                var graph = new StringBuilder();
                graph.Append($"[0:v:0]setpts=PTS-({Number(info.VideoStart + origin)})/TB,fps={info.FrameRate}:start_time=0,split={batch.Length}");
                for (var i = 0; i < batch.Length; i++) graph.Append($"[v{i}]");
                graph.Append(';');
                graph.Append($"[0:a:0]asetpts=PTS-({Number(info.VideoStart + origin)})/TB,aresample=48000:async=1:first_pts=0,apad,atrim=duration={Number(length)},asplit={batch.Length}");
                for (var i = 0; i < batch.Length; i++) graph.Append($"[a{i}]");
                graph.Append(';');
                for (var i = 0; i < batch.Length; i++)
                {
                    var s = Number(batch[i].Start - origin);
                    var e = Number(batch[i].End - origin);
                    graph.Append($"[v{i}]trim=start={s}:end={e},setpts=PTS-STARTPTS[vout{i}];");
                    graph.Append($"[a{i}]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[aout{i}];");
                }
                for (var i = 0; i < batch.Length; i++) graph.Append($"[vout{i}][aout{i}]");
                graph.Append($"concat=n={batch.Length}:v=1:a=1[v][a]");
                var script = Path.Combine(folder, "filters.txt");
                await File.WriteAllTextAsync(script, graph.ToString(), ct);
                var path = Path.Combine(folder, $"batch-{batchIndex:D5}.mkv");
                paths.Add(path);
                var batchDuration = batch.Sum(s => s.Duration);
                var completedBefore = completed;
                async Task EncodeBatchAsync(EncoderProfile activeEncoder)
                {
                    var arguments = new List<string>
                    {
                        "-hide_banner", "-nostdin", "-y", "-threads", ThreadCount.ToString(CultureInfo.InvariantCulture),
                        "-filter_complex_threads", ThreadCount.ToString(CultureInfo.InvariantCulture),
                        "-copyts", "-seek_timestamp", "1", "-ss", Number(info.VideoStart + origin), "-i", input,
                        "-t", Number(length), "-filter_complex", graph.ToString(), "-map", "[v]", "-map", "[a]"
                    };
                    arguments.AddRange(activeEncoder.Arguments);
                    arguments.AddRange(["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", "-progress", "pipe:1", "-nostats", path]);
                    await RunAsync(Ffmpeg, arguments, ct,
                        onOutput: line => ReadProgress(line, batchDuration, p => progress(.9 * (completedBefore + p * batchDuration) / plan.OutputDuration)));
                }
                try { await EncodeBatchAsync(encoder); }
                catch (InvalidOperationException) when (encoder.Hardware)
                {
                    logger.LogWarning("Hardware encoder {Encoder} failed during export. Retrying with native CPU encoding", encoder.Codec);
                    if (File.Exists(path)) File.Delete(path);
                    encoder = CpuEncoder;
                    selectedEncoder = encoder;
                    await EncodeBatchAsync(encoder);
                }
                completed += batchDuration;
            }
            // PCM intermediates avoid inserting AAC encoder padding at every speech cut.
            var list = Path.Combine(folder, "concat.txt");
            await File.WriteAllLinesAsync(list, paths.Select(p => $"file '{Path.GetFileName(p)}'"), ct);
            await RunAsync(Ffmpeg, ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "1", "-i", list,
                "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", Path.Combine(folder, "output.mp4")], ct,
                onOutput: line => ReadProgress(line, plan.OutputDuration, p => progress(.9 + .1 * p)));
        }
        finally
        {
            foreach (var path in paths) if (File.Exists(path)) File.Delete(path);
        }
    }

    private static void ReadProgress(string line, double duration, Action<double> progress)
    {
        if (line.StartsWith("out_time_us=") && long.TryParse(line.AsSpan(12), out var microseconds))
            progress(Math.Clamp(microseconds / 1_000_000d / duration, 0, 1));
    }

    private async Task<(string Output, string Error)> RunAsync(string binary, IEnumerable<string> args,
        CancellationToken ct, Action<string>? onError = null, Action<string>? onOutput = null, bool logFailure = true)
    {
        var start = new ProcessStartInfo(binary) { UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        foreach (var arg in args) start.ArgumentList.Add(arg);
        using var process = new Process { StartInfo = start };
        try { process.Start(); }
        catch (System.ComponentModel.Win32Exception)
        {
            throw new InvalidOperationException("FFmpeg/FFprobe não encontrado. Instale os dois e configure os caminhos em appsettings.json.");
        }
        using var registration = ct.Register(() => { try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } });
        var output = new StringBuilder();
        var error = new StringBuilder();
        async Task ReadAsync(StreamReader reader, StringBuilder buffer, Action<string>? callback)
        {
            while (await reader.ReadLineAsync(ct) is { } line)
            {
                callback?.Invoke(line);
                if (buffer.Length > 65_536) buffer.Remove(0, 32_768);
                buffer.AppendLine(line);
            }
        }
        await Task.WhenAll(ReadAsync(process.StandardOutput, output, onOutput), ReadAsync(process.StandardError, error, onError), process.WaitForExitAsync(ct));
        ct.ThrowIfCancellationRequested();
        if (process.ExitCode != 0)
        {
            if (logFailure) logger.LogWarning("Media tool exited {Code}: {Error}", process.ExitCode, error.ToString());
            throw new InvalidOperationException("Não foi possível processar o vídeo. Confira se o MP4 está íntegro e se o FFmpeg possui o encoder libx264. Detalhes no terminal.");
        }
        return (output.ToString(), error.ToString());
    }
}
