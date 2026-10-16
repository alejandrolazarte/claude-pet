using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace PetOverlay;

// The "Hablar" window: a chat page wired to one claude process, with its permission questions mirrored on the pet.
public sealed class ChatWindow
{
    private const string _denied = "El usuario lo denegó.";
    private const string _noAnswer = "Sin respuesta del usuario.";

    private readonly Window _window;
    // Composition hosting like the pet's: one browser process cannot mix it with the windowed WebView2 control.
    private readonly WebView2CompositionControl _chat = new();
    private readonly WebView2CompositionControl _pet;
    private readonly string _characterId;
    private readonly string _label;
    private readonly string _personaPrompt;
    private readonly string _folder;
    private readonly string _key;
    private readonly ChatStore _store;
    private readonly PermissionBroker _broker = new();
    private readonly DispatcherTimer _expiry = new() { Interval = TimeSpan.FromSeconds(5) };
    private ChatHost? _host;
    private bool _closing;

    private ChatWindow(WebView2CompositionControl pet, string characterId, string label, string personaPrompt, string folder, ChatStore store)
    {
        _pet = pet;
        _characterId = characterId;
        _label = label;
        _personaPrompt = personaPrompt;
        _folder = folder;
        _store = store;
        _key = ChatProtocol.ChatKey(characterId, folder);
        _window = new Window { Title = label, Width = 520, Height = 680, Content = _chat };
        _window.Loaded += async (_, _) =>
        {
            try
            {
                // Same data folder and options as the pet's WebView2, so both share one browser process.
                var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(Program.SettingsFolder, "webview2"));
                if (_closing)
                {
                    return;
                }
                await _chat.EnsureCoreWebView2Async(environment);
                if (_closing)
                {
                    return;
                }
                var core = _chat.CoreWebView2;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.SetVirtualHostNameToFolderMapping(
                    Program.Host, Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.Allow);
                core.WebMessageReceived += (_, e) => OnChatMessage(e.WebMessageAsJson);
                core.Navigate($"https://{Program.Host}/chat.html");
            }
            // Closed while WebView2 was still starting: Shutdown already disposed it.
            catch (Exception) when (_closing)
            {
            }
        };
        _window.Closed += (_, _) => Shutdown();
        _expiry.Tick += (_, _) =>
        {
            foreach (var request in _broker.TakeExpired(DateTime.UtcNow))
            {
                Reply(request, PermissionDecision.Deny, _noAnswer);
            }
        };
        _expiry.Start();
        _window.Show();
    }

    public static ChatWindow? Current { get; private set; }

    public static void Open(WebView2CompositionControl petView, string characterId, string label, string personaPrompt)
    {
        if (Current is not null)
        {
            Current._window.Activate();
            return;
        }

        // An empty folder of the character's own: the chat is a conversation, away from the user's repos and their CLAUDE.md.
        var folder = Directory.CreateDirectory(Path.Combine(Program.SettingsFolder, "chats", characterId)).FullName;
        Current = new ChatWindow(petView, characterId, label, personaPrompt, folder, new ChatStore(Path.Combine(Program.SettingsFolder, "chats.json")));
    }

    public static void CloseCurrent() => Current?._window.Close();

    public void Answer(string requestId, PermissionDecision decision)
    {
        if (_broker.Take(requestId) is { } request)
        {
            Reply(request, decision, _denied);
        }
    }

    private void OnChatMessage(string json)
    {
        // A page timer that fires after closing would start claude again or overwrite the pet's "gone".
        if (_closing)
        {
            return;
        }

        using var message = JsonDocument.Parse(json);
        var root = message.RootElement;
        switch (root.GetProperty("type").GetString())
        {
            case "chat-ready":
                StartClaude(resume: true);
                break;
            case "chat-send":
                _host?.Send(ChatProtocol.UserMessage(root.GetProperty("text").GetString() ?? ""));
                break;
            case "chat-permission":
                Answer(root.GetProperty("requestId").GetString() ?? "", DecisionOf(root.GetProperty("decision").GetString()));
                break;
            case "chat-interrupt":
                _host?.Send(ChatProtocol.InterruptRequest(Guid.NewGuid().ToString()));
                break;
            case "chat-new":
                _store.Forget(_key);
                StopClaude();
                StartClaude(resume: false);
                break;
            case "chat-resume":
                StopClaude();
                StartClaude(resume: true);
                break;
            case "chat-mood":
                WriteSession(root.GetProperty("mood").GetString() ?? "idle", root.GetProperty("label").GetString() ?? "");
                break;
        }
    }

    // Anything unexpected denies: the safe answer.
    private static PermissionDecision DecisionOf(string? decision) => decision switch
    {
        "allow" => PermissionDecision.Allow,
        "allow-session-edits" => PermissionDecision.AllowSessionEdits,
        _ => PermissionDecision.Deny,
    };

    private void StartClaude(bool resume)
    {
        // React's strict mode mounts the page twice in development: one process is enough.
        if (_host is not null)
        {
            return;
        }

        if (FindClaude() is not { } claude)
        {
            PostChat(Init([], null, $"No encontré Claude Code {ChatProtocol.MinimumClaude} o superior. Revisá que `claude` esté en el PATH, o definí CLAUDE_PET_CLAUDE con la ruta de claude.exe."));
            return;
        }

        var resumeId = resume ? _store.SessionFor(_key) : null;
        var transcript = resumeId is null ? null : TranscriptOf(resumeId);
        string? notice = null;
        // Decided before starting: guessing from the exit code also forgot sessions that were fine, when claude died for another reason.
        if (resumeId is not null && transcript is null)
        {
            _store.Forget(_key);
            resumeId = null;
            notice = "No encontré la conversación anterior; empiezo una nueva.";
        }

        IReadOnlyList<HistoryItem> history = transcript is null ? [] : ChatProtocol.History(transcript);
        _host = ChatHost.Start(claude, _folder, ChatProtocol.Arguments(_personaPrompt, resumeId), _window.Dispatcher);
        _host.Line += OnLine;
        _host.Exited += OnExited;
        PostChat(Init(history, notice, null));
    }

    private void StopClaude()
    {
        // Answered before stdin closes, so claude records the denial instead of dying mid-question.
        foreach (var request in _broker.TakeAll())
        {
            Reply(request, PermissionDecision.Deny, _denied);
        }
        if (_host is null)
        {
            return;
        }

        _host.Line -= OnLine;
        _host.Exited -= OnExited;
        // Ends a turn in progress now, rather than when it finishes or at the 5 s kill.
        _host.Send(ChatProtocol.InterruptRequest(Guid.NewGuid().ToString()));
        _host.Close();
        _host = null;
    }

    private void OnLine(string line)
    {
        if (ChatProtocol.InitSessionId(line) is { } sessionId)
        {
            _store.Save(_key, sessionId);
        }
        if (ChatProtocol.PermissionRequestOf(line) is { } request)
        {
            _broker.Ask(request, DateTime.UtcNow);
            PostPet(new JsonObject { ["type"] = "permission", ["requestId"] = request.RequestId, ["description"] = $"{_label}: {request.Description}" });
        }
        // The chat page closes its card from this same line.
        if (ChatProtocol.CancelledRequestId(line) is { } cancelled && _broker.Take(cancelled) is not null)
        {
            PostPet(new JsonObject { ["type"] = "permission-done", ["requestId"] = cancelled });
        }
        PostChat(new JsonObject { ["type"] = "chat-event", ["line"] = line });
    }

    private void OnExited(int code)
    {
        if (_closing)
        {
            return;
        }

        StopClaude();
        PostChat(new JsonObject { ["type"] = "chat-exit", ["code"] = code });
        WriteSession(code == 0 ? "idle" : "sad", code == 0 ? "esperando" : "falló la charla");
    }

    private void Reply(PermissionRequest request, PermissionDecision decision, string denyMessage)
    {
        _host?.Send(ChatProtocol.PermissionResponse(request, decision, denyMessage));
        var decisionText = decision switch
        {
            PermissionDecision.Allow => "allow",
            PermissionDecision.AllowSessionEdits => "allow-session-edits",
            _ => "deny",
        };
        PostChat(new JsonObject { ["type"] = "chat-permission-done", ["requestId"] = request.RequestId, ["decision"] = decisionText });
        PostPet(new JsonObject { ["type"] = "permission-done", ["requestId"] = request.RequestId });
    }

    private void Shutdown()
    {
        _closing = true;
        _expiry.Stop();
        StopClaude();
        WriteSession("gone", "");
        // Closing the window does not free the control: its renderer and the page's timers would live on.
        _chat.Dispose();
        Current = null;
    }

    private JsonObject Init(IReadOnlyList<HistoryItem> history, string? notice, string? error)
    {
        var items = new JsonArray();
        for (var i = 0; i < history.Count; i++)
        {
            var item = history[i];
            items.Add(item.Kind == "tool"
                ? new JsonObject { ["kind"] = "tool", ["id"] = $"h{i}", ["name"] = item.Text, ["summary"] = item.Text, ["status"] = "done" }
                : new JsonObject { ["kind"] = item.Kind, ["text"] = item.Text });
        }

        return new JsonObject
        {
            ["type"] = "chat-init",
            ["character"] = _characterId,
            ["label"] = _label,
            ["history"] = items,
            ["notice"] = notice,
            ["error"] = error,
        };
    }

    private void WriteSession(string mood, string label)
    {
        var session = new JsonObject
        {
            ["sessionId"] = $"chat-{_characterId}",
            ["repo"] = $"{_label} · chat",
            ["mood"] = mood,
            ["label"] = label,
            ["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };
        try
        {
            File.WriteAllText(Path.Combine(Program.SessionsFolder, $"chat-{_characterId}.json"), session.ToJsonString());
        }
        catch (IOException)
        {
            // The pet misses one state; the chat itself is unaffected.
        }
    }

    private void PostChat(JsonObject message)
    {
        // Once the window is closing its WebView2 may already be disposed.
        if (!_closing)
        {
            _chat.CoreWebView2?.PostWebMessageAsJson(message.ToJsonString());
        }
    }

    private void PostPet(JsonObject message) => _pet.CoreWebView2?.PostWebMessageAsJson(message.ToJsonString());

    // Null when there is nothing to resume. The id comes from our own chats.json, but it only becomes part of a path, and of
    // claude's arguments, as a GUID: "--resume" takes an optional value, so one starting with "-" would be read as a flag.
    private static IReadOnlyList<string>? TranscriptOf(string sessionId)
    {
        if (!Guid.TryParse(sessionId, out _) || !Directory.Exists(Program.ProjectsFolder))
        {
            return null;
        }

        var path = Directory.EnumerateDirectories(Program.ProjectsFolder)
            .Select(project => Path.Combine(project, $"{sessionId}.jsonl"))
            .FirstOrDefault(File.Exists);
        try
        {
            return path is null ? null : File.ReadAllLines(path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // It is there: resume it, without the history on screen.
            return [];
        }
    }

    // Like install.ps1: CLAUDE_PET_CLAUDE if set, otherwise every claude.exe on the PATH and in the desktop app; the newest wins.
    private static string? FindClaude()
    {
        var forced = Environment.GetEnvironmentVariable("CLAUDE_PET_CLAUDE");
        IEnumerable<string> candidates = forced is { Length: > 0 }
            ? [forced]
            : [
                .. (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)
                    .Where(folder => folder.Length > 0)
                    .Select(folder => Path.Combine(folder.Trim('"'), "claude.exe")),
                .. DesktopClaudes(),
            ];

        return ChatProtocol.PickClaude(candidates
            .Where(File.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(path => (path, VersionOf(path))));
    }

    private static IEnumerable<string> DesktopClaudes()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Claude", "claude-code");

        return Directory.Exists(root)
            ? Directory.EnumerateDirectories(root)
                .SelectMany(version => Directory.EnumerateDirectories(version))
                .Select(folder => Path.Combine(folder, "claude.exe"))
            : [];
    }

    private static Version? VersionOf(string path)
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo(path, "--version")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            if (process is null)
            {
                return null;
            }
            var output = process.StandardOutput.ReadToEnd();

            return process.WaitForExit(5000) ? ChatProtocol.ParseVersion(output) : null;
        }
        catch (Exception exception) when (exception is Win32Exception or IOException)
        {
            return null;
        }
    }
}
