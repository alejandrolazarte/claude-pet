# Prepares an image as a claude-pet character: an SVG (its full-canvas background removed), a PNG, GIF,
# WebP or JPEG (wrapped in an SVG) or a WebM or MP4 (cut into up to 30 frames), plus a tight viewBox. Measures
# it with headless Edge, so it needs no other tools. Prints a JSON summary; writes the SVG to -Out.
#   Videos only: -Start/-End keep a stretch of it, in seconds (End 0 = to the end); -Sheet writes a PNG with
#   every frame numbered and timed, to pick that stretch.
#   Videos and still images: -Outline paints a light edge around the figure into the pictures, once, instead of
#   the window's CSS outline, which redraws on every frame of an animation. -KeepBackdrop leaves a thin band of the
#   removed background around the figure, as an edge in its own color.
param(
    [Parameter(Mandatory)] [string] $Source,
    [Parameter(Mandatory)] [string] $Out,
    [double] $Start = 0,
    [double] $End = 0,
    [string] $Sheet,
    [switch] $Outline,
    [switch] $KeepBackdrop
)
$ErrorActionPreference = 'Stop'

$imageTypes = @{ '.png' = 'image/png'; '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg' }
$videoTypes = @{ '.webm' = 'video/webm'; '.mp4' = 'video/mp4' }
$extension = [IO.Path]::GetExtension($Source).ToLowerInvariant()
if ($extension -eq '.svg') {
    $image = @{ kind = 'svg'; text = [IO.File]::ReadAllText($Source) }
}
elseif ($imageTypes.ContainsKey($extension)) {
    $bytes = [IO.File]::ReadAllBytes($Source)
    $animated = $extension -eq '.gif' -or
        ($extension -eq '.webp' -and $bytes.Length -gt 20 -and ($bytes[20] -band 2)) -or
        ($extension -eq '.png' -and [Text.Encoding]::ASCII.GetString($bytes).Contains('acTL'))
    $image = @{ kind = 'image'; animated = [bool]$animated; outline = [bool]$Outline; keepBackdrop = [bool]$KeepBackdrop; text = "data:$($imageTypes[$extension]);base64,$([Convert]::ToBase64String($bytes))" }
}
elseif ($videoTypes.ContainsKey($extension)) {
    $image = @{ kind = 'video'; outline = [bool]$Outline; keepBackdrop = [bool]$KeepBackdrop; start = $Start; end = $End; sheet = [bool]$Sheet; text = "data:$($videoTypes[$extension]);base64,$([Convert]::ToBase64String([IO.File]::ReadAllBytes($Source)))" }
}
else {
    throw "Unsupported file type '$extension': use .svg, .png, .gif, .webp, .jpg, .webm or .mp4"
}

$edge = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge was not found; it is used to measure the image' }

