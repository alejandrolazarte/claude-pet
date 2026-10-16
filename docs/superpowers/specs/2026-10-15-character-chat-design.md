# Conversar con el personaje

- **Fecha:** 2026-10-15
- **Estado:** borrador para revisión
- **Alcance:** `overlay/` (ventana flotante y app React). El mod (`plugin/`) no cambia.

## Objetivo

Desde el menú del clic derecho (**Hablar**) se abre una ventana de chat con el personaje elegido. Detrás hay una sesión de Claude Code completa, independiente de las del usuario, que habla con la personalidad del personaje y puede leer, buscar, editar y correr comandos en una carpeta que el usuario elige. Lo que necesita permiso se pregunta en el chat y en un globo sobre el pet.

Está terminado cuando: se abre **Hablar**, se elige una carpeta y se le pide algo a Toji; la respuesta aparece mientras se escribe, con su voz; el pet se anima con lo que hace; una edición se aprueba o se deniega desde el globo; al cerrar y volver a abrir, la conversación sigue.

## Decisiones

| Tema | Decisión |
|---|---|
| Qué es | Un asistente que actúa: una sesión de Claude Code completa, no una charla sin herramientas. |
| Permisos | Las reglas `permissions.allow` del usuario pasan solas; todo lo demás se pregunta con **Permitir / Denegar**. Sin respuesta en 2 minutos, se deniega. |
| Carpeta | Se elige al abrir la charla (`OpenFolderDialog`), con la última usada preseleccionada. |
| Interfaz | Una ventana de chat aparte, redimensionable y en la barra de tareas. El pet sigue en su esquina. |
| Memoria | Una conversación por personaje y carpeta, que se reanuda; **Nueva conversación** empieza de cero. |
| Enfoque | La ventana lanza el CLI `claude` como proceso hijo con `stream-json`. Sin dependencias nuevas: el CLI ya es requisito del plugin. Se descartaron un proceso Node con el Agent SDK (exige Node) y llamar a la API directamente (reimplementar Claude Code y manejar claves). |
| Personalidad | `--append-system-prompt` generado a partir del nombre del personaje, o del campo opcional `persona` de `character.json`. |
| Modelo | El que el usuario tenga por defecto en Claude Code. |
| Charlas abiertas | Una a la vez. |

## Fuera de alcance

- Varias charlas a la vez, o una charla por sesión del usuario.
- Que el personaje comente solo lo que hacen las sesiones del usuario.
- Voz (texto a voz) y entrada por micrófono.
- Cambiar de carpeta sin cerrar la charla.
- Modo `--restricted` o de solo lectura.

## Protocolo verificado

Se probó con `claude` 2.1.300 en una carpeta vacía, pidiendo crear un archivo y denegándolo:

- Con el modo por defecto del usuario (`auto`), el clasificador aprueba solo y **no llega ninguna pregunta**: el archivo se creó.
- Con `--permission-mode manual` sin más, la CLI deniega directamente (`permission_denied`): no hay quien conteste.
- Con `--permission-mode manual --permission-prompt-tool stdio`, la pregunta llega por stdout y la respuesta por stdin:

```json
{"type":"control_request","request_id":"…","request":{"subtype":"can_use_tool","tool_name":"Write","display_name":"Write",
 "input":{"file_path":"…\\hola.txt","content":"hola"},"description":"hola.txt",
 "permission_suggestions":[{"type":"setMode","mode":"acceptEdits","destination":"session"}],"tool_use_id":"…"}}
```

```json
{"type":"control_response","response":{"subtype":"success","request_id":"…",
 "response":{"behavior":"deny","message":"El usuario lo denegó desde el pet."}}}
```

El modelo recibe el mensaje de la denegación y no reintenta. Los hooks globales del usuario corren también en esta sesión, y el mod no la sigue (ignora las sesiones `-p`).

