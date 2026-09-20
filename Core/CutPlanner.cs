namespace PauseCut.Core;

public record Interval(double Start, double End)
{
    public double Duration => End - Start;
}

public record CutSettings(double ThresholdDb = -35, int MinSilenceMs = 180, int PaddingMs = 40)
{
    public void Validate()
    {
        if (!double.IsFinite(ThresholdDb) || ThresholdDb is < -80 or > -5)
            throw new ArgumentException("O limite deve estar entre -80 e -5 dB.");
        if (MinSilenceMs is < 30 or > 5000)
            throw new ArgumentException("A pausa mínima deve estar entre 30 e 5000 ms.");
        if (PaddingMs is < 0 or > 1000)
            throw new ArgumentException("A margem deve estar entre 0 e 1000 ms.");
    }
}

public record CutPlan(double OriginalDuration, double OutputDuration,
    IReadOnlyList<Interval> Removed, IReadOnlyList<Interval> Kept)
{
    public double SavedSeconds => OriginalDuration - OutputDuration;
}

public static class CutPlanner
{
    // Round inward to frame boundaries: never remove audio outside detected silence.
    public static CutPlan Build(double duration, double fps, IEnumerable<Interval> silences, CutSettings settings)
    {
        settings.Validate();
        if (!double.IsFinite(duration) || duration <= 0 || !double.IsFinite(fps) || fps <= 0)
            throw new ArgumentException("Duração ou taxa de quadros inválida.");
        var padding = settings.PaddingMs / 1000d;
        var removed = new List<Interval>();
        foreach (var silence in silences.OrderBy(s => s.Start))
        {
            if (!double.IsFinite(silence.Start) || !double.IsFinite(silence.End)) continue;
            var start = Math.Clamp(silence.Start, 0, duration);
            var end = Math.Clamp(silence.End, 0, duration);
            if (end - start + 1e-6 < settings.MinSilenceMs / 1000d) continue;
            start = start <= 1e-6 ? 0 : Math.Ceiling((start + padding) * fps - 1e-7) / fps;
            end = end >= duration - 1e-6 ? duration : Math.Floor((end - padding) * fps + 1e-7) / fps;
            if (end - start < 1 / fps - 1e-7) continue;
            if (removed.Count > 0 && start <= removed[^1].End + 1e-7)
                removed[^1] = new(removed[^1].Start, Math.Max(removed[^1].End, end));
            else removed.Add(new(start, end));
        }
        var kept = new List<Interval>();
        double cursor = 0;
        foreach (var cut in removed)
        {
            if (cut.Start > cursor + 1e-7) kept.Add(new(cursor, cut.Start));
            cursor = cut.End;
        }
        if (duration > cursor + 1e-7) kept.Add(new(cursor, duration));
        return new(duration, kept.Sum(s => s.Duration), removed, kept);
    }
}
