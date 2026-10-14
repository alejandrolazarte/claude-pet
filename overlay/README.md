# overlay

Ventana flotante del pet de Claude Code: transparente, siempre visible y arrastrable. Muestra un solo bicho para todas las sesiones de Claude Code: el de la sesión más ocupada, con el nombre del repo, lo que está haciendo y cuántas sesiones más hay abiertas. Es el complemento del mod [`plugin`](../plugin/README.md), que solo puede dibujar dentro de la ventana de Claude Code.

## Cómo funciona

1. El mod escribe el estado de cada sesión en `%TEMP%\claude-pet\<sessionId>.json`.
2. `Program.cs` vigila esa carpeta (`FileSystemWatcher`) y le pasa todas las sesiones a la página con `PostWebMessageAsJson`.
3. La app React (`web/`) descarta las sesiones cerradas (`mood: gone`) y las que no cambian hace más de 2 horas (`STALE_MS` en `web/src/sessions.ts`). De las que quedan muestra la más ocupada (`busiest`): trabajando > pensando > triste > listo > esperando > durmiendo. Entre dos igual de ocupadas gana la que cambió último. El contador `+N` indica cuántas sesiones más hay.

Al abrir, la ventana borra los archivos de sesión con más de un día.

## Cómo está hecho

- WPF (.NET 10) para la ventana: sin bordes, `AllowsTransparency`, `Topmost`, fuera de la barra de tareas.
- `WebView2CompositionControl` para el contenido web. El control `WebView2` clásico se monta como ventana Win32 aparte (`HwndHost`) y no funciona en una ventana transparente; el de composición se dibuja como un control WPF común. Estable desde el SDK 1.0.2957.106.
- `DefaultBackgroundColor = Transparent` para que la página no tenga fondo.
- La app React se sirve desde `bin/.../web` con `SetVirtualHostNameToFolderMapping` en `https://pet.local/`.
- Mensajes de la página a C#: `ready`, `drag`, `size` (la ventana toma el tamaño del contenido), `menu` (C# muestra el menú nativo con los personajes que manda la página) y `done` (una sesión terminó: C# reproduce el sonido del personaje).
- Mensajes de C# a la página: `sessions` (con el título de cada sesión), `art` (el kitsune y cada carpeta de personaje, con su SVG, nombre y `viewBox`), `character` (el personaje guardado o elegido), `caption` (qué muestra el cartel) y `mouseleave`. La página no recibe `mouseleave` del WebView2: en una ventana transparente el cursor pasa primero a la ventana de atrás. Por eso C# revisa cada 150 ms si el cursor salió del rectángulo de la ventana (`GetCursorPos` + `GetWindowRect`) y se lo avisa.
- Arrastre: la página espera a que el mouse se mueva más de 4 px con el botón apretado (`movedBeyond` en `web/src/pointer.ts`); recién ahí manda `drag` y C# le pasa el clic a Windows como si fuera en la barra de título (`WM_NCLBUTTONDOWN` + `HTCAPTION`). `DragMove` de WPF no sirve porque el WebView2 se queda con el mouse. Esperar es lo que deja distinguir un toque: una vez que Windows mueve la ventana, la página no ve soltar el botón.
- Una sola instancia (mutex `Local\ClaudePetOverlay`).
- La posición se guarda en `%LOCALAPPDATA%\claude-pet\window.json`. Si quedó fuera de las pantallas actuales, vuelve a la esquina inferior derecha.
- Los datos de WebView2 van a `%LOCALAPPDATA%\claude-pet\webview2`. Por defecto irían al lado del `.exe`, que está dentro del plugin instalado.

## Requisitos

- Para usarla: Windows 10 1809 o superior, el runtime de WebView2 (viene con Edge) y el **.NET 10 Desktop Runtime**.
- Para compilarla: .NET 10 SDK y Node 20 o superior.

## Publicar dentro del plugin

```powershell
./publish.ps1
```

Compila la app React y publica la ventana, dependiente del framework, en `plugin/window/` (unos 25 MB: 23 son la proyección del Windows SDK que necesita el control de composición). Si `dotnet restore` falla (por ejemplo, por un CredentialProvider de NuGet roto), restaura con el MSBuild de Visual Studio que encuentra `vswhere`. Hay que volver a correrlo después de cada cambio en la ventana y commitear `plugin/window/`.

## Compilar para desarrollo

