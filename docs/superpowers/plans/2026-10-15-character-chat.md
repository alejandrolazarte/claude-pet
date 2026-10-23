# Conversar con el personaje — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde **Hablar** en el menú del pet se abre una ventana de chat con el personaje elegido, respaldada por una sesión de Claude Code independiente (`claude -p` con `stream-json`) que puede actuar en una carpeta y pregunta los permisos en el chat y en un globo del pet.

**Architecture:** C# lanza `claude` como proceso hijo y reenvía cada línea JSON, sin interpretarla, a una página React nueva (`chat.html`). Allí un reducer puro arma la conversación y calcula el estado del pet. Las piezas puras de C# (argumentos, mensajes del protocolo, historial, `chats.json`, cola de permisos) van en clases propias con tests xUnit + Shouldly. La E/S con el proceso real se prueba a mano.

**Tech Stack:** .NET 10 WPF + WebView2, React 19 + TypeScript + Vite 6 + vitest 4, xUnit 2.9 + Shouldly 4.3, Claude Code CLI ≥ 2.1.300.

**Spec:** `docs/superpowers/specs/2026-10-15-character-chat-design.md`

## Global Constraints

- Versión mínima del CLI para la charla: **2.1.300** (`ChatProtocol.MinimumClaude`). Con una más vieja, la charla muestra un error y no lanza nada.
- Flags de `claude`, en este orden: `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-mode manual --permission-prompt-tool stdio --append-system-prompt <personalidad>`, más `--resume <id>` al reanudar.
- Modo de permisos **siempre `manual`**, nunca el del usuario. Sin respuesta en **2 minutos**, se deniega con "Sin respuesta del usuario.".
- Sesión del pet de la charla: `%TEMP%\claude-pet\chat-<personaje>.json`, con `sessionId` `chat-<personaje>` y `repo` `<carpeta> · chat`.
- `chats.json`: `%LOCALAPPDATA%\claude-pet\chats.json`, con `{ "sessions": { "<personaje>|<carpeta en minúsculas>": "<session-id>" }, "lastFolder": "<carpeta>" }`.
- Una sola charla abierta a la vez.
- El texto del personaje se muestra como texto plano (React lo escapa), nunca como HTML.
- Comentarios del código en inglés; textos de la interfaz en español rioplatense, como el resto del repo.
- Finales de línea CRLF en los archivos nuevos (el repo los guarda en LF con `core.autocrlf=true`).
- Commits: Conventional Commits en español con scope (`feat(pet-overlay): …`), terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin AB#: es un repo personal.
- No se toca `.github/workflows/ci.yml` (el token de `gh` no tiene `workflow`). El paso de CI para `overlay.Tests` va como propuesta en la descripción de la PR.

## Review Focus

1. **Carpeta con espacios o acentos, y personalidad con comillas o saltos de línea** (`C:\Mis repos\ñandú`, `Dice "hola"\ny se va`): llegan a `claude` como un único argumento cada uno, sin romper el comando. Lo fija la prueba `Arguments_keep_a_persona_with_quotes_and_newlines_as_one_argument` y `ChatKey_ignores_case_and_trailing_separator` (Tarea 2); los argumentos van por `ProcessStartInfo.ArgumentList`, nunca armados a mano (Tarea 5).
2. **Cerrar la charla con una pregunta pendiente:** se deniega, el globo del pet desaparece y el pet no queda en "te pregunta". Lo fija `TakeAll_empties_the_queue` (Tarea 3) y el paso 6 de la prueba de punta a punta de la Tarea 6.
3. **Mandar un mensaje mientras el personaje trabaja:** **Enviar** pasa a **Detener** hasta el `result`. Lo fija `stays busy from the user message until the result` (Tarea 4).
4. **Líneas del proceso que no son un objeto JSON** (`hola`, `42`, `[1]`, JSON cortado): se ignoran sin romper nada, ni en C# ni en la página. Lo fijan `InitSessionId_is_null_for_anything_else` y `PermissionRequestOf_is_null_for_anything_else` (Tarea 2), y `ignores lines that are not a JSON object` (Tarea 4).
5. **`chat-ready` dos veces** (React en modo estricto monta dos veces en desarrollo): se lanza un solo proceso `claude`. Lo fija la guarda `if (_host is not null) return;` de `StartClaude` y el paso 4 de la prueba de punta a punta de la Tarea 5, que cuenta los procesos hijos.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `overlay/ChatProtocol.cs` (nuevo) | Funciones puras: personalidad, argumentos, clave, versión, mensajes `stream-json`, lectura del historial. |
| `overlay/PermissionBroker.cs` (nuevo) | Cola de preguntas pendientes: la primera respuesta gana, vencimiento a los 2 minutos. |
| `overlay/ChatStore.cs` (nuevo) | Lee y escribe `chats.json`. |
| `overlay/ChatHost.cs` (nuevo) | Un proceso `claude`: lanzarlo, leer líneas, escribir, cerrarlo. |
| `overlay/ChatWindow.cs` (nuevo) | La ventana **Hablar**: une página de chat, proceso, cola de permisos, globo del pet y sesión del pet. |
| `overlay/Program.cs` | Menú **Hablar**, `permission-answer`, cierre de la charla con el pet, accesores `internal`. |
| `overlay.Tests/` (nuevo) | Proyecto xUnit + Shouldly para las tres clases puras. |
| `overlay/web/chat.html` (nuevo) | Segunda página. |
| `overlay/web/vite.config.ts` | Dos entradas de build. |
| `overlay/web/src/vite-env.d.ts` (nuevo) | Tipos de Vite (`?raw` para el fixture). |
| `overlay/web/src/chat/json.ts` (nuevo) | `parseLine`, `isJson`, `text`. |
| `overlay/web/src/chat/types.ts` (nuevo) | Tipos de la conversación. |
| `overlay/web/src/chat/chatReducer.ts` (nuevo) | Reducer de la conversación y resúmenes de herramientas. |
| `overlay/web/src/chat/petMood.ts` (nuevo) | Evento → estado del pet. |
| `overlay/web/src/chat/chatBridge.ts` (nuevo) | Mensajes entre la página de chat y C#. |
| `overlay/web/src/chat/ChatApp.tsx`, `main.tsx`, `chat.css` (nuevos) | La interfaz del chat. |
| `overlay/web/src/chat/fixtures/session.jsonl` (nuevo) | Sesión real grabada en la Tarea 1. |
| `overlay/web/src/permissions.ts` (nuevo) | Cola de preguntas del globo del pet. |
| `overlay/web/src/App.tsx`, `bridge.ts`, `styles.css` | Globo de permiso del pet. |
| `overlay/README.md`, `README.md` | Documentación. |

---

### Task 1: Validar el protocolo y grabar el fixture

Prueba de usar y tirar (el script no se commitea) que confirma lo que la spec deja sin verificar —permitir, permitir ediciones en la charla e interrumpir— y graba una sesión real, saneada, que usan los tests de la Tarea 4. **Requiere que el usuario apruebe ejecutarla**: aprueba escrituras de `claude` dentro de una carpeta temporal vacía.

**Files:**
- Create: `overlay/web/src/chat/fixtures/session.jsonl`
- Modify: `docs/superpowers/specs/2026-10-15-character-chat-design.md` (sección "Protocolo verificado")

**Interfaces:**
- Produces: `session.jsonl`, una línea JSON por evento del proceso; las líneas que mandó el host empiezan con `>>> `.

- [ ] **Step 1: Crear una carpeta de trabajo nueva fuera del repo**

```bash
P="$TEMP/claude-pet-probe-$(date +%s)"; mkdir -p "$P/cwd"; echo "$P"
```

- [ ] **Step 2: Escribir el script de la prueba en `$P/probe.mjs`**

```js
// Throwaway probe: records real stream-json lines for allow, allow-session-edits and interrupt.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'

const [claude, cwd, out] = process.argv.slice(2)
const child = spawn(claude, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--include-partial-messages', '--permission-mode', 'manual', '--permission-prompt-tool', 'stdio',
  '--model', 'haiku', '--no-session-persistence', '--append-system-prompt', 'Hablas como Toji Fushiguro. Frases cortas.'],
  { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
const escaped = JSON.stringify(cwd).slice(1, -1)
// The fixture is committed: no local paths, and system events reduced to the init's session id.
const sanitize = line => line.split(escaped).join('C:\\\\work').split(cwd.replaceAll('\\', '/')).join('C:/work')
const lines = []
const send = obj => { const line = JSON.stringify(obj); lines.push('>>> ' + sanitize(line)); child.stdin.write(line + '\n') }
const user = text => send({ type: 'user', message: { role: 'user', content: text } })
let results = 0
createInterface({ input: child.stdout }).on('line', line => {
  let m
  try { m = JSON.parse(line) } catch { lines.push(sanitize(line)); return }
  if (m.type === 'system') {
    if (m.subtype === 'init') lines.push(JSON.stringify({ type: 'system', subtype: 'init', session_id: m.session_id }))
    return
  }
  if (m.type === 'rate_limit_event') return
  lines.push(sanitize(line))
  if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
    const r = m.request
    console.log('ASK', r.tool_name, JSON.stringify(r.permission_suggestions))
    const response = results === 0
      ? { behavior: 'allow', updatedInput: r.input }
      : { behavior: 'allow', updatedInput: r.input, updatedPermissions: r.permission_suggestions }
    send({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response } })
  } else if (m.type === 'control_response') {
    console.log('CONTROL_RESPONSE', JSON.stringify(m).slice(0, 200))
  } else if (m.type === 'result') {
    results++
    console.log('RESULT', results, m.subtype)
    if (results === 1) user('Ahora crea b.txt con "b" y luego c.txt con "c", usando Write.')
    else if (results === 2) {
      user('Contá despacio del 1 al 200, un número por línea.')
      setTimeout(() => send({ type: 'control_request', request_id: 'int-1', request: { subtype: 'interrupt' } }), 2500)
    } else child.stdin.end()
  }
})
child.on('exit', code => { console.log('EXIT', code); writeFileSync(out, lines.join('\n') + '\n') })
user('Crea a.txt con el texto "a" usando Write.')
setTimeout(() => { console.log('TIMEOUT'); child.kill() }, 150000)
```

