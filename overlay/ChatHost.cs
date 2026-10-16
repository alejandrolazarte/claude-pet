using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Threading;

namespace PetOverlay;

// One `claude -p` process: lines from its stdout come back on the UI thread, and what we write goes to its stdin.
public sealed class ChatHost
{
    private readonly Process _process;

    private ChatHost(Process process) => _process = process;

    public event Action<string>? Line;

    public event Action<int>? Exited;

    public static ChatHost Start(string claudePath, string folder, IReadOnlyList<string> arguments, Dispatcher dispatcher)
    {
        var info = new ProcessStartInfo(claudePath)
        {
            WorkingDirectory = folder,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            // No BOM: a byte-order mark in front of the first line makes it invalid JSON for claude.
            StandardInputEncoding = new UTF8Encoding(false),
        };
        // ArgumentList quotes each one: a persona with quotes or newlines, or a folder with spaces, stays one argument.
        foreach (var argument in arguments)
        {
            info.ArgumentList.Add(argument);
        }

        var process = new Process { StartInfo = info, EnableRaisingEvents = true };
        var host = new ChatHost(process);
        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data is { Length: > 0 } line)
            {
                dispatcher.BeginInvoke(() => host.Line?.Invoke(line));
            }
        };
        // Drained and dropped: a full stderr pipe would block claude.
        process.ErrorDataReceived += (_, e) => Debug.WriteLineIf(e.Data is not null, e.Data);
        process.Exited += (_, _) => dispatcher.BeginInvoke(() => host.Exited?.Invoke(process.ExitCode));
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        return host;
    }

    public void Send(string jsonLine)
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.StandardInput.WriteLine(jsonLine);
                _process.StandardInput.Flush();
            }
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            // The process is going away; Exited tells the chat.
        }
    }

    // Closing stdin lets claude finish and save the session; after 5 s it is killed.
    public void Close()
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.StandardInput.Close();
                if (!_process.WaitForExit(TimeSpan.FromSeconds(5)))
                {
                    _process.Kill(entireProcessTree: true);
                }
            }
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            // Already gone.
        }
        _process.Dispose();
    }
}
