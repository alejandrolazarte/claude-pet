using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PetOverlay;

// chats.json: the Claude session each character has in each folder.
public sealed class ChatStore(string path)
{
    public string? SessionFor(string key) => Read()["sessions"] is JsonObject sessions ? Text(sessions[key]) : null;

    public void Save(string key, string sessionId) => Update(json => Sessions(json)[key] = sessionId);

    public void Forget(string key) => Update(json => Sessions(json).Remove(key));

    private static JsonObject Sessions(JsonObject json)
    {
        if (json["sessions"] is not JsonObject sessions)
        {
            sessions = [];
            json["sessions"] = sessions;
        }

        return sessions;
    }

    private void Update(Action<JsonObject> change)
    {
        var json = Read();
        change(json);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, json.ToJsonString());
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // This runs on every turn, on the pet's thread: the chat is just not resumed next time.
        }
    }

    private JsonObject Read()
    {
        try
        {
            return File.Exists(path) && JsonNode.Parse(File.ReadAllText(path)) is JsonObject json ? json : [];
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            // A broken file starts over: the chats are just not resumed.
            return [];
        }
    }

    private static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
}
