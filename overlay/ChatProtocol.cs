using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PetOverlay;

public enum PermissionDecision
{
    Allow,
    AllowSessionEdits,
    Deny,
}

public sealed record HistoryItem(string Kind, string Text);

public sealed record PermissionRequest(string RequestId, string Description, JsonNode? Input, JsonNode? Suggestions);

// The pure half of the character chat: what to pass to `claude -p` and how to read and write its stream-json lines.
public static class ChatProtocol
{
    // The oldest CLI whose stream-json permission protocol was checked against this window.
    public static readonly Version MinimumClaude = new(2, 1, 300);

    public const string BlobName = "una mascota simpática";

    private const string _rules = "Habla siempre en primera persona como ese personaje y preséntate con su nombre: no digas que eres Claude ni un asistente. "
        + "Solo si te preguntan en serio si eres una IA, di la verdad. "
        + "Mantén su personalidad y su forma de hablar al contar lo que haces, en español y con frases cortas; en una respuesta técnica larga, el tono va al principio y al final. "
        + "Escribe en texto plano: el chat muestra el Markdown tal cual, así que nada de negritas, títulos ni enlaces entre corchetes; una dirección web va sola. "
        + "El trabajo técnico (código, comandos, explicaciones) tiene que ser exacto: la personalidad cambia cómo lo cuentas, nunca lo que haces ni lo que decides.";

    public static string PersonaPrompt(string name, string? persona) =>
        $"{(string.IsNullOrWhiteSpace(persona) ? $"Eres {name}." : persona.Trim())} {_rules}";

    public static IReadOnlyList<string> Arguments(string personaPrompt, string? resumeSessionId)
    {
        List<string> arguments =
        [
            "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
            // Manual, not the user's own mode: in auto mode the classifier approves everything and nothing would reach the pet.
            "--permission-mode", "manual", "--permission-prompt-tool", "stdio",
            // A chat of its own: none of the user's CLAUDE.md, plugins, hooks or MCP servers (work, mail, chat) reach it.
            "--safe-mode",
            "--append-system-prompt", personaPrompt,
        ];
        if (resumeSessionId is not null)
        {
            arguments.AddRange(["--resume", resumeSessionId]);
        }

        return arguments;
    }

    // Read while the menu is built: the JsonDocument behind the menu request is disposed before any click.
    public static (string Id, string Label) ChatTarget(JsonElement menuRequest)
    {
        var current = menuRequest.TryGetProperty("current", out var id) && id.ValueKind == JsonValueKind.String ? id.GetString()! : "blob";
        var label = menuRequest.TryGetProperty("characters", out var characters) && characters.ValueKind == JsonValueKind.Array
            ? characters.EnumerateArray()
                .Where(character => character.TryGetProperty("id", out var characterId) && characterId.ValueKind == JsonValueKind.String
                    && characterId.GetString() == current)
                .Select(character => character.TryGetProperty("label", out var name) && name.ValueKind == JsonValueKind.String ? name.GetString() : null)
                .FirstOrDefault()
            : null;

        return (current, label ?? current);
    }

    public static string ChatKey(string characterId, string folder) =>
        $"{characterId}|{Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder)).ToLowerInvariant()}";

    public static Version? ParseVersion(string output) =>
        Version.TryParse(output.Trim().Split(' ', 2)[0], out var version) ? version : null;

    public static string? PickClaude(IEnumerable<(string Path, Version? Version)> candidates) =>
        candidates
            .Where(candidate => candidate.Version is not null && candidate.Version >= MinimumClaude)
            .OrderByDescending(candidate => candidate.Version)
            .Select(candidate => candidate.Path)
            .FirstOrDefault();

    public static string UserMessage(string text) => new JsonObject
    {
        ["type"] = "user",
        ["message"] = new JsonObject { ["role"] = "user", ["content"] = text },
    }.ToJsonString();

    public static string InterruptRequest(string requestId) => new JsonObject
    {
        ["type"] = "control_request",
        ["request_id"] = requestId,
        ["request"] = new JsonObject { ["subtype"] = "interrupt" },
    }.ToJsonString();