**Verificado también** (Tarea 1 del plan, `claude` 2.1.300, con Haiku): permitir responde `{"behavior":"allow","updatedInput": <input>}` y el archivo se crea; permitir ediciones en la charla agrega `"updatedPermissions": <permission_suggestions>` y la siguiente escritura de la sesión ya no pregunta; el interrupt (`{"type":"control_request","request_id":"…","request":{"subtype":"interrupt"}}`) recibe `{"subtype":"success","response":{"still_queued":[]}}` y el turno termina con un `result` de subtipo `error_during_execution`. Al cerrar el stdin después de un turno interrumpido, el proceso sale con código 1. La sesión grabada está en `overlay/web/src/chat/fixtures/session.jsonl` (sin rutas locales ni los deltas `input_json_delta`).

## Componentes

1. **`overlay/ChatHost.cs`** gestiona un proceso `claude` por charla abierta:
   - Lo lanza en la carpeta elegida con `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-mode manual --permission-prompt-tool stdio --append-system-prompt "<personalidad>"`, más `--resume <id>` si ya hubo charla con ese personaje en esa carpeta.
   - Lee el stdout línea a línea en un hilo aparte y pasa cada línea al hilo de la UI. Escribe en el stdin los mensajes del usuario y las respuestas de permiso.
   - Busca `claude.exe` como `install.ps1`: el del PATH y, si no, el de la app de escritorio. `CLAUDE_PET_CLAUDE` fuerza otra ruta.
2. **Ventana de chat (WPF):** una segunda `Window` normal con un `WebView2` que carga `https://pet.local/chat.html` del mismo bundle. Vite pasa a generar dos páginas (`index.html` y `chat.html`).
3. **Página de chat (`overlay/web/src/chat/`):**
   - Lista de mensajes: los del usuario, los del personaje (que crecen mientras llega el texto) y las herramientas como líneas compactas (`[Read] foo.ts`).
   - Tarjetas de permiso con **Permitir**, **Permitir ediciones en esta charla** (solo si la pregunta trae esa sugerencia) y **Denegar**.
   - Cabecera con el nombre del personaje, la carpeta y **Nueva conversación**. Botón **Detener** mientras el personaje trabaja.
4. **El pet:**
   - C# escribe `%TEMP%\claude-pet\chat-<personaje>.json` con el mismo formato que el mod, así el pet muestra la charla como una sesión más ("Toji · chat") con sus prioridades de siempre. El `sessionId` es `chat-<personaje>`: como no es un GUID, la ventana no le busca título. `repo` es `<carpeta> · chat`, para no confundirla con una sesión propia del usuario en ese mismo repo.
   - Para las preguntas de permiso, la página del pet recibe un mensaje nuevo, `permission`, y dibuja un globo con **Permitir / Denegar** sobre el personaje.
5. **Persistencia:** `%LOCALAPPDATA%\claude-pet\chats.json`, con `{ "sessions": { "<personaje>|<carpeta en minúsculas>": "<session-id>" }, "lastFolder": "<carpeta>" }`.

## Flujo y ciclo de vida

C# es un conducto: reenvía cada línea JSON del proceso, sin interpretarla, a la página de chat. La conversación la arma una función pura en TypeScript, `chatReducer(estado, evento)`, que se puede testear con vitest.

**Página de chat → C#**

| Mensaje | Qué hace C# |
|---|---|
| `chat-ready` | Lanza el proceso y manda `chat-init`. |
| `chat-send {text}` | Escribe `{"type":"user","message":{"role":"user","content":…}}` en el stdin. |
| `chat-permission {requestId, decision}` | Responde la pregunta pendiente: `allow`, `allow-session-edits` o `deny`. |
| `chat-interrupt` | Manda un `control_request` con `subtype: "interrupt"`. |
| `chat-new` | Cierra el proceso, olvida el id de sesión de esa clave y vuelve a lanzar. |
| `chat-mood {mood, label}` | Escribe la sesión del pet. |

**C# → página de chat:** `chat-init {character, label, folder, history}`, `chat-event {line}` (la línea cruda) y `chat-exit {code}`.

**Página del pet ↔ C#:** C# manda `permission {requestId, description}` y `permission-done {requestId}`; la página responde `permission-answer {requestId, decision}`.

**Historial al reanudar:** `--resume` no vuelve a emitir lo ya hablado. C# lee el transcript de la sesión (`~/.claude/projects/<proyecto>/<id>.jsonl`, como ya hace para los títulos) y manda en `chat-init` un historial simplificado: textos del usuario, textos del personaje y nombres de herramientas.