- [ ] **Step 3: Ejecutarla**

```bash
cd "$P/cwd" && node "$P/probe.mjs" "$(command -v claude || echo "$HOME/.local/bin/claude.exe")" "$P/cwd" "$P/session.jsonl"; ls "$P/cwd"
```

Esperado:
- Un `ASK Write` para `a.txt`.
- `RESULT 1 success`.
- Un `ASK Write` para `b.txt` con la sugerencia `acceptEdits`, y **ningún** `ASK` para `c.txt`, porque ya se permitieron las ediciones de la charla.
- `RESULT 2 success`.
- `CONTROL_RESPONSE` del interrupt y `RESULT 3` con un subtype distinto de `success`.
- `EXIT 0`.
- En `$P/cwd` quedan `a.txt`, `b.txt` y `c.txt`.

- [ ] **Step 4: Si algo no coincide, ajustar antes de seguir**

| Si falla… | Hacer |
|---|---|
| `a.txt` no se crea | Probar `response: { behavior: 'allow' }` sin `updatedInput`, y anotar la forma que funcione. |
| `c.txt` también pregunta | Probar `updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]` escrito a mano, y anotar la forma que funcione. |
| El interrupt no corta | Anotar qué devuelve y pasar `chat-interrupt` a "cerrar y reanudar" en la Tarea 5 (`Restart(resume: true)`). |

En cualquiera de los tres casos, cambiar `ChatProtocol.PermissionResponse` o `InterruptRequest` en la Tarea 2 para que coincida con lo anotado.

- [ ] **Step 5: Revisar el saneado y copiar el fixture**

```bash
grep -c "rodrigo\|Users\\\\\\\\" "$P/session.jsonl"   # esperado: 0
mkdir -p /c/_woffu/repositories/claude-pet/overlay/web/src/chat/fixtures
cp "$P/session.jsonl" /c/_woffu/repositories/claude-pet/overlay/web/src/chat/fixtures/session.jsonl
```

Si el `grep` encuentra algo, ampliar `sanitize` y repetir el paso 3.

- [ ] **Step 6: Actualizar "Protocolo verificado" en la spec**

Reemplazar el párrafo que empieza con "**Sin verificar:**" por lo que se comprobó, por ejemplo:

```markdown
**Verificado también** (Tarea 1 del plan, `claude` <versión>): permitir responde `{"behavior":"allow","updatedInput": <input>}`; permitir ediciones en la charla agrega `"updatedPermissions": <permission_suggestions>` y las siguientes ediciones de la sesión ya no preguntan; el interrupt (`{"type":"control_request","request_id":"…","request":{"subtype":"interrupt"}}`) recibe un `control_response` y el turno termina con un `result` de subtype `<el que salió>`.
```

- [ ] **Step 7: Commit**

