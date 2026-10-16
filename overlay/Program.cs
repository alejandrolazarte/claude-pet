using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace PetOverlay;

public static class Program
{
    private const int _wmNcLButtonDown = 0xA1;
    private const int _htCaption = 2;
    private const string _host = "pet.local";

    private static readonly string _sessionsFolder = Path.Combine(Path.GetTempPath(), "claude-pet");
    private static readonly string _settingsFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "claude-pet");
    private static readonly string _positionFile = Path.Combine(_settingsFolder, "window.json");
    private static readonly string _settingsFile = Path.Combine(_settingsFolder, "settings.json");
    private static readonly string _charactersFolder = Path.Combine(_settingsFolder, "characters");
    private const long _maxArtBytes = 4 * 1024 * 1024;
    // MediaPlayer streams from disk; the cap only keeps out what is clearly not a sound, a whole song still fits.
    private const long _maxSoundBytes = 20 * 1024 * 1024;
    private static readonly string[] _doneSoundFiles = ["done.mp3", "done.wav"];
    private static readonly string[] _pokeSoundFiles = ["poke.mp3", "poke.wav"];
    // The folder name becomes the character's id in the menu and in settings.json.
    private static readonly Regex _characterId = new("^[a-z0-9][a-z0-9-]{0,39}$");
    private const int _titleTailBytes = 64 * 1024;
    private static readonly string _projectsFolder = Path.Combine(
        Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude"),
        "projects");
    private static readonly Dictionary<string, string> _transcripts = [];
    internal const string Host = _host;
    internal static string SettingsFolder => _settingsFolder;
    internal static string SessionsFolder => _sessionsFolder;
    internal static string ProjectsFolder => _projectsFolder;
    // Kept in fields: a MediaPlayer nothing references can be collected mid-sound. Two, so a finish chime
    // does not cut the music a tap started.
    private static MediaPlayer? _donePlayer;
    private static MediaPlayer? _pokePlayer;

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out NativePoint point);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out NativeRect rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [STAThread]
    public static void Main()
    {
        using var instance = new Mutex(true, @"Local\ClaudePetOverlay", out var isFirst);
        if (!isFirst)
        {
            return;
        }

        Directory.CreateDirectory(_sessionsFolder);
        Directory.CreateDirectory(_charactersFolder);
        DeleteOldSessionFiles();

        var webView = new WebView2CompositionControl
        {
            DefaultBackgroundColor = System.Drawing.Color.Transparent,
        };
        var window = new Window
        {
            Title = "Claude pet",
            Width = 96,
            Height = 100,
            WindowStyle = WindowStyle.None,
            AllowsTransparency = true,
            Background = Brushes.Transparent,
            Topmost = true,
            ShowInTaskbar = false,
            ResizeMode = ResizeMode.NoResize,
            Content = webView,
        };
        PlaceWindow(window);

        var debounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
        debounce.Tick += (_, _) =>
        {
            debounce.Stop();
            PostSessions(webView);
        };
        using var watcher = new FileSystemWatcher(_sessionsFolder, "*.json") { EnableRaisingEvents = true };
        FileSystemEventHandler restart = (_, _) => window.Dispatcher.BeginInvoke(() =>
        {
            debounce.Stop();
            debounce.Start();
        });
        watcher.Created += restart;
        watcher.Changed += restart;
        watcher.Deleted += restart;
        watcher.Renamed += (sender, e) => restart(sender, e);

        var artDebounce = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
        artDebounce.Tick += (_, _) =>
        {
            artDebounce.Stop();
            PostArt(webView);
        };
        using var artWatcher = new FileSystemWatcher(_charactersFolder) { IncludeSubdirectories = true, EnableRaisingEvents = true };
        FileSystemEventHandler artChanged = (_, _) => window.Dispatcher.BeginInvoke(() =>
        {
            artDebounce.Stop();
            artDebounce.Start();
        });
        artWatcher.Created += artChanged;
        artWatcher.Changed += artChanged;
        artWatcher.Deleted += artChanged;
        artWatcher.Renamed += (sender, e) => artChanged(sender, e);

        window.Loaded += async (_, _) =>
        {
            // The default data folder sits next to the exe, which is inside the installed plugin.
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(_settingsFolder, "webview2"));
            await webView.EnsureCoreWebView2Async(environment);
            var core = webView.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.SetVirtualHostNameToFolderMapping(
                _host, Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.Allow);
            core.WebMessageReceived += (_, e) => OnPageMessage(window, webView, e.WebMessageAsJson);
            core.Navigate($"https://{_host}/index.html");
        };

        // The page never gets mouseleave: in a transparent window the cursor passes to the window behind first.
        var wasInside = false;
        var hover = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
        hover.Tick += (_, _) =>
        {
            GetCursorPos(out var cursor);
            GetWindowRect(new WindowInteropHelper(window).Handle, out var bounds);
            var isInside = cursor.X >= bounds.Left && cursor.X < bounds.Right && cursor.Y >= bounds.Top && cursor.Y < bounds.Bottom;
            if (wasInside && !isInside)
            {
                webView.CoreWebView2?.PostWebMessageAsJson("""{"type":"mouseleave"}""");
            }
            wasInside = isInside;
        };
        hover.Start();

        // Session titles change without the session doing anything (a rename in the app's sidebar).
        var titles = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        titles.Tick += (_, _) => PostSessions(webView);
        titles.Start();

        // The chat window would otherwise keep the app alive after the pet is closed.
        window.Closed += (_, _) => ChatWindow.CloseCurrent();
        new Application { ShutdownMode = ShutdownMode.OnMainWindowClose }.Run(window);
    }

    private static void OnPageMessage(Window window, WebView2CompositionControl webView, string json)
    {
        using var message = JsonDocument.Parse(json);
        var root = message.RootElement;

        switch (root.GetProperty("type").GetString())
        {
            case "ready":
                PostArt(webView);
                PostCharacter(webView, ReadSetting("character"));
                PostCaption(webView, ReadSetting("caption"));
                PostSizes(webView, ReadSizes());
                PostSessions(webView);
                break;
            case "menu":
                ShowMenu(window, webView, root);
                break;
            case "drag":
                // WebView2 holds the mouse capture, so WPF's DragMove never sees the press.
                ReleaseCapture();
                SendMessage(new WindowInteropHelper(window).Handle, _wmNcLButtonDown, _htCaption, IntPtr.Zero);
                SavePosition(window);
                break;
            case "size":
                window.Width = root.GetProperty("width").GetDouble();
                window.Height = root.GetProperty("height").GetDouble();
                break;
            case "done":
                PlayDoneSound(root.TryGetProperty("character", out var done) ? done.GetString() : null);
                break;
            case "poke":
                TogglePokeSound(root.TryGetProperty("character", out var poked) ? poked.GetString() : null);
                break;
            case "permission-answer":
                ChatWindow.Current?.Answer(
                    root.GetProperty("requestId").GetString() ?? "",
                    root.GetProperty("decision").GetString() == "allow" ? PermissionDecision.Allow : PermissionDecision.Deny);
                break;
        }
    }

    private static void ShowMenu(Window window, WebView2CompositionControl webView, JsonElement request)
    {
        var current = request.GetProperty("current").GetString();
        var characters = new MenuItem { Header = "Personaje" };
        foreach (var character in request.GetProperty("characters").EnumerateArray())
        {
            var id = character.GetProperty("id").GetString();
            var item = new MenuItem
            {
                Header = character.GetProperty("label").GetString(),
                IsCheckable = true,
                IsChecked = id == current,
            };
            item.Click += (_, _) =>
            {
                SaveSetting("character", id);
                PostCharacter(webView, id);
                _pokePlayer?.Close();
            };
            characters.Items.Add(item);
        }

        var talk = new MenuItem { Header = "Hablar" };
        talk.Click += (_, _) => OpenChat(window, webView, request.Clone());

        var caption = request.GetProperty("caption").GetString();
        var show = new MenuItem { Header = "Mostrar" };
        foreach (var (mode, label) in new[] { ("repo", "Proyecto"), ("title", "Título de la sesión") })
        {
            var item = new MenuItem { Header = label, IsCheckable = true, IsChecked = mode == caption };
            item.Click += (_, _) =>
            {
                SaveSetting("caption", mode);
                PostCaption(webView, mode);
            };
            show.Items.Add(item);
        }

        var sizes = ReadSizes();
        var slider = new Slider
        {
            Minimum = 50,
            Maximum = 250,
            TickFrequency = 10,
            IsSnapToTickEnabled = true,
            Width = 150,
            Value = sizes[current ?? ""] is JsonValue saved && saved.TryGetValue<double>(out var percent) ? percent : 100,
        };
        var percentText = new TextBlock { Width = 40, TextAlignment = TextAlignment.Right, Text = $"{slider.Value:0} %" };
        slider.ValueChanged += (_, _) =>
        {
            percentText.Text = $"{slider.Value:0} %";
            sizes[current ?? ""] = slider.Value;
            PostSizes(webView, sizes);
        };
        var size = new MenuItem
        {
            Header = new StackPanel { Orientation = Orientation.Horizontal, Children = { new TextBlock { Text = "Tamaño", Width = 60 }, slider, percentText } },
            StaysOpenOnClick = true,
        };

        var sound = new MenuItem { Header = "Sonido", IsCheckable = true, IsChecked = IsSoundOn() };
        sound.Click += (_, _) =>
        {
            SaveSetting("sound", sound.IsChecked);
            if (!sound.IsChecked)
            {
                _pokePlayer?.Close();
            }
        };

        var close = new MenuItem { Header = "Cerrar" };
        close.Click += (_, _) => window.Close();

        var menu = new ContextMenu { Placement = PlacementMode.MousePoint, PlacementTarget = window };
        menu.Items.Add(characters);
        menu.Items.Add(talk);
        menu.Items.Add(show);
        menu.Items.Add(size);
        menu.Items.Add(sound);
        menu.Items.Add(new Separator());
        menu.Items.Add(close);
        // Saved once the menu closes, not on every step of the slider.
        menu.Closed += (_, _) => SaveSetting("sizes", sizes.DeepClone());
        menu.IsOpen = true;
    }

    private static void OpenChat(Window window, WebView2CompositionControl webView, JsonElement request)
    {
        var current = request.GetProperty("current").GetString() ?? "blob";
        if (!_characterId.IsMatch(current))
        {
            return;
        }

        var label = request.GetProperty("characters").EnumerateArray()
            .Where(character => character.GetProperty("id").GetString() == current)
            .Select(character => character.GetProperty("label").GetString())
            .FirstOrDefault() ?? current;
        var persona = TextOf(ReadJsonObject(Path.Combine(_charactersFolder, current, "character.json")), "persona");
        var name = current == "blob" ? ChatProtocol.BlobName : label;
        ChatWindow.Open(window, webView, current, label, ChatProtocol.PersonaPrompt(name, persona));
    }

    private static void PostArt(WebView2CompositionControl webView)
    {
        var characters = new JsonArray();
        foreach (var folder in Directory.EnumerateDirectories(_charactersFolder).Order())
        {
            var id = Path.GetFileName(folder);
            var svg = _characterId.IsMatch(id) ? ReadArt(Path.Combine(folder, "character.svg")) : null;
            if (svg is null)
            {
                continue;
            }
            var manifest = ReadJsonObject(Path.Combine(folder, "character.json"));
            characters.Add(new JsonObject
            {
                ["id"] = id,
                ["label"] = TextOf(manifest, "label") ?? id,
                ["svg"] = svg,
                ["viewBox"] = TextOf(manifest, "viewBox"),
                ["parts"] = manifest["parts"]?.DeepClone(),
                ["outline"] = manifest["outline"]?.DeepClone(),
            });
        }

        webView.CoreWebView2?.PostWebMessageAsJson(new JsonObject
        {
            ["type"] = "art",
            ["characters"] = characters,
        }.ToJsonString());
    }

    private static string? ReadArt(string path)
    {
        try
        {
            return File.Exists(path) && new FileInfo(path).Length <= _maxArtBytes ? File.ReadAllText(path) : null;
        }
        catch (IOException)
        {
            // An unreadable file just leaves that character out of the menu.
            return null;
        }
    }

    private static void PlayDoneSound(string? id)
    {
        if (FindSound(id, _doneSoundFiles) is not { } file)
        {
            return;
        }

        _donePlayer ??= NewPlayer();
        _donePlayer.Open(new Uri(file.FullName));
        _donePlayer.Play();
    }

    // A tap starts the character's poke sound; a tap while it plays stops it, so a whole song is not stuck on.
    private static void TogglePokeSound(string? id)
    {
        if (_pokePlayer?.Source is not null)
        {
            _pokePlayer.Close();
            return;
        }
        if (FindSound(id, _pokeSoundFiles) is not { } file)
        {
            return;
        }

        _pokePlayer ??= NewPlayer();
        _pokePlayer.Open(new Uri(file.FullName));
        _pokePlayer.Play();
    }

    private static FileInfo? FindSound(string? id, string[] names)
    {
        // The id comes from the page: only a character folder name may become part of a path.
        if (id is null || !_characterId.IsMatch(id) || !IsSoundOn())
        {
            return null;
        }

        return names
            .Select(name => new FileInfo(Path.Combine(_charactersFolder, id, name)))
            .FirstOrDefault(info => info.Exists && info.Length <= _maxSoundBytes);
    }

    private static MediaPlayer NewPlayer()
    {
        var player = new MediaPlayer();
        // Closing releases the file, so the user can replace the sound while the window is open. It also clears
        // Source, which is how the poke toggle knows nothing is playing.
        player.MediaEnded += (_, _) => player.Close();
        player.MediaFailed += (_, _) => player.Close();
        return player;
    }

    private static bool IsSoundOn()
    {
        return ReadJsonObject(_settingsFile)["sound"] is not JsonValue value || !value.TryGetValue<bool>(out var isOn) || isOn;
    }

    private static void PostCharacter(WebView2CompositionControl webView, string? id)
    {
        webView.CoreWebView2?.PostWebMessageAsJson(new JsonObject { ["type"] = "character", ["id"] = id }.ToJsonString());
    }

    private static void PostSizes(WebView2CompositionControl webView, JsonObject sizes)
    {
        webView.CoreWebView2?.PostWebMessageAsJson(new JsonObject { ["type"] = "sizes", ["sizes"] = sizes.DeepClone() }.ToJsonString());
    }

    private static JsonObject ReadSizes()
    {
        return ReadJsonObject(_settingsFile)["sizes"] is JsonObject sizes ? (JsonObject)sizes.DeepClone() : [];
    }

    private static void PostCaption(WebView2CompositionControl webView, string? mode)
    {
        webView.CoreWebView2?.PostWebMessageAsJson(new JsonObject { ["type"] = "caption", ["mode"] = mode }.ToJsonString());
    }

    private static JsonObject ReadJsonObject(string path)
    {
        try
        {
            return File.Exists(path) && JsonNode.Parse(File.ReadAllText(path)) is JsonObject json ? json : [];
        }
        catch (Exception exception) when (exception is IOException or JsonException)
        {
            // A broken file falls back to the defaults.
            return [];
        }
    }

    private static string? TextOf(JsonObject json, string key)
    {
        return json[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
    }

    private static string? ReadSetting(string key)
    {
        return TextOf(ReadJsonObject(_settingsFile), key);
    }

    private static void SaveSetting(string key, JsonNode? value)
    {
        var settings = ReadJsonObject(_settingsFile);
        settings[key] = value;
        Directory.CreateDirectory(_settingsFolder);
        File.WriteAllText(_settingsFile, settings.ToJsonString());
    }

    private static string? ReadTitle(string? sessionId)
    {
        // The id comes from a file anyone can write: only a GUID may become part of a path.
        if (!Guid.TryParse(sessionId, out _) || !Directory.Exists(_projectsFolder))
        {
            return null;
        }

        if (!_transcripts.TryGetValue(sessionId, out var path) || !File.Exists(path))
        {
            path = Directory.EnumerateDirectories(_projectsFolder)
                .Select(project => Path.Combine(project, $"{sessionId}.jsonl"))
                .FirstOrDefault(File.Exists);
            if (path is null)
            {
                return null;
            }
            _transcripts[sessionId] = path;
        }

        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            stream.Seek(Math.Max(0, stream.Length - _titleTailBytes), SeekOrigin.Begin);
            var tail = new StreamReader(stream, Encoding.UTF8).ReadToEnd();
            foreach (var line in tail.Split('\n').Reverse().Where(line => line.Contains("\"custom-title\"")))
            {
                try
                {
                    return JsonNode.Parse(line)?["customTitle"]?.GetValue<string>();
                }
                catch (Exception exception) when (exception is JsonException or InvalidOperationException)
                {
                    // The first line of the tail is usually cut in half; an older entry still names the title.
                }
            }
        }
        catch (IOException)
        {
            // A transcript being rotated or locked just shows the project this time.
        }

        return null;
    }

    private static void PostSessions(WebView2CompositionControl webView)
    {
        if (webView.CoreWebView2 is null)
        {
            return;
        }

        var sessions = new JsonArray();
        foreach (var file in Directory.EnumerateFiles(_sessionsFolder, "*.json"))
        {
            try
            {
                using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                if (JsonNode.Parse(stream) is JsonObject session)
                {
                    session["title"] = ReadTitle(session["sessionId"]?.GetValue<string>());
                    sessions.Add(session);
                }
            }
            catch (Exception exception) when (exception is IOException or JsonException)
            {
                // A file mid-write: the watcher fires again once it is complete.
            }
        }

        webView.CoreWebView2.PostWebMessageAsJson(new JsonObject { ["type"] = "sessions", ["sessions"] = sessions }.ToJsonString());
    }

    private static void DeleteOldSessionFiles()
    {
        foreach (var file in Directory.EnumerateFiles(_sessionsFolder, "*.json"))
        {
            if (File.GetLastWriteTimeUtc(file) < DateTime.UtcNow.AddDays(-1))
            {
                File.Delete(file);
            }
        }
    }

    private static void PlaceWindow(Window window)
    {
        var area = SystemParameters.WorkArea;
        window.Left = area.Right - window.Width - 24;
        window.Top = area.Bottom - window.Height - 24;

        if (!File.Exists(_positionFile))
        {
            return;
        }

        try
        {
            var saved = JsonNode.Parse(File.ReadAllText(_positionFile));
            var left = saved?["left"]?.GetValue<double>();
            var top = saved?["top"]?.GetValue<double>();
            var screen = new Rect(
                SystemParameters.VirtualScreenLeft, SystemParameters.VirtualScreenTop,
                SystemParameters.VirtualScreenWidth, SystemParameters.VirtualScreenHeight);
            if (left is double x && top is double y && screen.Contains(new Point(x + 20, y + 20)))
            {
                window.Left = x;
                window.Top = y;
            }
        }
        catch (Exception exception) when (exception is IOException or JsonException or InvalidOperationException)
        {
            // A broken position file falls back to the bottom-right corner.
        }
    }

    private static void SavePosition(Window window)
    {
        Directory.CreateDirectory(_settingsFolder);
        File.WriteAllText(_positionFile, new JsonObject { ["left"] = window.Left, ["top"] = window.Top }.ToJsonString());
    }
}