**Estado del pet**, calculado por la página de chat:

| Evento | Estado |
|---|---|
| El usuario envía un mensaje | `thinking` ("pensando") |
| `tool_use` | `working`, con la etiqueta de `activityOf` de `plugin/hooks/activity.ts` ("editando foo.ts") |
| `control_request` `can_use_tool` | `asking` ("te pregunta: editar foo.ts") |
| `result` | `happy` ("listo") durante 4 s, después `idle` |
| La charla se cierra | `gone` |
| El proceso termina con error | `sad` ("falló la charla") |

**Una pregunta, dos superficies.** La pregunta se puede contestar desde el chat o desde el globo del pet. Gana la primera respuesta: C# manda una sola `control_response` y avisa a las dos superficies para que la quiten.

**Ciclo de vida del proceso:**
- Arranca al abrir la ventana y sigue vivo mientras está abierta: varios turnos por el mismo stdin.
- El `session_id` del evento `system/init` se guarda en `chats.json`.
- Al cerrar la ventana, C# cierra el stdin, espera hasta 5 s y, si el proceso no salió, lo mata. Cerrar la ventana del pet cierra también la charla.

## Permisos y personalidad

- **Modo `manual` siempre**, aunque el usuario use `auto`: con `auto` el clasificador aprueba solo y la charla nunca preguntaría. Las reglas `permissions.allow` del usuario siguen aplicando.
- **Tarjeta del chat:** muestra lo que se va a hacer.
  - Bash: el comando exacto.
  - Edit: el archivo y `old_string` → `new_string`.
  - Write: el archivo y el principio del contenido.
  - Otras herramientas: el nombre y `description`.
- **Globo del pet:** solo `description` con **Permitir / Denegar**.
- **Permitir ediciones en esta charla:** responde `allow` y aplica la sugerencia `setMode acceptEdits` con destino `session`. Solo aparece si la pregunta la trae.
- **Timeout:** si no hay respuesta en 2 minutos, se deniega con el mensaje "Sin respuesta del usuario".
- **Alcance:** es una sesión de Claude Code normal, con el mismo poder que una abierta en esa carpeta. Corren los hooks y los CLAUDE.md del usuario.
- **Personalidad** (`--append-system-prompt`, sin reemplazar el prompt de Claude Code):

  > Hablas como **{nombre}**. Mantén su personalidad y su forma de hablar al contar lo que haces, en español y con frases cortas. El trabajo técnico (código, comandos, explicaciones) tiene que ser exacto: la personalidad cambia cómo lo cuentas, nunca lo que haces ni lo que decides.

  Si `character.json` trae `"persona": "…"`, ese texto reemplaza la primera frase. El bicho blanco usa "una mascota simpática". La personalidad no pasa por encima de las salvaguardas de Claude ni de los permisos.

## Errores

| Caso | Comportamiento |
|---|---|
| No se encuentra `claude.exe` | El chat dice "No encontré Claude Code" y explica el PATH y `CLAUDE_PET_CLAUDE`. No se lanza nada. |
| El proceso termina solo o falla | `chat-exit` muestra "La sesión terminó (código N)" y **Reanudar** (vuelve a lanzar con `--resume`). El pet pasa a `sad`. |
| `--resume` falla | Empieza una conversación nueva y lo avisa en el chat. |
| Una línea que no es JSON | Se ignora y se registra en la consola de la página. |
| Se cancela el selector de carpeta | No se abre la charla. |
| **Hablar** con una charla ya abierta | Se trae al frente la ventana existente. |
| Se cierra la ventana del pet | Se cierra la charla con el mismo ciclo y la sesión del pet pasa a `gone`. |

## Pruebas

- **TypeScript (vitest):** `chatReducer` y el mapeo a estado del pet, con fixtures sacados de líneas JSON reales (init, texto, deltas parciales, `tool_use`, `control_request`, `tool_result`, `result`). Casos:
  - Los deltas se juntan en un mensaje.
  - Una herramienta aparece como línea compacta.
  - La pregunta queda pendiente y se cierra al contestarla.
  - Gana la primera respuesta.
  - `result` pasa a listo.
  - Una línea rota se ignora.