```bash
cd /c/_woffu/repositories/claude-pet
git add overlay/web/src/chat/fixtures/session.jsonl docs/superpowers/specs/2026-10-15-character-chat-design.md
git commit -m "test(pet-overlay): sesión real de claude stream-json como fixture de la charla" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Proyecto de tests de C# y `ChatProtocol`

**Files:**
- Create: `overlay.Tests/overlay.Tests.csproj`
- Create: `overlay.Tests/ChatProtocolTests.cs`
- Create: `overlay/ChatProtocol.cs`

**Interfaces:**
- Produces (namespace `PetOverlay`):
  - `enum PermissionDecision { Allow, AllowSessionEdits, Deny }`
  - `record HistoryItem(string Kind, string Text)`: `Kind` es `"user"`, `"assistant"` o `"tool"`.
  - `record PermissionRequest(string RequestId, string Description, JsonNode? Input, JsonNode? Suggestions)`
  - `static class ChatProtocol`:
    - `Version MinimumClaude`
    - `string BlobName`
    - `string PersonaPrompt(string name, string? persona)`
    - `IReadOnlyList<string> Arguments(string personaPrompt, string? resumeSessionId)`
    - `string ChatKey(string characterId, string folder)`
    - `Version? ParseVersion(string output)`
    - `string? PickClaude(IEnumerable<(string Path, Version? Version)> candidates)`
    - `string UserMessage(string text)`
    - `string InterruptRequest(string requestId)`
    - `string PermissionResponse(PermissionRequest request, PermissionDecision decision, string denyMessage)`
    - `string? InitSessionId(string line)`
    - `PermissionRequest? PermissionRequestOf(string line)`
    - `IReadOnlyList<HistoryItem> History(IEnumerable<string> transcriptLines)`

- [ ] **Step 1: Crear el proyecto de tests**

`overlay.Tests/overlay.Tests.csproj` (fuera de `overlay/`, para que `PetOverlay.csproj` no compile los tests):

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0-windows10.0.17763.0</TargetFramework>
    <UseWPF>true</UseWPF>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.14.1" />
    <PackageReference Include="xunit" Version="2.9.3" />
    <PackageReference Include="xunit.runner.visualstudio" Version="3.1.1" />
    <PackageReference Include="Shouldly" Version="4.3.0" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\overlay\PetOverlay.csproj" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Escribir los tests que fallan**

`overlay.Tests/ChatProtocolTests.cs`:

```csharp
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

        prompt.ShouldStartWith("Hablas como Toji Fushiguro. ");
        prompt.ShouldContain("tiene que ser exacto");
    }

    [Fact]
    public void PersonaPrompt_replaces_the_first_sentence_with_the_persona()
    {
        var prompt = ChatProtocol.PersonaPrompt("Toji Fushiguro", "  Toji: mercenario seco e irónico.  ");

        prompt.ShouldStartWith("Toji: mercenario seco e irónico. Mantén");
        prompt.ShouldNotContain("Hablas como");
    }

    [Fact]
    public void PersonaPrompt_treats_a_blank_persona_as_missing()
    {
        ChatProtocol.PersonaPrompt("Itachi Uchiha", "   ").ShouldStartWith("Hablas como Itachi Uchiha.");
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
```

- [ ] **Step 3: Ver que fallan**

Run: `dotnet test overlay.Tests/overlay.Tests.csproj`
Esperado: FAIL de compilación, "The name 'ChatProtocol' does not exist". Si `dotnet restore` falla por el CredentialProvider de NuGet, restaurar con el MSBuild de Visual Studio como en `publish.ps1`.

- [ ] **Step 4: Implementar `overlay/ChatProtocol.cs`**

```csharp
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
```

- [ ] **Step 5: Ver que pasan**

Run: `dotnet test overlay.Tests/overlay.Tests.csproj`
Esperado: PASS, 33 tests.

- [ ] **Step 6: Commit**

```bash
git add overlay.Tests/overlay.Tests.csproj overlay.Tests/ChatProtocolTests.cs overlay/ChatProtocol.cs
git commit -m "feat(pet-overlay): protocolo de la charla con claude stream-json y sus tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `PermissionBroker` y `ChatStore`

**Files:**
- Create: `overlay.Tests/PermissionBrokerTests.cs`, `overlay.Tests/ChatStoreTests.cs`
- Create: `overlay/PermissionBroker.cs`, `overlay/ChatStore.cs`

**Interfaces:**
- Consumes: `PermissionRequest` (Tarea 2).
- Produces:
  - `sealed class PermissionBroker`:
    - `static TimeSpan Timeout`
    - `void Ask(PermissionRequest request, DateTime now)`
    - `PermissionRequest? Take(string requestId)`
    - `IReadOnlyList<PermissionRequest> TakeExpired(DateTime now)`
    - `IReadOnlyList<PermissionRequest> TakeAll()`
  - `sealed class ChatStore(string path)`:
    - `string? SessionFor(string key)`
    - `void Save(string key, string sessionId)`
    - `void Forget(string key)`
    - `string? LastFolder`
    - `void SaveLastFolder(string folder)`

- [ ] **Step 1: Escribir los tests que fallan**

`overlay.Tests/PermissionBrokerTests.cs`:

```csharp
using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public class PermissionBrokerTests
{
    private static readonly DateTime Asked = new(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);

    private static PermissionRequest Request(string id) => new(id, "hola.txt", null, null);

    [Fact]
    public void Take_answers_once_so_the_second_surface_finds_nothing()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("a"), Asked);

        broker.Take("a").ShouldNotBeNull();
        broker.Take("a").ShouldBeNull();
    }

    [Fact]
    public void Take_is_null_for_an_unknown_question()
    {
        new PermissionBroker().Take("nope").ShouldBeNull();
    }

    [Fact]
    public void TakeExpired_waits_the_full_two_minutes()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("a"), Asked);

        broker.TakeExpired(Asked + PermissionBroker.Timeout - TimeSpan.FromSeconds(1)).ShouldBeEmpty();
        broker.TakeExpired(Asked + PermissionBroker.Timeout).Select(r => r.RequestId).ShouldBe(new[] { "a" });
        broker.Take("a").ShouldBeNull();
    }

    [Fact]
    public void TakeExpired_leaves_newer_questions()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("old"), Asked);
        broker.Ask(Request("new"), Asked + TimeSpan.FromMinutes(1));

        broker.TakeExpired(Asked + PermissionBroker.Timeout).Select(r => r.RequestId).ShouldBe(new[] { "old" });
        broker.Take("new").ShouldNotBeNull();
    }

    [Fact]
    public void TakeAll_empties_the_queue()
    {
        var broker = new PermissionBroker();
        broker.Ask(Request("a"), Asked);
        broker.Ask(Request("b"), Asked);

        broker.TakeAll().Select(r => r.RequestId).OrderBy(id => id).ShouldBe(new[] { "a", "b" });
        broker.TakeAll().ShouldBeEmpty();
    }
}
```

`overlay.Tests/ChatStoreTests.cs`:

```csharp
using System.IO;
using Shouldly;
using Xunit;

namespace PetOverlay.Tests;

public sealed class ChatStoreTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"claude-pet-chats-{Guid.NewGuid()}", "chats.json");

    public void Dispose()
    {
        var folder = Path.GetDirectoryName(_path)!;
        if (Directory.Exists(folder))
        {
            Directory.Delete(folder, recursive: true);
        }
    }

    [Fact]
    public void A_missing_file_has_nothing_saved()
    {
        var store = new ChatStore(_path);

        store.SessionFor("toji|c:\\repo").ShouldBeNull();
        store.LastFolder.ShouldBeNull();
    }

    [Fact]
    public void Saved_sessions_and_folder_survive_a_new_store()
    {
        new ChatStore(_path).Save("toji|c:\\repo", "715acc71");
        new ChatStore(_path).SaveLastFolder(@"C:\Repo");

        var reopened = new ChatStore(_path);
        reopened.SessionFor("toji|c:\\repo").ShouldBe("715acc71");
        reopened.LastFolder.ShouldBe(@"C:\Repo");
    }

    [Fact]
    public void Forget_removes_only_that_session()
    {
        var store = new ChatStore(_path);
        store.Save("toji|c:\\repo", "a");
        store.Save("itachi|c:\\repo", "b");

        store.Forget("toji|c:\\repo");

        store.SessionFor("toji|c:\\repo").ShouldBeNull();
        store.SessionFor("itachi|c:\\repo").ShouldBe("b");
    }

    [Fact]
    public void A_broken_file_starts_over()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, "{ not json");
        var store = new ChatStore(_path);

        store.SessionFor("toji|c:\\repo").ShouldBeNull();
        store.Save("toji|c:\\repo", "a");
        store.SessionFor("toji|c:\\repo").ShouldBe("a");
    }
}
```

- [ ] **Step 2: Ver que fallan**

Run: `dotnet test overlay.Tests/overlay.Tests.csproj`
Esperado: FAIL de compilación, "The type or namespace name 'PermissionBroker' could not be found".

- [ ] **Step 3: Implementar `overlay/PermissionBroker.cs`**

```csharp
namespace PetOverlay;

// Questions waiting for an answer from the chat or from the pet's bubble. The first answer takes the question, so a
// second one (the other surface, or a click after the timeout) finds nothing to answer.
public sealed class PermissionBroker
{
    public static readonly TimeSpan Timeout = TimeSpan.FromMinutes(2);

    private readonly Dictionary<string, (PermissionRequest Request, DateTime AskedAt)> _pending = [];

    public void Ask(PermissionRequest request, DateTime now) => _pending[request.RequestId] = (request, now);

    public PermissionRequest? Take(string requestId) => _pending.Remove(requestId, out var entry) ? entry.Request : null;

    public IReadOnlyList<PermissionRequest> TakeExpired(DateTime now)
    {
        var expired = _pending.Values.Where(entry => now - entry.AskedAt >= Timeout).Select(entry => entry.Request).ToList();
        expired.ForEach(request => _pending.Remove(request.RequestId));

        return expired;
    }

    public IReadOnlyList<PermissionRequest> TakeAll()
    {
        var all = _pending.Values.Select(entry => entry.Request).ToList();
        _pending.Clear();

        return all;
    }
}
```

- [ ] **Step 4: Implementar `overlay/ChatStore.cs`**

```csharp
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PetOverlay;

// chats.json: the Claude session each character has in each folder, and the last folder picked.
public sealed class ChatStore(string path)
{
    public string? SessionFor(string key) => Read()["sessions"] is JsonObject sessions ? Text(sessions[key]) : null;

    public void Save(string key, string sessionId) => Update(json => Sessions(json)[key] = sessionId);

    public void Forget(string key) => Update(json => Sessions(json).Remove(key));

    public string? LastFolder => Text(Read()["lastFolder"]);

    public void SaveLastFolder(string folder) => Update(json => json["lastFolder"] = folder);

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
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, json.ToJsonString());
    }

    private JsonObject Read()
    {
        try
        {
            return File.Exists(path) && JsonNode.Parse(File.ReadAllText(path)) is JsonObject json ? json : [];
        }
        catch (Exception exception) when (exception is IOException or JsonException)
        {
            // A broken file starts over: the chats are just not resumed.
            return [];
        }
    }

    private static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
}
```

- [ ] **Step 5: Ver que pasan**

Run: `dotnet test overlay.Tests/overlay.Tests.csproj`
Esperado: PASS, 42 tests.

- [ ] **Step 6: Commit**

```bash
git add overlay.Tests/PermissionBrokerTests.cs overlay.Tests/ChatStoreTests.cs overlay/PermissionBroker.cs overlay/ChatStore.cs
git commit -m "feat(pet-overlay): cola de permisos de la charla y chats.json" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reducer de la conversación y estado del pet (TypeScript)

**Files:**
- Create: `overlay/web/src/vite-env.d.ts`
- Create: `overlay/web/src/chat/json.ts`, `types.ts`, `chatReducer.ts`, `petMood.ts`
- Test: `overlay/web/src/chat/chatReducer.test.ts`, `overlay/web/src/chat/petMood.test.ts`

**Interfaces:**
- Consumes: `fixtures/session.jsonl` (Tarea 1) y `activityOf(tool, input): PetState` de `plugin/hooks/activity.ts`.
- Produces:
  - `json.ts`:
    - `type Json = Record<string, unknown>`
    - `isJson(value: unknown): value is Json`
    - `text(value: unknown): string`
    - `parseLine(line: string): Json | undefined`
  - `types.ts`: `Decision`, `ChatItem`, `ChatState` (definidos abajo).
  - `chatReducer.ts`:
    - `ChatAction`
    - `initialChat: ChatState`
    - `chatReducer(state: ChatState, action: ChatAction): ChatState`
    - `toolSummary(name: string, input: Json): string`
    - `permissionDetail(name: string, input: Json, description: string): string`
  - `petMood.ts`:
    - `PetMood = { mood: Mood; label: string }`
    - `SENT_MOOD`, `IDLE_MOOD`, `CELEBRATE_MS`
    - `moodOfLine(line: string): PetMood | undefined`

- [ ] **Step 1: Tipos de Vite para el fixture**

`overlay/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Escribir los tests que fallan**

`overlay/web/src/chat/chatReducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { chatReducer, initialChat, type ChatAction } from './chatReducer'
import fixture from './fixtures/session.jsonl?raw'

const line = (value: unknown): ChatAction => ({ type: 'line', line: JSON.stringify(value) })
const run = (actions: ChatAction[]) => actions.reduce(chatReducer, initialChat)
const delta = (text: string) =>
  line({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })
const assistantText = (text: string) => line({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const toolUse = (name: string, input: Record<string, unknown>) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_1', name, input }] } })
const ask = (requestId: string, tool: string, input: Record<string, unknown>, suggestions: unknown[] = []) =>
  line({
    type: 'control_request',
    request_id: requestId,
    request: { subtype: 'can_use_tool', tool_name: tool, input, description: 'hola.txt', permission_suggestions: suggestions },
  })
const result = (subtype = 'success') => line({ type: 'result', subtype, is_error: subtype !== 'success', result: 'listo' })
const acceptEdits = { type: 'setMode', mode: 'acceptEdits', destination: 'session' }

describe('chatReducer', () => {
  it('keeps the session id from the init event', () => {
    // Act
    const state = run([line({ type: 'system', subtype: 'init', session_id: '715acc71' })])

    // Assert
    expect(state.sessionId).toBe('715acc71')
  })

  it('shows text as it arrives and replaces it with the final message', () => {
    // Act
    const streaming = run([delta('Hmph. '), delta('Lo')])
    const done = chatReducer(streaming, assistantText('Hmph. Lo miro.'))

    // Assert
    expect(streaming.draft).toBe('Hmph. Lo')
    expect(done.draft).toBe('')
    expect(done.items).toEqual([{ kind: 'assistant', text: 'Hmph. Lo miro.' }])
  })

  it('shows a tool as one compact line', () => {
    // Act
    const state = run([toolUse('Read', { file_path: 'C:\\repo\\src\\foo.ts' }), toolUse('Bash', { command: 'npm test' })])

    // Assert
    expect(state.items).toEqual([
      { kind: 'tool', id: 'toolu_1', name: 'Read', summary: 'foo.ts' },
      { kind: 'tool', id: 'toolu_1', name: 'Bash', summary: '$ npm test' },
    ])
  })

  it('stays busy from the user message until the result', () => {
    // Act
    const sent = run([{ type: 'sent', text: 'revisá el test' }])
    const working = chatReducer(chatReducer(sent, delta('Hmph')), toolUse('Read', { file_path: 'a.ts' }))
    const finished = chatReducer(working, result())

    // Assert
    expect(sent.items).toEqual([{ kind: 'user', text: 'revisá el test' }])
    expect([sent.busy, working.busy, finished.busy]).toEqual([true, true, false])
  })

  it('turns a permission request into a pending card, with the edits option only when offered', () => {
    // Act
    const state = run([ask('r1', 'Write', { file_path: 'C:\\work\\a.txt', content: 'a' }, [acceptEdits]), ask('r2', 'Bash', { command: 'git push' })])

    // Assert
    expect(state.items).toEqual([
      { kind: 'permission', requestId: 'r1', tool: 'Write', detail: 'C:\\work\\a.txt\na', canAllowEdits: true },
      { kind: 'permission', requestId: 'r2', tool: 'Bash', detail: '$ git push', canAllowEdits: false },
    ])
  })

  it('shows the file and the change for an edit request', () => {
    // Act
    const state = run([ask('r1', 'Edit', { file_path: 'C:\\repo\\foo.ts', old_string: 'viejo', new_string: 'nuevo' })])

    // Assert
    expect(state.items[0]).toMatchObject({ detail: 'C:\\repo\\foo.ts\n- viejo\n+ nuevo' })
  })

  it('marks a card answered, and only that one', () => {
    // Arrange
    const asked = run([ask('r1', 'Write', { file_path: 'a' }), ask('r2', 'Write', { file_path: 'b' })])

    // Act
    const state = chatReducer(asked, { type: 'answered', requestId: 'r2', decision: 'deny' })

    // Assert
    expect(state.items.map(item => (item.kind === 'permission' ? item.answer : undefined))).toEqual([undefined, 'deny'])
  })

  it('says so when the turn ends early, as after Detener', () => {
    // Act
    const state = run([{ type: 'sent', text: 'contá' }, delta('1\n2'), result('error_during_execution')])

    // Assert
    expect(state.busy).toBe(false)
    expect(state.draft).toBe('')
    expect(state.items.slice(1)).toEqual([
      { kind: 'assistant', text: '1\n2' },
      { kind: 'notice', text: 'Se detuvo antes de terminar.' },
    ])
  })

  it('ignores lines that are not a JSON object', () => {
    // Act
    const state = run(['hola', '42', '[1]', '{"type":'].map(text => ({ type: 'line', line: text })))

    // Assert
    expect(state).toBe(initialChat)
  })

  it('replays a recorded session to the end', () => {
    // Arrange
    const lines = fixture.split('\n').filter(text => text && !text.startsWith('>>> '))

    // Act
    const state = run(lines.map(text => ({ type: 'line', line: text })))

    // Assert
    expect(state.sessionId).toBeTruthy()
    expect(state.busy).toBe(false)
    expect(state.draft).toBe('')
    expect(state.items.some(item => item.kind === 'assistant')).toBe(true)
    expect(state.items.filter(item => item.kind === 'permission').length).toBeGreaterThanOrEqual(2)
  })
})
```

`overlay/web/src/chat/petMood.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { moodOfLine } from './petMood'

const json = (value: unknown) => JSON.stringify(value)

describe('moodOfLine', () => {
  it('asks the user while a permission is pending', () => {
    // Act
    const mood = moodOfLine(json({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', description: 'hola.txt' } }))

    // Assert
    expect(mood).toEqual({ mood: 'asking', label: 'te pregunta: hola.txt' })
  })

  it('labels tools like the mod does', () => {
    // Act
    const mood = moodOfLine(json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'C:\\repo\\foo.ts' } }] } }))

    // Assert
    expect(mood).toEqual({ mood: 'working', label: 'editando foo.ts' })
  })

  it('celebrates a finished turn and calms down after a stopped one', () => {
    // Act
    const finished = moodOfLine(json({ type: 'result', subtype: 'success' }))
    const stopped = moodOfLine(json({ type: 'result', subtype: 'error_during_execution' }))

    // Assert
    expect(finished).toEqual({ mood: 'happy', label: 'listo' })
    expect(stopped).toEqual({ mood: 'idle', label: 'detenido' })
  })

  it('leaves the mood alone for plain text and broken lines', () => {
    // Act
    const moods = [moodOfLine(json({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hmph.' }] } })), moodOfLine('hola'), moodOfLine('[1]')]

    // Assert
    expect(moods).toEqual([undefined, undefined, undefined])
  })
})
```

- [ ] **Step 3: Ver que fallan**

Run: `cd overlay/web && npx vitest run src/chat`
Esperado: FAIL, "Failed to resolve import './chatReducer'".

- [ ] **Step 4: Implementar `json.ts`, `types.ts`, `chatReducer.ts`, `petMood.ts`**

`overlay/web/src/chat/json.ts`:

```ts
export type Json = Record<string, unknown>

export const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

export const text = (value: unknown): string => (typeof value === 'string' ? value : '')

// Only objects count: claude's stream is one JSON object per line, anything else is noise.
export function parseLine(line: string): Json | undefined {
  try {
    const value: unknown = JSON.parse(line)

    return isJson(value) ? value : undefined
  } catch {
    return undefined
  }
}
```

`overlay/web/src/chat/types.ts`:

```ts
export type Decision = 'allow' | 'allow-session-edits' | 'deny'

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string }
  | { kind: 'permission'; requestId: string; tool: string; detail: string; canAllowEdits: boolean; answer?: Decision }
  | { kind: 'notice'; text: string }

export type ChatState = { items: ChatItem[]; draft: string; busy: boolean; sessionId?: string }
```

`overlay/web/src/chat/chatReducer.ts`:

```ts
import { isJson, parseLine, text, type Json } from './json'
import type { ChatItem, ChatState, Decision } from './types'

export type ChatAction =
  | { type: 'line'; line: string }
  | { type: 'sent'; text: string }
  | { type: 'answered'; requestId: string; decision: Decision }
  | { type: 'reset'; items: ChatItem[] }
  | { type: 'exit'; code: number }

export const initialChat: ChatState = { items: [], draft: '', busy: false }

const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value)

export function toolSummary(name: string, input: Json): string {
  if (typeof input.command === 'string') {
    return `$ ${clip(input.command, 120)}`
  }
  const path = input.file_path ?? input.notebook_path ?? input.path
  if (typeof path === 'string') {
    return fileName(path)
  }
  if (typeof input.pattern === 'string') {
    return input.pattern
  }

  return typeof input.url === 'string' ? input.url : name
}

export function permissionDetail(name: string, input: Json, description: string): string {
  if (typeof input.command === 'string') {
    return `$ ${input.command}`
  }
  if (name === 'Edit' && typeof input.file_path === 'string') {
    return `${input.file_path}\n- ${clip(text(input.old_string), 600)}\n+ ${clip(text(input.new_string), 600)}`
  }
  if (name === 'Write' && typeof input.file_path === 'string') {
    return `${input.file_path}\n${clip(text(input.content), 600)}`
  }

  return description
}

// Text still streaming becomes a message of its own when something else interrupts it.
function flush(state: ChatState): ChatState {
  return state.draft ? { ...state, items: [...state.items, { kind: 'assistant', text: state.draft }], draft: '' } : state
}

function onLine(state: ChatState, line: string): ChatState {
  const event = parseLine(line)
  if (!event) {
    console.warn('chat: ignoring a line that is not a JSON object', line.slice(0, 200))

    return state
  }

  switch (event.type) {
    case 'system':
      return event.subtype === 'init' && typeof event.session_id === 'string' ? { ...state, sessionId: event.session_id } : state
    case 'stream_event': {
      const inner = isJson(event.event) ? event.event : {}
      const delta = isJson(inner.delta) ? inner.delta : {}

      return inner.type === 'content_block_delta' && delta.type === 'text_delta' ? { ...state, draft: state.draft + text(delta.text) } : state
    }
    case 'assistant': {
      const message = isJson(event.message) ? event.message : {}
      const blocks = Array.isArray(message.content) ? message.content.filter(isJson) : []
      let next = state
      for (const block of blocks) {
        if (block.type === 'text' && text(block.text).trim()) {
          next = { ...next, items: [...next.items, { kind: 'assistant', text: text(block.text) }], draft: '' }
        } else if (block.type === 'tool_use') {
          const name = text(block.name)
          const summary = toolSummary(name, isJson(block.input) ? block.input : {})
          const flushed = flush(next)
          next = { ...flushed, items: [...flushed.items, { kind: 'tool', id: text(block.id), name, summary }] }
        }
      }

      return next
    }
    case 'control_request': {
      const request = isJson(event.request) ? event.request : {}
      if (request.subtype !== 'can_use_tool' || typeof event.request_id !== 'string') {
        return state
      }
      const tool = text(request.tool_name)
      const input = isJson(request.input) ? request.input : {}
      const suggestions = Array.isArray(request.permission_suggestions) ? request.permission_suggestions.filter(isJson) : []
      const card: ChatItem = {
        kind: 'permission',
        requestId: event.request_id,
        tool,
        detail: permissionDetail(tool, input, text(request.description) || tool),
        canAllowEdits: suggestions.some(suggestion => suggestion.type === 'setMode' && suggestion.mode === 'acceptEdits'),
      }
      const flushed = flush(state)

      return { ...flushed, items: [...flushed.items, card] }
    }
    case 'result': {
      const flushed = flush(state)
      const notice: ChatItem[] = event.subtype === 'success' ? [] : [{ kind: 'notice', text: 'Se detuvo antes de terminar.' }]

      return { ...flushed, busy: false, items: [...flushed.items, ...notice] }
    }
    default:
      return state
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'sent':
      return { ...state, items: [...state.items, { kind: 'user', text: action.text }], busy: true }
    case 'answered':
      return {
        ...state,
        items: state.items.map(item =>
          item.kind === 'permission' && item.requestId === action.requestId ? { ...item, answer: action.decision } : item,
        ),
      }
    case 'reset':
      return { ...initialChat, items: action.items }
    case 'exit': {
      const flushed = flush(state)

      return { ...flushed, busy: false, items: [...flushed.items, { kind: 'notice', text: `La sesión terminó (código ${action.code}).` }] }
    }
    case 'line':
      return onLine(state, action.line)
  }
}
```

`overlay/web/src/chat/petMood.ts`:

```ts
import { activityOf } from '../../../../plugin/hooks/activity'
import type { Mood } from '../sessions'
import { isJson, parseLine, text } from './json'

export type PetMood = { mood: Mood; label: string }

export const SENT_MOOD: PetMood = { mood: 'thinking', label: 'pensando' }
export const IDLE_MOOD: PetMood = { mood: 'idle', label: 'esperando' }
// Like the mod's celebration after a turn.
export const CELEBRATE_MS = 4000

export function moodOfLine(line: string): PetMood | undefined {
  const event = parseLine(line)
  if (!event) {
    return undefined
  }
  if (event.type === 'control_request') {
    const request = isJson(event.request) ? event.request : {}

    return request.subtype === 'can_use_tool'
      ? { mood: 'asking', label: `te pregunta: ${text(request.description) || text(request.tool_name)}` }
      : undefined
  }
  if (event.type === 'assistant') {
    const message = isJson(event.message) ? event.message : {}
    const blocks = Array.isArray(message.content) ? message.content.filter(isJson) : []
    const tool = blocks.findLast(block => block.type === 'tool_use')

    return tool ? activityOf(text(tool.name), isJson(tool.input) ? tool.input : {}) : undefined
  }
  if (event.type === 'result') {
    return event.subtype === 'success' ? { mood: 'happy', label: 'listo' } : { mood: 'idle', label: 'detenido' }
  }

  return undefined
}
```

- [ ] **Step 5: Ver que pasan, y que el build acepta el import del plugin**

Run: `cd overlay/web && npm test && npm run build`
Esperado: PASS de todos los tests (45 anteriores + 14 nuevos) y build sin errores. Si `tsc` se queja de `plugin/types/index.d.ts` (`declare module 'claude-code'`), confirmar que `skipLibCheck` sigue en `true` en `overlay/web/tsconfig.json`: ese archivo es una declaración y no se chequea.

- [ ] **Step 6: Commit**

```bash
git add overlay/web/src/vite-env.d.ts overlay/web/src/chat/json.ts overlay/web/src/chat/types.ts overlay/web/src/chat/chatReducer.ts overlay/web/src/chat/petMood.ts overlay/web/src/chat/chatReducer.test.ts overlay/web/src/chat/petMood.test.ts
git commit -m "feat(pet-overlay): reducer de la charla y estado del pet a partir de stream-json" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ventana **Hablar**: proceso, página de chat y sesión del pet

**Files:**
- Create: `overlay/ChatHost.cs`, `overlay/ChatWindow.cs`
- Create: `overlay/web/chat.html`, `overlay/web/src/chat/chatBridge.ts`, `ChatApp.tsx`, `main.tsx`, `chat.css`
- Modify: `overlay/Program.cs` (accesores, menú, cierre), `overlay/web/vite.config.ts`

**Interfaces:**
- Consumes: Tareas 2–4.
- Produces:
  - `ChatHost`:
    - `static ChatHost Start(string claudePath, string folder, IReadOnlyList<string> arguments, Dispatcher dispatcher)`
    - `event Action<string>? Line`, `event Action<int>? Exited`
    - `void Send(string jsonLine)`, `void Close()`
  - `ChatWindow`:
    - `static ChatWindow? Current`
    - `static void Open(Window pet, WebView2CompositionControl petView, string characterId, string label, string personaPrompt)`
    - `void Answer(string requestId, PermissionDecision decision)`
    - `static void CloseCurrent()`
  - `Program`: `internal static string SettingsFolder`, `SessionsFolder`, `ProjectsFolder` y `internal const string Host`.

- [ ] **Step 1: Accesores `internal` en `Program.cs`**

Después de la línea `private static readonly Dictionary<string, string> _transcripts = [];`, agregar:

```csharp
    internal const string Host = _host;
    internal static string SettingsFolder => _settingsFolder;
    internal static string SessionsFolder => _sessionsFolder;
    internal static string ProjectsFolder => _projectsFolder;
```

- [ ] **Step 2: `overlay/ChatHost.cs`**

```csharp
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
```

- [ ] **Step 3: `overlay/ChatWindow.cs`**

```csharp
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;

namespace PetOverlay;

// The "Hablar" window: a chat page wired to one claude process, with its permission questions mirrored on the pet.
public sealed class ChatWindow
{
    private const string _denied = "El usuario lo denegó.";
    private const string _noAnswer = "Sin respuesta del usuario.";

    private readonly Window _window;
    private readonly WebView2 _chat = new();
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
    private bool _resumed;
    private bool _sawInit;
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
        _window = new Window { Title = $"{label} · {folder}", Width = 520, Height = 680, Content = _chat };
        _window.Loaded += async (_, _) =>
        {
            // Same data folder and options as the pet's WebView2, so both share one browser process.
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(Program.SettingsFolder, "webview2"));
            await _chat.EnsureCoreWebView2Async(environment);
            var core = _chat.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.SetVirtualHostNameToFolderMapping(
                Program.Host, Path.Combine(AppContext.BaseDirectory, "web"), CoreWebView2HostResourceAccessKind.Allow);
            core.WebMessageReceived += (_, e) => OnChatMessage(e.WebMessageAsJson);
            core.Navigate($"https://{Program.Host}/chat.html");
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

    public static void Open(Window pet, WebView2CompositionControl petView, string characterId, string label, string personaPrompt)
    {
        if (Current is not null)
        {
            Current._window.Activate();
            return;
        }

        var store = new ChatStore(Path.Combine(Program.SettingsFolder, "chats.json"));
        var picker = new OpenFolderDialog { Title = $"¿En qué carpeta trabaja {label}?" };
        if (store.LastFolder is { } last && Directory.Exists(last))
        {
            picker.InitialDirectory = last;
        }
        if (picker.ShowDialog(pet) != true)
        {
            return;
        }

        store.SaveLastFolder(picker.FolderName);
        Current = new ChatWindow(petView, characterId, label, personaPrompt, picker.FolderName, store);
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

    private void StartClaude(bool resume, string? notice = null)
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
        _resumed = resumeId is not null;
        _sawInit = false;
        IReadOnlyList<HistoryItem> history = resumeId is null ? [] : ChatProtocol.History(ReadTranscript(resumeId));
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
        _host.Close();
        _host = null;
    }

    private void OnLine(string line)
    {
        if (ChatProtocol.InitSessionId(line) is { } sessionId)
        {
            _sawInit = true;
            _store.Save(_key, sessionId);
        }
        if (ChatProtocol.PermissionRequestOf(line) is { } request)
        {
            _broker.Ask(request, DateTime.UtcNow);
            PostPet(new JsonObject { ["type"] = "permission", ["requestId"] = request.RequestId, ["description"] = $"{_label}: {request.Description}" });
        }
        PostChat(new JsonObject { ["type"] = "chat-event", ["line"] = line });
    }

    private void OnExited(int code)
    {
        if (_closing)
        {
            return;
        }

        var resumeFailed = _resumed && !_sawInit && code != 0;
        StopClaude();
        // A resume that dies before the session starts means its transcript is gone: start over.
        if (resumeFailed)
        {
            _store.Forget(_key);
            StartClaude(resume: false, notice: "No pude reanudar la conversación anterior; empiezo una nueva.");
            return;
        }

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
        Current = null;
    }

    private JsonObject Init(IReadOnlyList<HistoryItem> history, string? notice, string? error)
    {
        var items = new JsonArray();
        for (var i = 0; i < history.Count; i++)
        {
            var item = history[i];
            items.Add(item.Kind == "tool"
                ? new JsonObject { ["kind"] = "tool", ["id"] = $"h{i}", ["name"] = item.Text, ["summary"] = item.Text }
                : new JsonObject { ["kind"] = item.Kind, ["text"] = item.Text });
        }

        return new JsonObject
        {
            ["type"] = "chat-init",
            ["character"] = _characterId,
            ["label"] = _label,
            ["folder"] = _folder,
            ["history"] = items,
            ["notice"] = notice,
            ["error"] = error,
        };
    }

    private void WriteSession(string mood, string label)
    {
        var name = Path.GetFileName(Path.TrimEndingDirectorySeparator(_folder));
        var session = new JsonObject
        {
            ["sessionId"] = $"chat-{_characterId}",
            ["repo"] = $"{(name.Length > 0 ? name : _folder)} · chat",
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

    private static IEnumerable<string> ReadTranscript(string sessionId)
    {
        // The id came from our own chats.json, but it still only becomes part of a path as a GUID.
        if (!Guid.TryParse(sessionId, out _) || !Directory.Exists(Program.ProjectsFolder))
        {
            return [];
        }

        var path = Directory.EnumerateDirectories(Program.ProjectsFolder)
            .Select(project => Path.Combine(project, $"{sessionId}.jsonl"))
            .FirstOrDefault(File.Exists);
        try
        {
            return path is null ? [] : File.ReadAllLines(path);
        }
        catch (IOException)
        {
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
```

- [ ] **Step 4: Menú **Hablar** y cierre en `Program.cs`**

En `ShowMenu`, justo antes de `var caption = request.GetProperty("caption").GetString();`, agregar:

```csharp
        var talk = new MenuItem { Header = "Hablar" };
        talk.Click += (_, _) => OpenChat(window, webView, request.Clone());
```

En la armada del menú, cambiar:

```csharp
        menu.Items.Add(characters);
        menu.Items.Add(show);
```

por:

```csharp
        menu.Items.Add(characters);
        menu.Items.Add(talk);
        menu.Items.Add(show);
```

Agregar el método, debajo de `ShowMenu`:

```csharp
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
```

`request.Clone()` hace falta porque el `JsonDocument` del mensaje se libera al salir de `OnPageMessage`, antes del clic.

En `Main`, reemplazar `new Application().Run(window);` por:

```csharp
        // The chat window would otherwise keep the app alive after the pet is closed.
        window.Closed += (_, _) => ChatWindow.CloseCurrent();
        new Application { ShutdownMode = ShutdownMode.OnMainWindowClose }.Run(window);
```

- [ ] **Step 5: Segunda página en Vite**

`overlay/web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Two pages from one bundle: the pet and the "Hablar" chat. Relative to the root (overlay/web).
  build: { rollupOptions: { input: { main: 'index.html', chat: 'chat.html' } } },
})
```

`overlay/web/chat.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <!-- What claude prints and what its tools read are untrusted: no inline script or handler may run. -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'" />
    <title>Hablar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/chat/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Mensajes de la página de chat**

`overlay/web/src/chat/chatBridge.ts`:

```ts
import type { Mood } from '../sessions'
import type { ChatItem, Decision } from './types'

export type ChatHostMessage =
  | { type: 'chat-init'; character: string; label: string; folder: string; history: ChatItem[]; notice: string | null; error: string | null }
  | { type: 'chat-event'; line: string }
  | { type: 'chat-exit'; code: number }
  | { type: 'chat-permission-done'; requestId: string; decision: Decision }

export type ChatPageMessage =
  | { type: 'chat-ready' }
  | { type: 'chat-send'; text: string }
  | { type: 'chat-permission'; requestId: string; decision: Decision }
  | { type: 'chat-interrupt' }
  | { type: 'chat-new' }
  | { type: 'chat-resume' }
  | { type: 'chat-mood'; mood: Mood; label: string }

type ChatWebView = {
  postMessage: (message: ChatPageMessage) => void
  addEventListener: (type: 'message', listener: (event: { data: ChatHostMessage }) => void) => void
  removeEventListener: (type: 'message', listener: (event: { data: ChatHostMessage }) => void) => void
}

// The same window.chrome.webview as the pet page (declared in bridge.ts), typed with the chat's own messages.
const webview = () => window.chrome?.webview as unknown as ChatWebView | undefined

export const sendChat = (message: ChatPageMessage) => webview()?.postMessage(message)

export function onChatHostMessage(listener: (message: ChatHostMessage) => void): () => void {
  const view = webview()
  const handle = (event: { data: ChatHostMessage }) => listener(event.data)
  view?.addEventListener('message', handle)

  return () => view?.removeEventListener('message', handle)
}
```

- [ ] **Step 7: La interfaz del chat**

`overlay/web/src/chat/ChatApp.tsx`:

```tsx
import { useEffect, useReducer, useRef, useState } from 'react'

import { onChatHostMessage, sendChat } from './chatBridge'
import { chatReducer, initialChat } from './chatReducer'
import { CELEBRATE_MS, IDLE_MOOD, moodOfLine, SENT_MOOD, type PetMood } from './petMood'
import type { ChatItem, Decision } from './types'

const ANSWER_TEXT: Record<Decision, string> = {
  allow: 'Permitido',
  'allow-session-edits': 'Permitido, con las ediciones de esta charla',
  deny: 'Denegado',
}

function Item({ item, label, onAnswer }: { item: ChatItem; label: string; onAnswer: (requestId: string, decision: Decision) => void }) {
  switch (item.kind) {
    case 'user':
      return <p className="user">{item.text}</p>
    case 'assistant':
      return (
        <p className="assistant">
          <b>{label}:</b> {item.text}
        </p>
      )
    case 'tool':
      return (
        <p className="tool">
          [{item.name}] {item.summary}
        </p>
      )
    case 'notice':
      return <p className="notice">{item.text}</p>
    case 'permission':
      return (
        <div className="permission">
          <div>
            {label} quiere usar <b>{item.tool}</b>:
          </div>
          <pre>{item.detail}</pre>
          {item.answer ? (
            <div className="answer">{ANSWER_TEXT[item.answer]}</div>
          ) : (
            <div className="buttons">
              <button onClick={() => onAnswer(item.requestId, 'allow')}>Permitir</button>
              {item.canAllowEdits && (
                <button onClick={() => onAnswer(item.requestId, 'allow-session-edits')}>Permitir ediciones en esta charla</button>
              )}
              <button onClick={() => onAnswer(item.requestId, 'deny')}>Denegar</button>
            </div>
          )}
        </div>
      )
  }
}

export function ChatApp() {
  const [state, dispatch] = useReducer(chatReducer, initialChat)
  const [header, setHeader] = useState<{ label: string; folder: string }>()
  const [error, setError] = useState<string | null>(null)
  const [exited, setExited] = useState(false)
  const [draftText, setDraftText] = useState('')
  const celebrate = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reportMood = (mood: PetMood) => {
      clearTimeout(celebrate.current)
      sendChat({ type: 'chat-mood', ...mood })
      if (mood.mood === 'happy') {
        celebrate.current = setTimeout(() => sendChat({ type: 'chat-mood', ...IDLE_MOOD }), CELEBRATE_MS)
      }
    }
    const stop = onChatHostMessage(message => {
      switch (message.type) {
        case 'chat-init':
          setHeader({ label: message.label, folder: message.folder })
          setError(message.error)
          setExited(false)
          dispatch({ type: 'reset', items: message.notice ? [...message.history, { kind: 'notice', text: message.notice }] : message.history })
          reportMood(IDLE_MOOD)
          break
        case 'chat-event': {
          dispatch({ type: 'line', line: message.line })
          const mood = moodOfLine(message.line)
          if (mood) {
            reportMood(mood)
          }
          break
        }
        case 'chat-permission-done':
          dispatch({ type: 'answered', requestId: message.requestId, decision: message.decision })
          reportMood(SENT_MOOD)
          break
        case 'chat-exit':
          setExited(true)
          dispatch({ type: 'exit', code: message.code })
          break
      }
    })
    sendChat({ type: 'chat-ready' })

    return () => {
      stop()
      clearTimeout(celebrate.current)
    }
  }, [])

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [state.items, state.draft])

  const closed = Boolean(error) || exited
  const submit = () => {
    const message = draftText.trim()
    if (!message || state.busy || closed) {
      return
    }
    dispatch({ type: 'sent', text: message })
    sendChat({ type: 'chat-send', text: message })
    // A pending "listo → esperando" would otherwise overwrite "pensando".
    clearTimeout(celebrate.current)
    sendChat({ type: 'chat-mood', ...SENT_MOOD })
    setDraftText('')
  }
  const answer = (requestId: string, decision: Decision) => sendChat({ type: 'chat-permission', requestId, decision })
  const label = header?.label ?? ''

  return (
    <div className="chat">
      <header>
        <strong>{label || '…'}</strong>
        <span className="folder">{header?.folder}</span>
        <button onClick={() => sendChat({ type: 'chat-new' })} disabled={!header || Boolean(error)}>
          Nueva conversación
        </button>
      </header>
      <main>
        {error && <p className="error">{error}</p>}
        {state.items.map((item, index) => (
          <Item key={index} item={item} label={label} onAnswer={answer} />
        ))}
        {state.draft && (
          <p className="assistant">
            <b>{label}:</b> {state.draft}
          </p>
        )}
        {exited && (
          <button className="resume" onClick={() => sendChat({ type: 'chat-resume' })}>
            Reanudar
          </button>
        )}
        <div ref={bottom} />
      </main>
      <footer>
        <textarea
          value={draftText}
          placeholder={`Escribile a ${label || 'tu personaje'}…`}
          disabled={closed}
          onChange={event => setDraftText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {state.busy ? (
          <button onClick={() => sendChat({ type: 'chat-interrupt' })}>Detener</button>
        ) : (
          <button onClick={submit} disabled={!draftText.trim() || closed}>
            Enviar
          </button>
        )}
      </footer>
    </div>
  )
}
```

`overlay/web/src/chat/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ChatApp } from './ChatApp'
import './chat.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatApp />
  </StrictMode>,
)
```

`overlay/web/src/chat/chat.css`:

```css
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1d1d1f;
  --muted: #6e6e73;
  --line: #e2e2e6;
  --user: #e8f0fe;
  --card: #fff7e6;
  --accent: #d97757;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e20;
    --fg: #f2f2f2;
    --muted: #a1a1a6;
    --line: #38383c;
    --user: #233350;
    --card: #3a3020;
  }
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
}

.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}

header .folder {
  flex: 1;
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

main {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

main p {
  margin: 0 0 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.user {
  margin-left: 15%;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--user);
}

.tool,
.notice {
  color: var(--muted);
  font-size: 12px;
}

.tool {
  font-family: Consolas, monospace;
}

.error {
  color: #e5484d;
}

.permission {
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--card);
}

.permission pre {
  max-height: 160px;
  overflow: auto;
  margin: 6px 0;
  font-size: 12px;
  white-space: pre-wrap;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.answer {
  color: var(--muted);
  font-size: 12px;
}

footer {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--line);
}

footer textarea {
  flex: 1;
  height: 56px;
  resize: none;
  font: inherit;
}

button {
  cursor: pointer;
}
```

- [ ] **Step 8: Compilar y correr los tests**

Run:

```bash
cd overlay/web && npm test && npm run build && ls dist && cd ../.. && dotnet build overlay/PetOverlay.csproj -c Release && dotnet test overlay.Tests/overlay.Tests.csproj
```

Esperado:
- `npm test`: PASS.
- `dist/` tiene `index.html` y `chat.html`.
- Las dos compilaciones de C#, sin warnings.
- `dotnet test`: PASS, 42 tests.

- [ ] **Step 9: Prueba de punta a punta, parte 1 (sin permisos)**

Con la ventana instalada cerrada (clic derecho → **Cerrar**), abrir el build de desarrollo `overlay/bin/Release/net10.0-windows10.0.17763.0/PetOverlay.exe`. Elegir a Toji y hacer clic derecho → **Hablar** → una carpeta temporal nueva, sin archivos de valor.

1. Escribir "Presentate en una frase." → el texto aparece mientras se escribe, con el tono de Toji. El pet muestra "<carpeta> · chat", pasa por pensando y queda en listo y después esperando.
2. Escribir "Contá del 1 al 300, uno por línea." y pulsar **Detener** a mitad → se corta y aparece "Se detuvo antes de terminar.".
3. Cerrar la ventana de chat y volver a **Hablar** con la misma carpeta → el historial aparece y "¿Qué te pedí recién?" responde sobre lo anterior.
4. Contar los procesos `claude` hijos del pet: tiene que haber uno solo.

   ```powershell
   $pet = (Get-Process PetOverlay).Id; @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$pet AND Name='claude.exe'").Count
   ```

5. **Nueva conversación** → la lista queda vacía y "¿Qué te pedí recién?" ya no lo sabe.
6. Cerrar la ventana del pet con el chat abierto → se cierran las dos, y el pet de la charla desaparece de la lista de sesiones.

- [ ] **Step 10: Commit**

```bash
git add overlay/ChatHost.cs overlay/ChatWindow.cs overlay/Program.cs overlay/web/vite.config.ts overlay/web/chat.html overlay/web/src/chat/chatBridge.ts overlay/web/src/chat/ChatApp.tsx overlay/web/src/chat/main.tsx overlay/web/src/chat/chat.css
git commit -m "feat(pet-overlay): ventana Hablar con una sesión de claude y la personalidad del personaje" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Globo de permiso en el pet

**Files:**
- Create: `overlay/web/src/permissions.ts`
- Test: `overlay/web/src/permissions.test.ts`
- Modify: `overlay/web/src/bridge.ts`, `overlay/web/src/App.tsx`, `overlay/web/src/styles.css`, `overlay/Program.cs`

**Interfaces:**
- Consumes: `ChatWindow.Current?.Answer(string, PermissionDecision)` (Tarea 5) y los mensajes `permission` y `permission-done` que manda `ChatWindow`.
- Produces:
  - `Question = { requestId: string; description: string }`
  - `questionsAfter(questions: readonly Question[], message: QuestionMessage): Question[]`
  - Mensaje de la página del pet: `permission-answer {requestId, decision: 'allow' | 'deny'}`.

- [ ] **Step 1: Escribir el test que falla**

`overlay/web/src/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { questionsAfter } from './permissions'

const asked = { type: 'permission', requestId: 'r1', description: 'Toji: hola.txt' } as const

describe('questionsAfter', () => {
  it('queues a new question', () => {
    // Act
    const questions = questionsAfter([], asked)

    // Assert
    expect(questions).toEqual([{ requestId: 'r1', description: 'Toji: hola.txt' }])
  })

  it('ignores a question already in the queue', () => {
    // Act
    const questions = questionsAfter(questionsAfter([], asked), asked)

    // Assert
    expect(questions).toHaveLength(1)
  })

  it('drops a question answered anywhere, and nothing else', () => {
    // Arrange
    const two = questionsAfter(questionsAfter([], asked), { type: 'permission', requestId: 'r2', description: 'Toji: b.txt' })

    // Act
    const questions = questionsAfter(two, { type: 'permission-done', requestId: 'r1' })

    // Assert
    expect(questions.map(question => question.requestId)).toEqual(['r2'])
  })

  it('leaves the queue alone for an unknown answer', () => {
    // Arrange
    const one = questionsAfter([], asked)

    // Act
    const questions = questionsAfter(one, { type: 'permission-done', requestId: 'nope' })

    // Assert
    expect(questions).toEqual(one)
  })
})
```

- [ ] **Step 2: Ver que falla**

Run: `cd overlay/web && npx vitest run src/permissions.test.ts`
Esperado: FAIL, "Failed to resolve import './permissions'".

- [ ] **Step 3: Implementar `overlay/web/src/permissions.ts`**

```ts
export type Question = { requestId: string; description: string }

export type QuestionMessage = { type: 'permission'; requestId: string; description: string } | { type: 'permission-done'; requestId: string }

// The pet's bubble shows the oldest open question; an answer from the chat or the bubble closes it in both.
export function questionsAfter(questions: readonly Question[], message: QuestionMessage): Question[] {
  if (message.type === 'permission-done') {
    return questions.filter(question => question.requestId !== message.requestId)
  }

  return questions.some(question => question.requestId === message.requestId)
    ? [...questions]
    : [...questions, { requestId: message.requestId, description: message.description }]
}
```

- [ ] **Step 4: Ver que pasa**

Run: `cd overlay/web && npx vitest run src/permissions.test.ts`
Esperado: PASS, 4 tests.

- [ ] **Step 5: Mensajes nuevos en `bridge.ts`**

En `HostMessage`, agregar al final:

```ts
  | { type: 'permission'; requestId: string; description: string }
  | { type: 'permission-done'; requestId: string }
```

En `PageMessage`, agregar al final:

```ts
  | { type: 'permission-answer'; requestId: string; decision: 'allow' | 'deny' }
```

- [ ] **Step 6: El globo en `App.tsx`**

Agregar el import:

```ts
import { questionsAfter, type Question } from './permissions'
```

Junto a los otros `useState`:

```ts
  const [questions, setQuestions] = useState<Question[]>([])
```

En el `onHostMessage` del primer `useEffect`, reemplazar el final de la cadena de `if … else if`:

```ts
        setCustomCharacters(message.characters.map(({ id, label }) => ({ id, label })))
      }
```

por:

```ts
        setCustomCharacters(message.characters.map(({ id, label }) => ({ id, label })))
      } else if (message.type === 'permission' || message.type === 'permission-done') {
        setQuestions(current => questionsAfter(current, message))
      }
```

Dentro del `<div ref={pets} className="pets" …>`, como primer hijo:

```tsx
      {questions[0] && (
        // Stopped here: a press on the bubble must not start a drag or count as a tap on the pet.
        <div className="permission-bubble" onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()}>
          <span>{questions[0].description}</span>
          <div>
            <button onClick={() => send({ type: 'permission-answer', requestId: questions[0]!.requestId, decision: 'allow' })}>Permitir</button>
            <button onClick={() => send({ type: 'permission-answer', requestId: questions[0]!.requestId, decision: 'deny' })}>Denegar</button>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Estilo del globo en `styles.css`**

Agregar al final:

```css
.permission-bubble {
  box-sizing: border-box;
  max-width: 220px;
  padding: 6px 8px;
  border: 1px solid #d97757;
  border-radius: 10px;
  background: rgba(20, 20, 20, 0.88);
  color: #f2f2f2;
  font-size: 11px;
  line-height: 1.3;
  cursor: default;
}

.permission-bubble div {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.permission-bubble button {
  font-size: 11px;
  cursor: pointer;
}
```

- [ ] **Step 8: Recibir la respuesta en `Program.cs`**

En `OnPageMessage`, agregar un `case` junto a `"poke"`:

```csharp
            case "permission-answer":
                ChatWindow.Current?.Answer(
                    root.GetProperty("requestId").GetString() ?? "",
                    root.GetProperty("decision").GetString() == "allow" ? PermissionDecision.Allow : PermissionDecision.Deny);
                break;
```

- [ ] **Step 9: Compilar y correr todos los tests**

Run: `cd overlay/web && npm test && npm run build && cd ../.. && dotnet build overlay/PetOverlay.csproj -c Release && dotnet test overlay.Tests/overlay.Tests.csproj`
Esperado: todo en PASS y sin warnings.

- [ ] **Step 10: Prueba de punta a punta, parte 2 (permisos)**

Con el build de desarrollo y Toji en una carpeta temporal nueva:

1. "Creá hola.txt con el texto hola." → aparece una tarjeta en el chat y el globo sobre el pet; el pet queda en "te pregunta: hola.txt". **Permitir** desde el **globo** → la tarjeta del chat dice "Permitido", el globo desaparece y `hola.txt` existe.
2. "Creá chau.txt." → **Denegar** desde el **chat** → el globo desaparece, el personaje dice que no pudo y `chau.txt` no existe.
3. "Creá a.txt y después b.txt." → **Permitir ediciones en esta charla** en la primera → `b.txt` se crea sin preguntar.
4. "Corré `git status`." → la tarjeta muestra `$ git status`. No contestar durante 2 minutos → se deniega sola con "Sin respuesta del usuario." y el globo desaparece.
5. Hacer clic en los botones del globo no arrastra el pet ni hace el saltito del toque.
6. Pedir otra escritura y, con la pregunta abierta, cerrar la ventana del chat → el globo desaparece y el pet no queda en "te pregunta".

- [ ] **Step 11: Commit**

```bash
git add overlay/web/src/permissions.ts overlay/web/src/permissions.test.ts overlay/web/src/bridge.ts overlay/web/src/App.tsx overlay/web/src/styles.css overlay/Program.cs
git commit -m "feat(pet-overlay): globo de permiso de la charla sobre el pet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentación, ventana publicada y PR

**Files:**
- Modify: `overlay/README.md`, `README.md`
- Modify: `plugin/window/**` (publicado por `publish.ps1`)

- [ ] **Step 1: `overlay/README.md`**

En "Cómo está hecho", agregar después del punto de los mensajes de C# a la página:

```markdown
- **Hablar** (`ChatWindow.cs`): una segunda ventana con su propio `WebView2` que carga `chat.html` del mismo bundle. Lanza `claude -p` con `stream-json` en la carpeta elegida (`ChatHost.cs`) y le pasa cada línea a la página sin interpretarla; la conversación la arma `chatReducer` (`web/src/chat/`). Los permisos van en modo `manual` con `--permission-prompt-tool stdio`: cada pregunta llega como `control_request` y se contesta desde el chat o desde el globo del pet (gana la primera respuesta, `PermissionBroker.cs`; sin respuesta en 2 minutos, se deniega). La sesión guardada de cada personaje y carpeta vive en `%LOCALAPPDATA%\claude-pet\chats.json`, y el estado de la charla llega al pet como `%TEMP%\claude-pet\chat-<personaje>.json`.
```

En "Personajes", agregar un punto:

```markdown
- **Personalidad para Hablar** (`"persona": "…"`): reemplaza la primera frase del prompt de la charla ("Hablas como <nombre>."). Sin ella se usa el nombre del menú.
```

En "Uso", agregar después del punto del menú:

```markdown
- **Hablar** (en el menú): elegís una carpeta y se abre un chat con el personaje, que es una sesión de Claude Code completa con su personalidad. Puede leer, buscar, editar y correr comandos ahí; lo que tus reglas de permisos no permitan te lo pregunta en el chat y en un globo sobre el pet. Al volver a abrirlo con la misma carpeta, sigue la conversación; **Nueva conversación** empieza de cero.
```

- [ ] **Step 2: `README.md`**

En "Personajes", agregar al final del primer párrafo:

```markdown
Con clic derecho → **Hablar** abrís un chat con el personaje: una sesión de Claude Code aparte, con su personalidad, que trabaja en la carpeta que elijas y te pide permiso en el chat o en un globo sobre el bicho.
```

En la tabla de "Partes", cambiar la fila de `overlay/` a:

```markdown
| [`overlay/`](overlay/README.md) | El código de la ventana flotante: WPF + WebView2 con una app React adentro. Lee esos archivos y dibuja el personaje, y abre el chat de **Hablar**. |
```

Agregar una fila:

```markdown
| `overlay.Tests/` | Tests de la ventana (xUnit + Shouldly): `dotnet test overlay.Tests/overlay.Tests.csproj`. |
```

- [ ] **Step 3: Publicar la ventana**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File publish.ps1
```

Esperado: "Published to …\plugin\window". Después, normalizar `plugin/window/web/index.html` (Vite mezcla finales de línea) y comprobar que el diff solo cambia el nombre del bundle:

```bash
NEW=$(ls plugin/window/web/assets/ | grep -o 'index-[A-Za-z0-9_-]*\.js'); OLD=$(git show HEAD:plugin/window/web/index.html | grep -o 'index-[A-Za-z0-9_-]*\.js')
git show HEAD:plugin/window/web/index.html | sed "s/$OLD/$NEW/" > plugin/window/web/index.html
git status --short plugin/window
```

Esperado: cambian `PetOverlay.dll`, `PetOverlay.exe` y el bundle, y aparece `plugin/window/web/chat.html` con su `assets/chat-*.js`. Hacer lo mismo con `chat.html` si mezcla finales de línea: convertirlo a LF.

- [ ] **Step 4: Commits**

```bash
git add overlay/README.md README.md
git commit -m "docs(pet-overlay): Hablar con el personaje" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add -A plugin/window
git commit -m "chore(pet-overlay): republicar la ventana con Hablar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Subir y abrir la PR, previa confirmación del usuario**

Si `.github/workflows/ci.yml` cambió en `origin/main` desde el último commit del fork, apoyar la rama en un commit que el fork ya tenga, como en la PR #9.

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u fork feature/character-chat
gh pr create -R alejandrolazarte/claude-pet --base main --head rvaldez-woffu:feature/character-chat --title "feat(pet-overlay): Hablar con el personaje" --body-file "$TEMP/pr-character-chat.md"
```

`$TEMP/pr-character-chat.md` se escribe antes de este paso y lleva las secciones Summary, Changes, Test Plan (los pasos 9 y 10 de las Tareas 5 y 6) y "Azure Boards: no aplica", termina con la línea de Claude Code y propone el paso de CI que no se pudo subir:

```yaml
      - name: Window tests (xUnit)
        run: dotnet test overlay.Tests/overlay.Tests.csproj -c Release
```