    public static string PermissionResponse(PermissionRequest request, PermissionDecision decision, string denyMessage)
    {
        var response = decision == PermissionDecision.Deny
            ? new JsonObject { ["behavior"] = "deny", ["message"] = denyMessage }
            : new JsonObject { ["behavior"] = "allow", ["updatedInput"] = request.Input?.DeepClone() ?? new JsonObject() };
        if (decision == PermissionDecision.AllowSessionEdits && SessionEdits(request.Suggestions) is { Count: > 0 } edits)
        {
            response["updatedPermissions"] = edits;
        }

        return new JsonObject
        {
            ["type"] = "control_response",
            ["response"] = new JsonObject { ["subtype"] = "success", ["request_id"] = request.RequestId, ["response"] = response },
        }.ToJsonString();
    }

    // Only "accept edits for this session": the other suggestions save rules for good (Bash(rm *)) or widen the folders.
    private static JsonArray SessionEdits(JsonNode? suggestions) =>
        new(suggestions is JsonArray all
            ? all.OfType<JsonObject>()
                .Where(suggestion => TextOf(suggestion, "type") == "setMode" && TextOf(suggestion, "mode") == "acceptEdits"
                    && TextOf(suggestion, "destination") == "session")
                .Select(suggestion => suggestion.DeepClone())
                .ToArray()
            : []);

    public static string? InitSessionId(string line) =>
        Parse(line) is { } json && TextOf(json, "type") == "system" && TextOf(json, "subtype") == "init" ? TextOf(json, "session_id") : null;

    public static PermissionRequest? PermissionRequestOf(string line)
    {
        if (Parse(line) is not { } json || TextOf(json, "type") != "control_request" || json["request"] is not JsonObject request
            || TextOf(request, "subtype") != "can_use_tool" || TextOf(json, "request_id") is not { } requestId)
        {
            return null;
        }
        var description = SummaryOf(request["input"])
            ?? TextOf(request, "description") ?? TextOf(request, "display_name") ?? TextOf(request, "tool_name") ?? "una herramienta";

        return new PermissionRequest(requestId, description, request["input"]?.DeepClone(), request["permission_suggestions"]?.DeepClone());
    }

    // What the request really does, read from its input like the chat's toolSummary: for Bash, the CLI's description is the model's own words.
    private static string? SummaryOf(JsonNode? input)
    {
        if (input is not JsonObject json)
        {
            return null;
        }
        if (TextOf(json, "command") is { } command)
        {
            return $"$ {(command.Length > 120 ? $"{command[..120]}…" : command)}";
        }
        if ((TextOf(json, "file_path") ?? TextOf(json, "notebook_path")) is { } path)
        {
            return Path.GetFileName(Path.TrimEndingDirectorySeparator(path)) is { Length: > 0 } name ? name : path;
        }

        return TextOf(json, "url");
    }

    public static IReadOnlyList<HistoryItem> History(IEnumerable<string> transcriptLines)
    {
        List<HistoryItem> items = [];
        foreach (var line in transcriptLines)
        {
            if (Parse(line) is not { } json || TextOf(json, "type") is not ("user" or "assistant") || IsMeta(json)
                || json["message"] is not JsonObject message)
            {
                continue;
            }
            var kind = TextOf(json, "type")!;
            if (message["content"] is JsonValue value && value.TryGetValue<string>(out var plain))
            {
                if (!string.IsNullOrWhiteSpace(plain))
                {
                    items.Add(new HistoryItem(kind, plain));
                }
                continue;
            }
            if (message["content"] is not JsonArray blocks)
            {
                continue;
            }
            foreach (var block in blocks.OfType<JsonObject>())
            {
                if (TextOf(block, "type") == "text" && TextOf(block, "text") is { } text && !string.IsNullOrWhiteSpace(text))
                {
                    items.Add(new HistoryItem(kind, text));
                }
                else if (TextOf(block, "type") == "tool_use" && TextOf(block, "name") is { } name)
                {
                    items.Add(new HistoryItem("tool", name));
                }
            }
        }

        return items;
    }

    // Slash commands and other bookkeeping the user never typed.
    private static bool IsMeta(JsonObject json) => json["isMeta"] is JsonValue value && value.TryGetValue<bool>(out var isMeta) && isMeta;

    // Only objects count: an array, a number or a cut-off line is not an event.
    private static JsonObject? Parse(string line)
    {
        try
        {
            return JsonNode.Parse(line) as JsonObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? TextOf(JsonObject json, string key) =>
        json[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
}
