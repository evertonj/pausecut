using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;

namespace PauseCut.Desktop;

internal static class Program
{
    private const string AppName = "PauseCut Desktop";

    [STAThread]
    private static async Task<int> Main()
    {
        Application.EnableVisualStyles();
        using var singleInstance = new Mutex(true, "Local\\PauseCutDesktop", out var isFirstInstance);
        if (!isFirstInstance)
        {
            MessageBox.Show("O PauseCut Desktop já está aberto.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        var installRoot = AppContext.BaseDirectory;
        var serverExecutable = Path.Combine(installRoot, "PauseCut.exe");
        var ffmpeg = Path.Combine(installRoot, "tools", "bin", "ffmpeg.exe");
        var ffprobe = Path.Combine(installRoot, "tools", "bin", "ffprobe.exe");
        if (!File.Exists(serverExecutable) || !File.Exists(ffmpeg) || !File.Exists(ffprobe))
        {
            MessageBox.Show("A instalação está incompleta. Extraia todo o arquivo ZIP antes de abrir o PauseCut Desktop.",
                AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        var localRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PauseCut");
        var dataRoot = Path.Combine(localRoot, "data");
        var logRoot = Path.Combine(localRoot, "logs");
        Directory.CreateDirectory(dataRoot);
        Directory.CreateDirectory(logRoot);
        var logPath = Path.Combine(logRoot, "desktop.log");
        var port = GetAvailablePort();
        var address = $"http://127.0.0.1:{port}";
        Process? server = null;
        Process? browser = null;
        StreamWriter? log = null;

        try
        {
            log = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite), Encoding.UTF8)
            {
                AutoFlush = true
            };
            await log.WriteLineAsync($"{DateTimeOffset.Now:O} Iniciando {AppName} em {address}");
            var start = new ProcessStartInfo(serverExecutable)
            {
                WorkingDirectory = installRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.Environment["ASPNETCORE_URLS"] = address;
            start.Environment["Video__FfmpegPath"] = ffmpeg;
            start.Environment["Video__FfprobePath"] = ffprobe;
            start.Environment["Video__DataPath"] = dataRoot;
            start.Environment["Video__ProcessingLocation"] = "desktop";
            start.Environment["Video__Encoder"] = "auto";
            server = new Process { StartInfo = start, EnableRaisingEvents = true };
            server.OutputDataReceived += (_, eventArgs) => WriteLog(log, eventArgs.Data);
            server.ErrorDataReceived += (_, eventArgs) => WriteLog(log, eventArgs.Data);
            if (!server.Start()) throw new InvalidOperationException("Não foi possível iniciar o motor de vídeo.");
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
            await WaitUntilReadyAsync(address, server, TimeSpan.FromSeconds(30));

            browser = OpenAppWindow(address, localRoot);
            if (browser is null)
            {
                Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
                MessageBox.Show("O PauseCut foi aberto no navegador padrão. Clique em OK depois de terminar para encerrar o processamento local.",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                await browser.WaitForExitAsync();
            }
            return 0;
        }
        catch (Exception ex)
        {
            if (log is not null) await log.WriteLineAsync($"{DateTimeOffset.Now:O} ERRO: {ex}");
            MessageBox.Show($"Não foi possível abrir o PauseCut Desktop.\n\n{ex.Message}\n\nLog: {logPath}",
                AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            try
            {
                if (browser is { HasExited: false }) browser.CloseMainWindow();
            }
            catch (InvalidOperationException) { }
            try
            {
                if (server is { HasExited: false })
                {
                    server.Kill(true);
                    await server.WaitForExitAsync();
                }
            }
            catch (InvalidOperationException) { }
            browser?.Dispose();
            server?.Dispose();
            log?.Dispose();
        }
    }

    private static int GetAvailablePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    private static async Task WaitUntilReadyAsync(string address, Process server, TimeSpan timeout)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (server.HasExited) throw new InvalidOperationException("O motor de vídeo encerrou durante a inicialização.");
            try
            {
                using var response = await client.GetAsync(address + "/api/health");
                if (response.IsSuccessStatusCode) return;
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) { }
            await Task.Delay(250);
        }
        throw new TimeoutException("O motor de vídeo demorou demais para iniciar.");
    }

    private static Process? OpenAppWindow(string address, string localRoot)
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe")
        };
        var executable = candidates.FirstOrDefault(File.Exists);
        if (executable is null) return null;
        var profile = Path.Combine(localRoot, Path.GetFileNameWithoutExtension(executable) + "-profile");
        Directory.CreateDirectory(profile);
        var start = new ProcessStartInfo(executable) { UseShellExecute = false };
        start.ArgumentList.Add("--app=" + address);
        start.ArgumentList.Add("--user-data-dir=" + profile);
        start.ArgumentList.Add("--no-first-run");
        start.ArgumentList.Add("--disable-background-mode");
        return Process.Start(start);
    }

    private static void WriteLog(StreamWriter log, string? line)
    {
        if (line is null) return;
        lock (log) log.WriteLine(line);
    }
}