# Not --dump-dom: it dumps on the load event or when virtual time runs out, and decoding a large image or seeking
# a video happens in real time, after that. Asks the open page over the DevTools protocol until it has answered.
function Read-PageResult([string] $uri) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    $browser = Start-Process $edge -PassThru -WindowStyle Hidden -ArgumentList @(
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-sync',
        '--disable-extensions', "--remote-debugging-port=$port", $uri)
    $socket = [Net.WebSockets.ClientWebSocket]::new()
    $none = [Threading.CancellationToken]::None
    $deadline = (Get-Date).AddSeconds(120)
    try {
        $target = $null
        while (-not $target) {
            if ((Get-Date) -gt $deadline) { throw 'Edge did not open the page' }
            Start-Sleep -Milliseconds 300
            # Assigned first: Windows PowerShell pipes a JSON array as one object.
            try { $pages = Invoke-RestMethod "http://127.0.0.1:$port/json"; $target = $pages | Where-Object type -eq 'page' | Select-Object -First 1 } catch { }
        }
        [void]$socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $none).GetAwaiter().GetResult()
        $buffer = [byte[]]::new(65536)
        for ($id = 1; (Get-Date) -lt $deadline; $id++) {
            $request = @{ id = $id; method = 'Runtime.evaluate'; params = @{ expression = "document.getElementById('out').textContent"; returnByValue = $true } } | ConvertTo-Json -Compress
            [void]$socket.SendAsync([ArraySegment[byte]]::new([Text.Encoding]::UTF8.GetBytes($request)), 'Text', $true, $none).GetAwaiter().GetResult()
            do {
                $message = [IO.MemoryStream]::new()
                do {
                    $chunk = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $none).GetAwaiter().GetResult()
                    $message.Write($buffer, 0, $chunk.Count)
                } while (-not $chunk.EndOfMessage)
                $reply = [Text.Encoding]::UTF8.GetString($message.ToArray()) | ConvertFrom-Json
            } while ($reply.id -ne $id)
            $text = $reply.result.result.value
            if ($text) { return $text }
            Start-Sleep -Milliseconds 500
        }
        throw 'Edge did not finish reading the image'
    }
    finally {
        $socket.Dispose()
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$($browser.Id)" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Stop-Process -Id $browser.Id -Force -ErrorAction SilentlyContinue
    }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("claude-pet-" + [Guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
try {
    $page = Join-Path $work 'measure.html'
    # A literal "</script>" inside the SVG would end the page's script early.
    $payload = ($image | ConvertTo-Json -Compress).Replace('</', '<\/')
    # The image is untrusted: only the nonced script may run, never its on* handlers or javascript: links.
    $nonce = [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($page, @"
<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-$nonce'; img-src data:; media-src data:; style-src 'unsafe-inline'"></head><body><pre id="out"></pre><script nonce="$nonce">
const input = $payload;
const finish = result => { document.getElementById('out').textContent = JSON.stringify(result) };
const ns = 'http://www.w3.org/2000/svg';
let removedBackground = false, outlined = false, video = {};
const draw = (source, w, h) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
  return canvas;
};
// An opaque picture has a background when its four corners share a color, or when its edge is a smooth shade (the
// blue gradient of the Fortnite shop) that only shifts a little from one pixel to the next. Erases it by flooding in
// from the edges, so the same color inside the outline (a white shirt) stays.
function clearBackground(canvas) {
  const w = canvas.width, h = canvas.height, context = canvas.getContext('2d');
  const pixels = context.getImageData(0, 0, w, h), d = pixels.data;
  const distance = (a, b) => Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
  const border = [];
  for (let x = 0; x < w; x++) border.push(x);
  for (let y = 1; y < h; y++) border.push(y * w + w - 1);
  for (let x = w - 2; x >= 0; x--) border.push((h - 1) * w + x);
  for (let y = h - 2; y > 0; y--) border.push(y * w);
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(p => p * 4);
  const isPlain = corners.every(i => d[i + 3] === 255 && distance(i, corners[0]) <= 60);
  // Measured on the edge: a shop gradient jumps by more than 6 on up to 7 % of it, even under effects; a game scene
  // on about 20 %.
  let jumps = 0;
  for (let i = 0; i < border.length; i++) if (distance(border[i] * 4, border[(i + 1) % border.length] * 4) > 6) jumps++;
  const isShaded = !isPlain && border.every(p => d[p * 4 + 3] === 255) && jumps <= border.length * 0.1;
  if (!isPlain && !isShaded) return false;
  const isBackground = isPlain ? (p, from) => distance(p * 4, corners[0]) <= 60 : (p, from) => distance(p * 4, from * 4) <= 18;
  const seen = new Uint8Array(w * h), stack = [];
  for (const p of border) stack.push(p, p);
  while (stack.length) {
    const from = stack.pop(), p = stack.pop();
    if (seen[p] || !isBackground(p, from)) continue;
    seen[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1, p);
    if (x < w - 1) stack.push(p + 1, p);
    if (p >= w) stack.push(p - w, p);
    if (p < (h - 1) * w) stack.push(p + w, p);
  }
  const kept = new Uint8Array(w * h);
  if (input.keepBackdrop) {
    let ring = [];
    for (let p = 0; p < w * h; p++) if (!seen[p]) ring.push(p);
    for (let step = Math.max(2, Math.round(Math.max(w, h) / 120)); step > 0 && ring.length; step--) {
      const next = [];
      for (const p of ring) {
        const x = p % w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
          if (q >= 0 && q < w * h && seen[q] && !kept[q]) { kept[q] = 1; next.push(q); }
        }
      }
      ring = next;
    }
  }
  for (let p = 0; p < w * h; p++) if (seen[p] && !kept[p]) d[p * 4 + 3] = 0;
  context.putImageData(pixels, 0, 0);
  removedBackground = true;
  return true;
}
// Close to the window's .outlined CSS: two white shadows, a bit stronger since they do not stack the same,
// measured in screen pixels at the window's 110 px.
function withOutline(canvas) {
  const ratio = Math.max(canvas.width, canvas.height) / 110, pad = Math.ceil(3 * ratio);
  const out = Object.assign(document.createElement('canvas'), { width: canvas.width + 2 * pad, height: canvas.height + 2 * pad });
  const context = out.getContext('2d'), away = out.width * 2;
  for (const [blur, alpha] of [[1, 1], [2, 0.8]]) {
    // Drawn off the canvas with the shadow shifted back in: only the shadow lands.
    Object.assign(context, { shadowColor: 'rgba(255, 255, 255, ' + alpha + ')', shadowBlur: blur * ratio, shadowOffsetX: away });
    context.drawImage(canvas, pad - away, pad);
  }
  Object.assign(context, { shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0 });
  context.drawImage(canvas, pad, pad);
  outlined = true;
  return out;
}
const picture = (svg, href, w, h) => {
  const inner = document.createElementNS(ns, 'image');
  inner.setAttribute('href', href);
  inner.setAttribute('width', w);
  inner.setAttribute('height', h);
  svg.appendChild(inner);
  return inner;
};
// A video becomes the frame-by-frame format the window plays: one top-level group per frame, each shown in
// turn by its own <animate visibility>.
async function videoFrames() {
  const player = document.createElement('video');
  player.muted = true;
  await new Promise((resolve, reject) => { player.onloadeddata = resolve; player.onerror = () => reject(new Error('the video could not be decoded')); player.src = input.text; });
  const duration = player.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('the video has no known length');
  const from = Math.min(Math.max(0, input.start), duration), to = input.end > 0 ? Math.min(input.end, duration) : duration;
  if (to - from < 0.1) throw new Error('the stretch ' + from + '-' + to + 's is empty; the video lasts ' + duration + 's');
  const length = to - from, vw = player.videoWidth, vh = player.videoHeight;
  const count = Math.max(2, Math.min(30, Math.round(length * 10)));
  const times = [...Array(count).keys()].map(i => from + length * i / count);
  const canvases = [];
  // The figure often fills a small part of the frame: crop to where it is in any frame, then shrink.
  let left = vw, top = vh, right = -1, bottom = -1;
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => { player.onseeked = resolve; player.currentTime = times[i]; });
    const canvas = draw(player, vw, vh);
    clearBackground(canvas);
    const d = canvas.getContext('2d').getImageData(0, 0, vw, vh).data;
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      if (d[(y * vw + x) * 4 + 3] > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    canvases.push(canvas);
  }
  if (right < 0) { left = 0; top = 0; right = vw - 1; bottom = vh - 1; }
  const cw = right - left + 1, ch = bottom - top + 1;
  const scale = Math.min(1, 240 / Math.max(cw, ch));
  const w = Math.round(cw * scale), h = Math.round(ch * scale);
  const pad = input.outline ? Math.ceil(3 * Math.max(w, h) / 110) : 0;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + (w + 2 * pad) + ' ' + (h + 2 * pad));
  const keyTimes = [...Array(count).keys()].map(i => Math.round(i / count * 10000) / 10000).join(';');
  const columns = 6, cell = 160, cellHeight = Math.round(cell * h / w) + 16;
  const sheet = Object.assign(document.createElement('canvas'), { width: columns * cell, height: Math.ceil(count / columns) * cellHeight });
  const page = sheet.getContext('2d');
  page.fillStyle = '#2b2d42';
  page.fillRect(0, 0, sheet.width, sheet.height);
  page.font = '12px sans-serif';
  for (let i = 0; i < count; i++) {
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(canvases[i], left, top, cw, ch, 0, 0, w, h);
    const x = i % columns * cell, y = Math.floor(i / columns) * cellHeight;
    page.drawImage(canvas, x, y + 16, cell, cellHeight - 16);
    page.fillStyle = '#fff';
    page.fillText(i + '  ' + times[i].toFixed(2) + 's', x + 4, y + 12);
    const group = document.createElementNS(ns, 'g');
    const animate = document.createElementNS(ns, 'animate');
    Object.entries({ attributeName: 'visibility', calcMode: 'discrete', dur: length + 's', repeatCount: 'indefinite', keyTimes,
      values: [...Array(count).keys()].map(j => j === i ? 'visible' : 'hidden').join(';') }).forEach(([k, v]) => animate.setAttribute(k, v));
    group.appendChild(animate);
    const framed = input.outline ? withOutline(canvas) : canvas;
    picture(group, framed.toDataURL('image/webp', 0.85), framed.width, framed.height);
    svg.appendChild(group);
  }
  video = { duration, start: from, end: to, sheet: input.sheet ? sheet.toDataURL('image/png') : undefined };
  return svg;
}
async function load() {
  if (input.kind === 'video') return videoFrames();
  if (input.kind === 'image') {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('the image could not be decoded')); image.src = input.text; });
    const canvas = draw(image, image.naturalWidth, image.naturalHeight);
    // A canvas keeps only the first frame, so an animated image keeps its background and gets no outline.
    const cleared = !input.animated && clearBackground(canvas);
    const framed = !input.animated && input.outline ? withOutline(canvas) : canvas;
    const href = cleared || framed !== canvas ? framed.toDataURL('image/webp', 0.92) : input.text;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + framed.width + ' ' + framed.height);
    picture(svg, href, framed.width, framed.height);
    return svg;
  }
  const parsed = new DOMParser().parseFromString(input.text, 'image/svg+xml').documentElement;
  if (parsed.namespaceURI !== ns) throw new Error('not an SVG document');
  return document.importNode(parsed, true);
}
load().then(svg => {
  svg.setAttribute('width', '1000');
  svg.setAttribute('height', '1000');
  document.body.appendChild(svg);
  const canvas = svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : svg.getBBox();
  // A background is the first shape drawn and covers almost the whole canvas.
  const first = svg.querySelector('rect, path, polygon, circle, ellipse');
  if (first && input.kind === 'svg') {
    const b = first.getBBox();
    if (b.width * b.height >= 0.95 * canvas.width * canvas.height) { first.remove(); removedBackground = true; }
  }
  const box = svg.getBBox();
  const pad = 0.03 * Math.max(box.width, box.height);
  const viewBox = [box.x - pad, box.y - pad, box.width + 2 * pad, box.height + 2 * pad].map(n => Math.round(n * 10) / 10).join(' ');
  const groups = [...svg.children].filter(c => c.tagName !== 'defs' && c.tagName !== 'style');
  const frames = groups.length > 1 && groups.every(g => g.querySelector(':scope > animate[attributeName="visibility"]'));
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  finish({ viewBox, removedBackground, outlined, frames, kind: input.kind, video, svg: new XMLSerializer().serializeToString(svg) });
}).catch(error => finish({ error: String(error) }));
</script></body></html>
"@)
    $result = Read-PageResult ([Uri]$page).AbsoluteUri | ConvertFrom-Json
    if ($result.error) { throw "Could not read the image: $($result.error)" }

    [IO.File]::WriteAllText($Out, $result.svg)
    $summary = [ordered]@{
        out = $Out
        viewBox = $result.viewBox
        removedBackground = $result.removedBackground
        outlined = $result.outlined
        frames = $result.frames
        kind = $result.kind
        bytes = (Get-Item $Out).Length
    }
    if ($result.kind -eq 'video') {
        $summary.duration = $result.video.duration
        $summary.start = $result.video.start
        $summary.end = $result.video.end
        if ($Sheet) {
            [IO.File]::WriteAllBytes($Sheet, [Convert]::FromBase64String($result.video.sheet.Substring($result.video.sheet.IndexOf(',') + 1)))
            $summary.sheet = $Sheet
        }
    }
    $summary | ConvertTo-Json
}
finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
