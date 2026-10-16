using System.Text.Json;
using System.Text.Json.Nodes;
using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public class ChatProtocolTests
{
    // The permission request recorded from claude 2.1.300 (paths shortened).
    private const string ProbeRequest = """{"type":"control_request","request_id":"8a22400d","request":{"subtype":"can_use_tool","tool_name":"Write","display_name":"Write","input":{"file_path":"C:\\work\\hola.txt","content":"hola"},"description":"hola.txt","permission_suggestions":[{"type":"setMode","mode":"acceptEdits","destination":"session"}],"tool_use_id":"toolu_1"}}""";

    private static JsonNode Json(string text) => JsonNode.Parse(text)!;

    [Fact]
    public void PersonaPrompt_uses_the_name_when_there_is_no_persona()
    {
        var prompt = ChatProtocol.PersonaPrompt("Toji Fushiguro", null);

        prompt.ShouldStartWith("Eres Toji Fushiguro. ");
        prompt.ShouldContain("tiene que ser exacto");
    }

    [Fact]
    public void PersonaPrompt_replaces_the_first_sentence_with_the_persona()
    {
        var prompt = ChatProtocol.PersonaPrompt("Toji Fushiguro", "  Toji: mercenario seco e irónico.  ");

        prompt.ShouldStartWith("Toji: mercenario seco e irónico. Habla");
        prompt.ShouldNotContain("Eres Toji");
    }

    [Fact]
    public void PersonaPrompt_treats_a_blank_persona_as_missing()
    {
        ChatProtocol.PersonaPrompt("Itachi Uchiha", "   ").ShouldStartWith("Eres Itachi Uchiha.");
    }

    [Fact]
    public void PersonaPrompt_keeps_the_character_unless_asked_in_earnest_whether_it_is_an_AI()
    {
        var prompt = ChatProtocol.PersonaPrompt("Itachi Uchiha", null);

        prompt.ShouldContain("primera persona");
        prompt.ShouldContain("no digas que eres Claude");
        prompt.ShouldContain("si eres una IA, di la verdad");
    }

    [Fact]
    public void PersonaPrompt_asks_for_plain_text_because_the_chat_shows_markdown_as_is()
    {
        ChatProtocol.PersonaPrompt("Itachi Uchiha", null).ShouldContain("texto plano");
    }

    [Fact]
    public void Arguments_leave_out_the_users_own_configuration()
    {
        ChatProtocol.Arguments("persona", null).ShouldContain("--safe-mode");
    }

    [Fact]
    public void Arguments_ask_for_stream_json_and_manual_permissions_answered_on_stdio()
    {
        var arguments = ChatProtocol.Arguments("persona", null);

        arguments.Take(4).ShouldBe(new[] { "-p", "--input-format", "stream-json", "--output-format" });
        arguments.ShouldContain("--include-partial-messages");
        arguments[arguments.ToList().IndexOf("--permission-mode") + 1].ShouldBe("manual");
        arguments[arguments.ToList().IndexOf("--permission-prompt-tool") + 1].ShouldBe("stdio");
        arguments.TakeLast(2).ShouldBe(new[] { "--append-system-prompt", "persona" });
        arguments.ShouldNotContain("--resume");
    }

    [Fact]
    public void Arguments_resume_the_saved_session()
    {
        ChatProtocol.Arguments("persona", "715acc71-a19a-4a1d-972a-6a1323a30934").TakeLast(2)
            .ShouldBe(new[] { "--resume", "715acc71-a19a-4a1d-972a-6a1323a30934" });
    }

    [Fact]
    public void Arguments_keep_a_persona_with_quotes_and_newlines_as_one_argument()
    {
        const string persona = "Dice \"hola\"\ny se va";

        ChatProtocol.Arguments(persona, null).Count(argument => argument == persona).ShouldBe(1);
    }

    [Fact]
    public void ChatKey_ignores_case_and_trailing_separator()
    {
        ChatProtocol.ChatKey("toji", @"C:\Mis repos\Ñandú\").ShouldBe(ChatProtocol.ChatKey("toji", @"c:\mis repos\ñandú"));
    }

    [Fact]
    public void ChatKey_differs_by_character()
    {
        ChatProtocol.ChatKey("toji", @"C:\repo").ShouldNotBe(ChatProtocol.ChatKey("itachi", @"C:\repo"));
    }

    [Theory]
    [InlineData("2.1.300 (Claude Code)\n", "2.1.300")]
    [InlineData("2.2.0", "2.2.0")]
    public void ParseVersion_reads_the_leading_version(string output, string expected)
    {
        ChatProtocol.ParseVersion(output).ShouldBe(Version.Parse(expected));
    }

    [Theory]
    [InlineData("")]
    [InlineData("claude: command not found")]
    public void ParseVersion_is_null_for_anything_else(string output)
    {
        ChatProtocol.ParseVersion(output).ShouldBeNull();
    }

    [Fact]
    public void PickClaude_takes_the_newest_at_or_above_the_minimum()
    {
        var picked = ChatProtocol.PickClaude([("old", new Version(2, 1, 293)), ("ok", new Version(2, 1, 300)), ("new", new Version(2, 2, 1)), ("broken", null)]);

        picked.ShouldBe("new");
    }

    [Fact]
    public void PickClaude_is_null_when_every_candidate_is_too_old()
    {
        ChatProtocol.PickClaude([("old", new Version(2, 1, 299)), ("broken", null)]).ShouldBeNull();
    }

    [Fact]
    public void UserMessage_wraps_the_text_unchanged()
    {
        var message = Json(ChatProtocol.UserMessage("¿Qué tal, ñandú?\n\"hola\""));

        message["type"]!.GetValue<string>().ShouldBe("user");
        message["message"]!["role"]!.GetValue<string>().ShouldBe("user");
        message["message"]!["content"]!.GetValue<string>().ShouldBe("¿Qué tal, ñandú?\n\"hola\"");
    }

    [Fact]
    public void InterruptRequest_is_a_control_request()
    {
        var request = Json(ChatProtocol.InterruptRequest("int-1"));

        request["type"]!.GetValue<string>().ShouldBe("control_request");
        request["request_id"]!.GetValue<string>().ShouldBe("int-1");
        request["request"]!["subtype"]!.GetValue<string>().ShouldBe("interrupt");
    }

    [Fact]
    public void PermissionResponse_denies_with_the_message()
    {
        var request = ChatProtocol.PermissionRequestOf(ProbeRequest)!;

        var response = Json(ChatProtocol.PermissionResponse(request, PermissionDecision.Deny, "Sin respuesta del usuario."))["response"]!;

        response["subtype"]!.GetValue<string>().ShouldBe("success");
        response["request_id"]!.GetValue<string>().ShouldBe("8a22400d");
        response["response"]!["behavior"]!.GetValue<string>().ShouldBe("deny");
        response["response"]!["message"]!.GetValue<string>().ShouldBe("Sin respuesta del usuario.");
    }

    [Fact]
    public void PermissionResponse_allows_with_the_original_input()
    {
        var request = ChatProtocol.PermissionRequestOf(ProbeRequest)!;

        var inner = Json(ChatProtocol.PermissionResponse(request, PermissionDecision.Allow, "unused"))["response"]!["response"]!;

        inner["behavior"]!.GetValue<string>().ShouldBe("allow");
        inner["updatedInput"]!["file_path"]!.GetValue<string>().ShouldBe(@"C:\work\hola.txt");
        inner["updatedPermissions"].ShouldBeNull();
    }

    [Fact]
    public void PermissionResponse_allows_session_edits_with_the_suggestions()
    {
        var request = ChatProtocol.PermissionRequestOf(ProbeRequest)!;

        var inner = Json(ChatProtocol.PermissionResponse(request, PermissionDecision.AllowSessionEdits, "unused"))["response"]!["response"]!;

        inner["behavior"]!.GetValue<string>().ShouldBe("allow");
        inner["updatedPermissions"]![0]!["mode"]!.GetValue<string>().ShouldBe("acceptEdits");
    }

    [Fact]
    public void InitSessionId_reads_the_init_event()
    {
        ChatProtocol.InitSessionId("""{"type":"system","subtype":"init","session_id":"715acc71"}""").ShouldBe("715acc71");
    }

    [Theory]
    [InlineData("""{"type":"system","subtype":"hook_started","session_id":"715acc71"}""")]
    [InlineData("""{"type":"result","session_id":"715acc71"}""")]
    [InlineData("hola")]
    [InlineData("42")]
    [InlineData("[1]")]
    [InlineData("""{"type":""")]
    public void InitSessionId_is_null_for_anything_else(string line)
    {
        ChatProtocol.InitSessionId(line).ShouldBeNull();
    }

    [Fact]
    public void PermissionRequestOf_reads_the_probe_request()
    {
        var request = ChatProtocol.PermissionRequestOf(ProbeRequest)!;

        request.RequestId.ShouldBe("8a22400d");
        request.Description.ShouldBe("hola.txt");
        request.Input!["content"]!.GetValue<string>().ShouldBe("hola");
        request.Suggestions!.AsArray().Count.ShouldBe(1);
    }

    [Theory]
    [InlineData("""{"type":"control_request","request_id":"int-1","request":{"subtype":"interrupt"}}""")]
    [InlineData("""{"type":"control_request","request":{"subtype":"can_use_tool","tool_name":"Write"}}""")]
    [InlineData("""{"type":"control_request","request_id":"x","request":[1]}""")]
    [InlineData("[1]")]
    [InlineData("hola")]
    public void PermissionRequestOf_is_null_for_anything_else(string line)
    {
        ChatProtocol.PermissionRequestOf(line).ShouldBeNull();
    }

    [Fact]
    public void ChatTarget_takes_the_current_character_and_its_menu_label()
    {
        using var request = JsonDocument.Parse("""{"type":"menu","current":"itachi","characters":[{"id":"toji","label":"Toji Fushiguro"},{"id":"itachi","label":"Itachi Uchiha"}]}""");

        ChatProtocol.ChatTarget(request.RootElement).ShouldBe(("itachi", "Itachi Uchiha"));
    }

    [Fact]
    public void ChatTarget_falls_back_to_the_id_without_a_label()
    {
        using var request = JsonDocument.Parse("""{"type":"menu","current":"blob","characters":[{"id":"toji","label":"Toji Fushiguro"}]}""");

        ChatProtocol.ChatTarget(request.RootElement).ShouldBe(("blob", "blob"));
    }

    [Fact]
    public void ChatTarget_defaults_to_the_blob_when_nothing_is_current()
    {
        using var request = JsonDocument.Parse("""{"type":"menu","current":null,"characters":[]}""");

        ChatProtocol.ChatTarget(request.RootElement).ShouldBe(("blob", "blob"));
    }

    [Fact]
    public void History_keeps_texts_and_tool_names_in_order()
    {
        string[] transcript =
        [
            """{"type":"user","message":{"role":"user","content":"revisá el test"}}""",
            """{"type":"assistant","message":{"content":[{"type":"thinking","thinking":""},{"type":"text","text":"Hmph. Lo miro."},{"type":"tool_use","id":"t1","name":"Read","input":{}}]}}""",
            """{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"..."}]}}""",
            """{"type":"user","isMeta":true,"message":{"role":"user","content":"<command-name>/clear</command-name>"}}""",
            """{"type":"summary","summary":"x"}""",
            "not json",
            """{"type":"assistant","message":{"content":[{"type":"text","text":"Listo."}]}}""",
        ];

        ChatProtocol.History(transcript).ShouldBe(new[]
        {
            new HistoryItem("user", "revisá el test"),
            new HistoryItem("assistant", "Hmph. Lo miro."),
            new HistoryItem("tool", "Read"),
            new HistoryItem("assistant", "Listo."),
        });
    }
}