- **C#:** el repo no tiene tests de C#. Se agrega un proyecto `overlay.Tests` (xUnit + Shouldly), y la CI lo corre, para las partes puras de `ChatHost`: los argumentos de `claude` (con y sin `--resume`, con y sin `persona`), la clave de `chats.json`, la lectura del historial del transcript y la `control_response` de cada decisión. La E/S con el proceso real se prueba a mano.
- **De punta a punta, a mano, con el build de desarrollo:**
  - Toji en una carpeta temporal: crear un archivo y aprobarlo desde el globo del pet; el archivo existe.
  - Otro pedido denegado desde el chat.
  - **Detener** a mitad de una respuesta.
  - Cerrar y reabrir: el historial aparece y la conversación sigue.
  - **Nueva conversación** empieza de cero.

## Riesgos

- **El protocolo `stream-json` de control está poco documentado** y puede cambiar entre versiones de Claude Code. Se valida al empezar el plan. La ventana busca un CLI de la versión probada (2.1.300) o posterior; si solo encuentra uno más viejo, la charla muestra un error y no lanza nada, como hace el instalador con su mínimo.
- **Los hooks del usuario corren en cada herramienta de la charla.** Si son lentos, como un escaneo SAST en cada edición, la charla también lo será.
- **Coste:** cada mensaje consume del plan del usuario como cualquier sesión de Claude Code.
- **Subir el cambio de la CI:** el token de `gh` de quien abre la PR no tiene el permiso `workflow`, y GitHub rechaza subir a un fork cambios en `.github/workflows/` sin él (ya pasó con la PR #9). Para incluir `overlay.Tests` en la CI hay que dar ese permiso (`gh auth refresh -s workflow`); si no, el cambio de `ci.yml` se propone en la descripción de la PR para que lo aplique el dueño.

## Archivos

- **Nuevos:**
  - `overlay/ChatHost.cs`
  - `overlay/web/chat.html`
  - `overlay/web/src/chat/` (página, `chatReducer`, mapeo de estado y sus tests)
  - `overlay.Tests/` (proyecto de tests de C#)
- **Cambian:**
  - `overlay/Program.cs`: menú **Hablar**, ventana de chat, mensajes `permission` y `permission-answer`, cierre.
  - `overlay/web/vite.config.ts`: dos páginas.
  - `overlay/web/src/App.tsx` y `bridge.ts`: globo de permiso del pet.
  - `.github/workflows/ci.yml`: correr `overlay.Tests`.
  - `overlay/README.md` y `README.md`.

## Cambios después de probarlo (2026-10-16)

Lo que cambió al usarlo; manda sobre lo de arriba.

- **Sin carpeta y aislado.** La charla es para conversar (el clima, noticias), no para trabajar en los repos: **Hablar** abre sin preguntar, en `%LOCALAPPDATA%\claude-pet\chats\<personaje>\`, con `--safe-mode`. No corren los hooks, los plugins, los servidores MCP ni los `CLAUDE.md` del usuario; la búsqueda web y el login sí. Ya no hay `lastFolder` en `chats.json` ni `folder` en `chat-init`, y `repo` es `<nombre> · chat`.
- **Personalidad.** El prompt base es "Eres <nombre>." más las reglas: primera persona, no presentarse como Claude salvo que le pregunten en serio si es una IA, texto plano (el globo no interpreta Markdown) y trabajo exacto. Cada personaje trae su `persona` en `character.json`. Claude Code guarda el prompt al empezar la conversación, así que un cambio se nota en la próxima conversación nueva.
- **Diseño v2 (Figma).** Cabecera con avatar y estado en vivo, pasos agrupados (hecho, en curso, denegado), diffs de Edit y Write, tarjeta de permiso con cuenta regresiva, indicador de escritura, caja tipo píldora y **+** en lugar de **Nueva conversación**.
- **WebView2 por composición**, como el del pet: la ventana clásica fallaba con 0x8007139F en el mismo proceso del navegador.
