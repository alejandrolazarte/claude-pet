---
name: animate-character
description: Anima partes sueltas de un personaje de claude-pet (colas, orejas, brazos, pelo, alas) para que se muevan por separado según lo que hace Claude, como las colas del kitsune. Usar cuando el usuario pida "que le muevan las colas/orejas", "animá las partes del personaje", "que mueva la cola", o después de agregar un personaje con add-character si quiere más movimiento.
---

# Animar partes de un personaje de claude-pet

Un personaje vive en `%LOCALAPPDATA%\claude-pet\characters\<id>\` (ver la skill `add-character`). Por defecto se mueve entero. Para que algunas partes se muevan solas, se listan en su `character.json`:

```json
{
  "label": "Kitsune",
  "viewBox": "600 250 3100 3350",
  "parts": [
    { "path": "0.1.0", "pivot": "1780 2600", "swing": -4 },
    { "path": "0.1.1", "pivot": "2150 2520", "swing": 4 }
  ]
}
```

- **`path`:** qué elemento del SVG es la parte. Son índices de hijos desde el `<svg>`: `"0.1.0"` es el hijo 0 del hijo 1 del hijo 0. Solo cuentan elementos, no texto ni comentarios.
- **`pivot`:** el punto, en coordenadas del SVG, alrededor del cual gira: donde la parte se une al cuerpo (la base de una cola, la raíz de una oreja, el hombro de un brazo).
- **`swing`:** cuántos grados gira cuando el personaje espera, hasta 45. El signo dice hacia dónde: usá signos opuestos para partes de lados opuestos, así se abren y cierran en espejo. Cuando Claude trabaja gira el doble y más rápido; cuando duerme, casi nada; cuando está triste, la parte queda caída hacia el lado del signo. Cada parte arranca un poco después que la anterior, para que no se muevan todas juntas. Valores típicos: colas 4 a 6, orejas 3 a 5, brazos 5 a 8.

La ventana vigila la carpeta: cada vez que guardás `character.json`, el personaje se actualiza sin reabrirla.

## Pasos

1. **Ubicar el personaje.** Si no está agregado, primero usá la skill `add-character`. Trabajá siempre sobre su `character.svg` final: los `path` cambian si el SVG cambia.
2. **Ver las partes candidatas** con `parts.ps1` (en la misma carpeta que este archivo):

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "<carpeta de la skill>\parts.ps1" -Svg "$env:LOCALAPPDATA\claude-pet\characters\<id>\character.svg" -Out "$env:TEMP\claude-pet-inspect.png"
   ```

   Dibuja el personaje con hasta 30 grupos recuadrados y numerados, e imprime cada uno con su `n`, `path` y `bbox` (`[x, y, ancho, alto]`). **Mirá la imagen** (abrí el PNG) y decidí qué grupos son las partes que el usuario quiere mover. Si una parte no aparece sola (por ejemplo, el brazo está dentro del grupo del cuerpo), mirá más adentro con `-Within <path>` del grupo que la contiene.
3. **Elegir el pivote de cada parte** con su `bbox`: es el borde de la caja que toca el cuerpo. Para una cola que sale hacia la izquierda, el borde derecho de su caja, a la altura donde nace; para una oreja, el centro del borde de abajo; para un brazo, el hombro. Si varias partes nacen del mismo lugar (las colas del kitsune), pueden compartir pivote.
4. **Escribir `parts`** en `character.json`, sin tocar `label` ni `viewBox`.
5. **Revisar** con la vista previa:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "<carpeta de la skill>\parts.ps1" -Svg "...\character.svg" -Parts "...\character.json" -Out "$env:TEMP\claude-pet-preview.png"
   ```

   Dibuja tres poses (todas las partes giradas exageradamente hacia un lado, en reposo, hacia el otro) con un punto rojo en cada pivote, e imprime los `path` que no encontró (`missing`). **Mirá la imagen:** cada parte tiene que girar desde donde se une al cuerpo, sin despegarse ni atravesarlo. Si una se despega, mové su pivote hacia la unión; si se mueven en el mismo sentido partes que deberían ir en espejo, cambiá el signo de `swing`. Repetí hasta que se vea bien.
6. **Contarle al usuario** qué partes animaste. Si lo tenía elegido, lo ve moverse enseguida.

## Sacar la animación de partes

Borrá `parts` del `character.json` (o dejalo en `[]`): el personaje vuelve a moverse entero.
