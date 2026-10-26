# pet

Mod de Claude Code que sigue lo que hace Claude en cada sesión y se lo pasa a la ventana flotante [`overlay`](../overlay/README.md), donde un solo bicho muestra la sesión más ocupada.

| Evento | Estado |
|---|---|
| `turn.start` | pensando |
| `tool.call` | editando / escribiendo / leyendo + nombre del archivo, buscando, navegando, delegando |
| `tool.call` de Bash o PowerShell | corriendo tests, compilando, commiteando, pusheando, instalando o corriendo un comando, según el comando |
| `tool.call` de la lista de tareas de la app (`mcp__ccd_turn__update_plan`) | guarda la lista y su avance (`items` la reemplaza; `advance`, `done` y `start` la mueven; `hooks/steps.ts`) para la burbuja de pasos de la ventana |
| `tool.call` de `mcp__ccd_turn__wrap_up` | marca todos los pasos como hechos. La lista se borra cuando el bicho vuelve a esperando, 4 s después del fin del turno |
| `tool.call` de `AskUserQuestion` o `ExitPlanMode` | estado `asking` mientras espera tu respuesta: te hace una pregunta / espera que apruebes el plan. En la ventana tiene la prioridad más alta |
| una herramienta devuelve error | falló un comando / falló una herramienta, hasta la próxima herramienta |
| `tool.call` de un navegador (Claude in Chrome, el navegador integrado de la app, Playwright) | estado `browsing`: haciendo clic, escribiendo en la página, leyendo la página, mirando la página, abriendo una página, … (`hooks/activity.ts`). Al terminar la herramienta queda en "navegando" hasta la próxima herramienta que no sea de navegador o el fin del turno, para que no parpadee entre clics |
| `turn.complete` con respuesta | listo (4 s), después esperando |
| `turn.complete` interrumpido o con error | interrumpido / algo falló |
| 5 min sin actividad | durmiendo |

En el desktop el mod no dibuja nada en la franja de arriba del prompt: el bicho está solo en la ventana flotante. En la terminal muestra una carita de texto en esa franja, por ejemplo `(•‿•) esperando`.

## Ventana flotante

En cada cambio de estado, el mod escribe `%TEMP%\claude-pet\<sessionId>.json`:

```json
{ "sessionId": "…", "repo": "my-project", "mood": "working", "label": "editando", "updatedAt": 1791543474000 }
```

Mientras la sesión tiene una lista de tareas, el archivo lleva también `steps`, los pasos con su estado, como los muestra la app: `[{ "content": "Tests, validar y recarga", "status": "in_progress" }]` (`pending`, `in_progress` o `completed`). Sin lista, el campo no está.

`repo` es el nombre de la carpeta raíz de la sesión. Al cerrar la sesión escribe `"mood": "gone"`. El mod pide el id de la sesión en cada escritura porque, tras un `/clear`, la sesión sigue con otro id sin disparar `session.start`.

Al empezar cada sesión, el mod abre la ventana publicada dentro del plugin (`window/PetOverlay.exe`, ver `claude-pet/publish.ps1`). Si ya está abierta, la segunda instancia se cierra sola. La variable de entorno `CLAUDE_PET_OVERLAY` apunta a otra ventana, por ejemplo un build de desarrollo. Si no hay ventana publicada ni variable, el mod no abre nada.

Las sesiones no interactivas (`claude -p`, el SDK) no abren la ventana ni escriben su archivo: nadie las está mirando y quedarían como "esperando" en la lista.

Si la escritura del archivo falla, el mod sigue funcionando igual.

## Skill `add-character`

`skills/add-character/` le enseña a Claude Code a agregar, renombrar o sacar personajes de la ventana cuando el usuario se lo pide ("agregá un personaje con esta imagen"). Usa `prepare-character.ps1`, que prepara la imagen con Edge headless: le saca el fondo a un SVG o a una imagen opaca sin animación, envuelve un PNG, GIF, WebP o JPEG en un SVG, corta un video WebM o MP4 (entero o un tramo) en hasta 30 cuadros (o los que pida `-Frames`, hasta 200) y calcula un `viewBox` ajustado. Se ve en Claude Code como `pet:add-character`.

## Skill `animate-character`

`skills/animate-character/` le enseña a Claude Code a mover partes sueltas de un personaje (colas, orejas, brazos), como las colas del kitsune, escribiendo `parts` en su `character.json`. `parts.ps1` dibuja el SVG con los grupos numerados para elegir las partes y, con `-Parts`, una vista previa de tres poses con los pivotes marcados. Se ve en Claude Code como `pet:animate-character`.

## Requisitos

Claude Code 2.1.293 o superior (API de mods con function hooks, en early access).

## Instalación

La raíz del repo es un marketplace (`.claude-plugin/marketplace.json`). Lo más simple es el instalador (`install-claude-pet.cmd`, ver el README de la raíz). A mano, con el `claude` 2.1.293 o superior, desde GitHub o desde una copia local:

```bash
claude plugin marketplace add alejandrolazarte/claude-pet
```

```bash
claude plugin install pet@claude-pet --scope user
```

Queda activo en todas las sesiones nuevas, también en las de la pestaña Code del desktop.

## Desarrollo

Claude Code no lee el plugin de la carpeta del marketplace: al instalarlo guarda una copia en `~/.claude/plugins/cache/claude-pet/pet/`. Si la carpeta es un repo git, la copia sale del último commit, sin los cambios sin commitear. `/reload-plugins` no la renueva. Para probar un cambio:

1. Commitear.
2. `claude plugin uninstall pet@claude-pet` y `claude plugin install pet@claude-pet --scope user`.
3. Abrir una sesión nueva. Las sesiones abiertas pierden el mod al desinstalar, y `/reload-plugins` no lo devuelve.

No versionar `.claude-plugin/types/` ni `tsconfig.json` si aparecen: los genera el motor en cada carga.

Comprobar:

```bash
claude plugin test plugin
```

```bash
claude plugin validate plugin
```

El CI corre `claude plugin test plugin` en cada push y PR, con el CLI de npm fijado en 2.1.296 y sin iniciar sesión.

Si el `claude` del PATH es anterior a 2.1.293 da `unknown command 'test'`. En ese caso usar el binario de la app: `%APPDATA%\Claude\claude-code\<versión>\<hash>\claude.exe`.

## Trampas del API

- Una función que recibe `$` tiene que estar declarada en el nivel superior del archivo. Si no, el módulo no carga.
- El motor descarta `key` en los elementos no interactivos: en los tests, buscar por `type`.
- En los tests de `ui.render`, el doble de lo que está debajo del plugin tiene que devolver un elemento (por ejemplo un `Text`), no `null`.

## Licencias de terceros

La ventana publicada (`window/`) incluye DLLs de Microsoft (WebView2, C#/WinRT, la proyección del SDK de Windows) y React dentro del JavaScript. Sus licencias y avisos están en [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt). Si `publish.ps1` suma o cambia una dependencia, hay que actualizar ese archivo.

## Desinstalar

```bash
claude plugin uninstall pet@claude-pet
```
