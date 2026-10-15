# claude-pet

Mascota de escritorio para Claude Code: una ventana flotante con un personaje que muestra qué está haciendo Claude en tus sesiones (pensando, editando un archivo, corriendo tests, navegando, esperando tu respuesta…).

## Instalación

1. Bajar el zip del último [Release](https://github.com/alejandrolazarte/claude-pet/releases) (o clonar el repo) y descomprimirlo en cualquier lugar. Si Windows marca el zip como bajado de internet: clic derecho → Propiedades → Desbloquear, antes de descomprimir.
2. Doble clic en **`install-claude-pet.cmd`**.
3. Reiniciar Claude Code. Al abrir una sesión aparece la ventana flotante.

El instalador (`install.ps1`):

- busca Claude Code 2.1.293 o superior (el del PATH o el de la app de escritorio) y, si solo hay uno más viejo, ofrece `claude update`;
- revisa el .NET 10 Desktop Runtime y el runtime de WebView2, y pregunta antes de instalar con `winget` el que falte;
- copia el plugin a `%LOCALAPPDATA%\claude-pet\app`;
- registra el marketplace `claude-pet` e instala el plugin `pet@claude-pet` (si el marketplace ya está registrado, lo deja donde está);
- crea `%LOCALAPPDATA%\claude-pet\characters\`.

Para actualizar, volver a correrlo con la versión nueva: reinstala el plugin. Después, reiniciar Claude Code. Windows puede mostrar el aviso de SmartScreen la primera vez.

Para desinstalar:

```bash
claude plugin uninstall pet@claude-pet
```

## Personajes

Arranca con el **bicho blanco**. Para agregar otros, pedíselo a Claude Code, por ejemplo: *"agregá un personaje con la imagen goku.png de Descargas"*. Lo hace la skill `pet:add-character` del plugin: acepta SVG, PNG, GIF, WebP, JPEG o un video WebM/MP4, le saca el fondo, calcula el recorte y lo deja en `%LOCALAPPDATA%\claude-pet\characters\<id>\`. Aparece en el menú del clic derecho (**Personaje**) sin reabrir la ventana. Para que además mueva partes sueltas (colas, orejas, brazos), pedile *"animá las colas del personaje"*: lo hace la skill `pet:animate-character`. Para que suene cuando Claude termina una tarea, dejá un `done.mp3` o `done.wav` en su carpeta; para que suene al tocarlo, un `poke.mp3` o `poke.wav` (otro toque lo para). Se apagan desde el menú: **Sonido**. Ver [`overlay/README.md`](overlay/README.md#personajes).

Los personajes son de cada usuario: no viajan en el plugin ni en el repo.

## Partes

| Carpeta | Qué es |
|---|---|
| [`plugin/`](plugin/README.md) | El mod de Claude Code. Sigue los eventos de cada sesión y escribe su estado en `%TEMP%\claude-pet\<sessionId>.json`. Incluye la ventana publicada (`window/`) y las skills `add-character` y `animate-character`. |
| [`overlay/`](overlay/README.md) | El código de la ventana flotante: WPF + WebView2 con una app React adentro. Lee esos archivos y dibuja el personaje. |
| `.claude-plugin/marketplace.json` | Hace de esta carpeta un marketplace de plugins (`claude-pet`) con un solo plugin, `pet`. |
| `install-claude-pet.cmd`, `install.ps1` | El instalador. |
| `publish.ps1` | Publica la ventana en `plugin/window/`. Hay que correrlo después de cada cambio en `overlay/`. |

## Requisitos

- Windows 10 1809 o superior, con el runtime de WebView2 y el .NET 10 Desktop Runtime (el instalador los revisa).
- Claude Code 2.1.293 o superior (API de mods con function hooks, en early access).
- Para compilar: .NET 10 SDK y Node 20 o superior.
