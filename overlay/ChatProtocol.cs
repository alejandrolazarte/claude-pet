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

    private const string _rules = "Mantén su personalidad y su forma de hablar al contar lo que haces, en español y con frases cortas. "
        + "El trabajo técnico (código, comandos, explicaciones) tiene que ser exacto: la personalidad cambia cómo lo cuentas, nunca lo que haces ni lo que decides.";

    public static string PersonaPrompt(string name, string? persona) =>
        $"{(string.IsNullOrWhiteSpace(persona) ? $"Hablas como {name}." : persona.Trim())} {_rules}";

    public static IReadOnlyList<string> Arguments(string personaPrompt, string? resumeSessionId)
    {
        List<string> arguments =
        [
            "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
            // Manual, not the user's own mode: in auto mode the classifier approves everything and nothing would reach the pet.
            "--permission-mode", "manual", "--permission-prompt-tool", "stdio",
            "--append-system-prompt", personaPrompt,
        ];
        if (resumeSessionId is not null)
        {
            arguments.AddRange(["--resume", resumeSessionId]);
        }

        return arguments;
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
        if (decision == PermissionDecision.AllowSessionEdits && request.Suggestions is not null)
        {
            response["updatedPermissions"] = request.Suggestions.DeepClone();
        }

        return new JsonObject
        {
            ["type"] = "control_response",
            ["response"] = new JsonObject { ["subtype"] = "success", ["request_id"] = request.RequestId, ["response"] = response },
        }.ToJsonString();
    }

    public static string? InitSessionId(string line) =>
        Parse(line) is { } json && TextOf(json, "type") == "system" && TextOf(json, "subtype") == "init" ? TextOf(json, "session_id") : null;

    public static PermissionRequest? PermissionRequestOf(string line)
    {
        if (Parse(line) is not { } json || TextOf(json, "type") != "control_request" || json["request"] is not JsonObject request
            || TextOf(request, "subtype") != "can_use_tool" || TextOf(json, "request_id") is not { } requestId)
        {
            return null;
        }
        var description = TextOf(request, "description") ?? TextOf(request, "display_name") ?? TextOf(request, "tool_name") ?? "una herramienta";

        return new PermissionRequest(requestId, description, request["input"]?.DeepClone(), request["permission_suggestions"]?.DeepClone());
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