Primero la app React (el build de C# copia `web/dist` al output):

```bash
cd overlay/web && npm ci && npm run build
```

```bash
dotnet build overlay/PetOverlay.csproj
```

Tests de la app React:

```bash
cd overlay/web && npm test
```

## Ejecutar

El mod abre la ventana publicada (`plugin/window/PetOverlay.exe`) al empezar cada sesión. Para probar un build de desarrollo, definir la variable de entorno de usuario `CLAUDE_PET_OVERLAY` con la ruta absoluta de ese `PetOverlay.exe` y reiniciar Claude Code; el mod usa esa en vez de la publicada.

## Personajes

La ventana lee los personajes de `%LOCALAPPDATA%\claude-pet\characters\` al abrir y cada vez que algo cambia en esa carpeta (`FileSystemWatcher`), sin reabrirla:

- **Bicho blanco:** está siempre.
- **Carpetas `<id>/`** con `character.svg` y un `character.json` opcional: `{ "label": "Nombre en el menú", "viewBox": "x y ancho alto", "parts": [...] }`. El id (el nombre de la carpeta) va en minúsculas, números y guiones; `blob` está reservado. Se dibujan con `Generic.tsx`: el personaje entero se mueve según el estado (escalado a su `viewBox`) y los extras van arriba a la derecha. Si todos los grupos de primer nivel del SVG tienen su `<animate attributeName="visibility">` (un export cuadro por cuadro, como Pochita), se reusa esa animación: cambia de velocidad según el estado o queda en el cuadro que arranca visible cuando piensa, está triste o duerme (`neutralFrameOf` en `web/src/svgLayout.ts`). Sin `viewBox` en el JSON se usa el del SVG.
- **Partes que se mueven solas** (`parts`): cada una dice qué elemento del SVG es (`path`, índices de hijos desde el `<svg>`), alrededor de qué punto gira (`pivot`) y cuántos grados cuando el personaje espera (`swing`, con signo). `Generic.tsx` envuelve cada parte en un `<g>` con su rotación; la velocidad y la amplitud de cada estado salen de `partSwing` en `web/src/svgLayout.ts` (las del kitsune: el doble trabajando, caída fija triste, 0,12 s de desfase entre partes). El kitsune es un personaje más, con sus 7 colas como `parts`.
- **Borde claro** (`"outline": true`): un `drop-shadow` blanco que sigue la silueta (`.outlined` en `web/src/styles.css`), para personajes oscuros que se pierden en un escritorio oscuro. Se recalcula en cada cuadro (en un video de 19 cuadros al 170 %, de 46 % a 69 % de un núcleo), así que para videos e imágenes conviene pintarlo en los cuadros con `prepare-character.ps1 -Outline`.
- **Sonido al terminar** (`done.mp3` o `done.wav` en la carpeta, hasta 4 MB): suena cuando cualquier sesión pasa a listo, aunque el bicho esté mostrando otra. La página compara cada lote de sesiones con el anterior (`finishedTask` en `web/src/sessions.ts`): no suena al abrir la ventana, ni por una sesión que aparece ya lista, y si terminan varias a la vez suena una sola vez. Le manda `done` a C#, que lo reproduce con el `MediaPlayer` de WPF; un `<audio>` en la página podría quedar bloqueado por la política de autoplay de WebView2. Sin archivo, el personaje no suena.

La forma fácil de agregar un personaje es pedírselo a Claude Code: la skill `pet:add-character` del plugin prepara la imagen con `plugin/skills/add-character/prepare-character.ps1` (saca el fondo, envuelve PNG/GIF/WebP/JPEG en un SVG, corta un WebM/MP4 en cuadros y calcula el `viewBox` con Edge headless) y arma la carpeta. Para mover partes sueltas está `pet:animate-character`: con `plugin/skills/animate-character/parts.ps1` numera los grupos del SVG para elegir las partes y dibuja una vista previa con los pivotes.

Se elige con el clic derecho. Si el personaje guardado ya no está disponible (por ejemplo, se borró su carpeta), se usa el primero disponible (`resolveCharacter` en `web/src/characters.ts`). Máximo 4 MB por SVG.

Los personajes son arte de cada usuario (muchas veces con licencias o copyright que no permiten redistribuirlos), así que no están en el repo ni en el plugin.

Al cargar cualquiera, la app le saca (`art.ts`) los `<script>`, los `<foreignObject>`, los atributos `on*` y los enlaces `javascript:` antes de insertarlo, porque viene de una descarga.

## Uso

- Arrastrar con el botón izquierdo.
- Tocar (clic sin arrastrar): el personaje da dos saltitos con un meneo y suelta un ♥, durante 1,2 s. Sus partes y animaciones cuadro por cuadro van a la velocidad de listo. Después vuelve al estado de la sesión; otro toque reinicia la reacción.
- Clic derecho abre un menú: **Personaje** (elegir entre los disponibles), **Mostrar** (en el cartel y la lista: el **proyecto** o el **título de la sesión**), **Tamaño** (un deslizador de 50 % a 250 % para el personaje elegido, cada uno guarda el suyo en `sizes`; se ve en vivo y se guarda al cerrar el menú), **Sonido** (prende o apaga el sonido al terminar; `sound` en settings, prendido si no está) y **Cerrar**. Las elecciones se guardan en `%LOCALAPPDATA%\claude-pet\settings.json` y se recuerdan al reabrir.
- **Título de la sesión:** es el de la barra lateral de la app. La ventana lo lee del final del transcript de la sesión (`~/.claude/projects/<proyecto>/<sessionId>.jsonl`, última entrada `custom-title`), unos 0,1 ms por sesión, y lo refresca cada 5 s, así un renombre aparece enseguida. Una sesión sin título muestra el proyecto.
- Pasar el mouse sobre el contador `+N` muestra debajo del bicho la lista de todas las sesiones, con su repo y estado. Se cierra al sacar el mouse del contador o de la ventana. La lista está dibujada en la página: el tooltip nativo (`title`) desaparecía cada vez que el bicho cambiaba de estado. Se abre con `mousemove` y no con `mouseenter`, porque la página nunca ve salir el cursor de la ventana y `mouseenter` no se vuelve a disparar.

## Trampas

- `TargetFramework` tiene que llevar versión de Windows (`net10.0-windows10.0.17763.0`). Con `net10.0-windows` compila, pero al abrir revienta con `Could not load file or assembly 'Microsoft.Windows.SDK.NET'`: el control de composición usa la proyección del Windows SDK.
- Si `web/dist` no existe, la ventana abre vacía: compilar la app React antes que el proyecto C#.
