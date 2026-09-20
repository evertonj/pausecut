using PauseCut.Core;
using PauseCut.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using System.Diagnostics;
using System.Text.Json;

var passed = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception("FAIL: " + label);
    Console.WriteLine("PASS: " + label); passed++;
}
var settings = new CutSettings(-35, 100, 40);
var plan = CutPlanner.Build(5, 30, [new(1, 1.5), new(2, 2.05), new(3, 3.2)], settings);
Check(plan.Removed.Count == 2, "Ignore silence below minimum duration");
Check(plan.Removed[0].Start >= 1.04 && plan.Removed[0].End <= 1.46, "Preserve margins around speech");
Check(Math.Abs(plan.Kept.Sum(i => i.Duration) + plan.Removed.Sum(i => i.Duration) - 5) < 1e-8, "No gaps or overlaps in cut plan");
Check(CutPlanner.Build(2, 30, [], settings).OutputDuration == 2, "No silence preserves whole video");
Check(CutPlanner.Build(2, 30, [new(0,2)], settings).Kept.Count == 0, "Entirely silent video does not produce empty export");
Check(CutPlanner.Build(2, 30, [new(0,.4), new(1.6,2)], settings).Kept.Count == 1, "Trim leading and trailing silence");
Check(CutPlanner.Build(2, 30, [new(.5,.65)], new(-35, 100, 80)).Removed.Count == 0, "Margin larger than pause protects short words");
Check(CutPlanner.Build(2, 29.97, [new(.51,1.3), new(.9,1.5)], settings).Removed.Count == 1, "Merge overlapping intervals at fractional frame rate");
try { new CutSettings(double.NaN).Validate(); throw new Exception("NaN accepted"); } catch (ArgumentException) { Check(true, "Reject invalid threshold"); }

if (args.Length >= 2)
{
    var root = Path.GetFullPath(Path.Combine("tests", "fixtures"));
    Directory.CreateDirectory(root);
    var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
        ["Video:FfmpegPath"]=Path.GetFullPath(args[0]), ["Video:FfprobePath"]=Path.GetFullPath(args[1]), ["Video:Encoder"]=args.ElementAtOrDefault(2) ?? "libx264" }).Build();
    var media = new MediaTools(config, NullLogger<MediaTools>.Instance);
    await media.CheckAsync(default);
    async Task Run(string exe, params string[] arguments)
    {
        var si = new ProcessStartInfo(exe) { UseShellExecute=false, RedirectStandardError=true, RedirectStandardOutput=true };
        foreach(var a in arguments) si.ArgumentList.Add(a);
        using var p = Process.Start(si)!;
        var err=p.StandardError.ReadToEndAsync(); var output=p.StandardOutput.ReadToEndAsync();
        await p.WaitForExitAsync(); await output;
        if(p.ExitCode!=0) throw new Exception(await err);
    }
    async Task TestMedia(string name, double duration, string audio, double fps = 30, double offset = 0)
    {
        var folder=Path.Combine(root,name); Directory.CreateDirectory(folder);
        var input=Path.Combine(folder,"input.mp4");
        var arguments=new List<string>{"-y","-f","lavfi","-i",$"testsrc2=size=320x180:rate={fps.ToString(System.Globalization.CultureInfo.InvariantCulture)}:duration={duration}","-f","lavfi","-i",audio,"-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-shortest"};
        if(offset!=0) arguments.AddRange(["-output_ts_offset",offset.ToString(System.Globalization.CultureInfo.InvariantCulture)]);
        arguments.Add(input); await Run(args[0],arguments.ToArray());
        var info=await media.ProbeAsync(input,default);
        var silences=await media.DetectAsync(input,info,settings,_=>{},default);
        var p=CutPlanner.Build(info.Duration,info.Fps,silences,settings);
        Check(p.Removed.Count>0,name+": detect silences");
        if(p.Kept.Count==0) return;
        await media.RenderAsync(input,folder,info,p,_=>{},default);
        var result=await media.ProbeAsync(Path.Combine(folder,"output.mp4"),default);
        Check(Math.Abs(result.Duration-p.OutputDuration)<Math.Max(.1, p.Kept.Count / info.Fps), name+": output duration matches plan");
        var si=new ProcessStartInfo(args[1]){UseShellExecute=false,RedirectStandardOutput=true};
        foreach(var a in new[]{"-v","error","-show_streams","-of","json",Path.Combine(folder,"output.mp4")})si.ArgumentList.Add(a);
        using var proc=Process.Start(si)!; var json=await proc.StandardOutput.ReadToEndAsync();await proc.WaitForExitAsync();
        using var doc=JsonDocument.Parse(json);var streams=doc.RootElement.GetProperty("streams").EnumerateArray().ToArray();
        var v=streams.First(s=>s.GetProperty("codec_type").GetString()=="video");var astream=streams.First(s=>s.GetProperty("codec_type").GetString()=="audio");
        double D(JsonElement e)=>double.Parse(e.GetProperty("duration").GetString()!,System.Globalization.CultureInfo.InvariantCulture);
        Check(Math.Abs(D(v)-D(astream))<.1,name+": audio/video duration stay aligned");
        await Run(args[0],"-v","error","-i",Path.Combine(folder,"output.mp4"),"-f","null","-");
        Check(true,name+": output decodes without errors");
        Console.WriteLine($"  {info.Duration:F2}s -> {result.Duration:F2}s; {p.Removed.Count} cuts");
    }
    await TestMedia("known-pauses",6,"aevalsrc=if(between(t\\,1\\,2)+between(t\\,3\\,3.4)+between(t\\,5\\,6)\\,0\\,0.2*sin(2*PI*440*t)):s=48000:d=6");
    await TestMedia("many-cuts",30,"aevalsrc=if(lt(mod(t\\,1)\\,0.3)\\,0\\,0.2*sin(2*PI*440*t)):s=48000:d=30",29.97);
    await TestMedia("timestamp-offset",6,"aevalsrc=if(between(t\\,1\\,2)+between(t\\,3\\,3.4)\\,0\\,0.2*sin(2*PI*440*t)):s=48000:d=6",30,5);
    await TestMedia("all-silent",2,"anullsrc=r=48000:cl=stereo:d=2");
}
Console.WriteLine($"{passed} checks passed.");
