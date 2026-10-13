# Helps animate parts of a claude-pet character (tails, ears, arms) one by one.
#   Without -Parts: draws the character with up to 30 candidate groups outlined and numbered, and prints
#   them as JSON ({ n, path, tag, bbox }) so the right ones can be picked. -Within <path> lists only what is
#   inside that group, to look closer.
#   With -Parts: draws three poses (each part swung one way, at rest, the other way, exaggerated) with a red
#   dot on every pivot, to check that each part turns where it joins the body.
param(
    [Parameter(Mandatory)] [string] $Svg,
    [Parameter(Mandatory)] [string] $Out,
    [string] $Parts,
    [string] $Within
)
$ErrorActionPreference = 'Stop'

$edge = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge was not found; it is used to draw the character' }

$manifest = if ($Parts) { Get-Content $Parts -Raw | ConvertFrom-Json } else { $null }
$payload = (@{
    svg = [IO.File]::ReadAllText($Svg)
    viewBox = $manifest.viewBox
    parts = @($manifest.parts)
    preview = [bool]$Parts
    within = $Within
} | ConvertTo-Json -Compress -Depth 5).Replace('</', '<\/')

$work = Join-Path ([IO.Path]::GetTempPath()) ("claude-pet-" + [Guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
try {
    $page = Join-Path $work 'parts.html'
    # The SVG is untrusted: only the nonced script may run, never its on* handlers or javascript: links.
    $nonce = [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($page, @"
<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-$nonce'; img-src data:; style-src 'unsafe-inline'"></head><body style="margin:0;background:#fff;font-family:sans-serif"><div id="stage" style="display:flex;gap:8px"></div><pre id="out"></pre><script nonce="$nonce">
const input = $payload;
const ns = 'http://www.w3.org/2000/svg';
const parse = () => document.importNode(new DOMParser().parseFromString(input.svg, 'image/svg+xml').documentElement, true);
const at = (root, path) => path.split('.').map(Number).reduce((node, i) => node && node.children[i], root);
const show = (svg, size) => { svg.setAttribute('width', size); svg.setAttribute('height', size); document.getElementById('stage').appendChild(svg); return svg };
const box = svg => { const v = input.viewBox ? input.viewBox.split(/[\s,]+/).map(Number) : null; return v && v.length === 4 ? v : (b => [b.x, b.y, b.width, b.height])(svg.getBBox()) };
const mark = (svg, draw) => { const g = document.createElementNS(ns, 'g'); svg.appendChild(g); draw(g); };
const el = (parent, tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; parent.appendChild(e); return e };
try {
  if (!input.preview) {
    const svg = show(parse(), 1000);
    const [x, y, w, h] = box(svg);
    svg.setAttribute('viewBox', [x, y, w, h].join(' '));
    const total = w * h, unit = Math.max(w, h) / 100, found = [];
    // A group almost as big as the candidate around it is the same part again: skip it, keep looking inside.
    const walk = (node, path, depth, outerArea) => [...node.children].forEach((child, i) => {
      const p = path ? path + '.' + i : String(i);
      if (!['g', 'path', 'polygon', 'ellipse', 'circle', 'rect'].includes(child.tagName) || depth > 6) return;
      const b = child.getBBox(), area = b.width * b.height, ratio = area / total;
      const isCandidate = ratio >= 0.004 && ratio <= 0.5 && (child.tagName === 'g' || depth <= 3) && area <= 0.85 * outerArea;
      if (isCandidate) found.push({ path: p, tag: child.tagName, bbox: [b.x, b.y, b.width, b.height].map(Math.round), depth });
      if (child.tagName === 'g') walk(child, p, depth + 1, isCandidate ? area : outerArea);
    });
    const start = input.within ? at(svg, input.within) : svg;
    if (!start) throw new Error('no element at path ' + input.within);
    walk(start, input.within || '', 1, Infinity);
    const list = found.sort((a, b) => a.depth - b.depth || b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]).slice(0, 30).map((c, n) => ({ n, ...c }));
    mark(svg, g => list.forEach(c => {
      el(g, 'rect', { x: c.bbox[0], y: c.bbox[1], width: c.bbox[2], height: c.bbox[3], fill: 'none', stroke: 'hsl(' + (c.n * 47 % 360) + ' 90% 45%)', 'stroke-width': unit * 0.3 });
      el(g, 'text', { x: c.bbox[0] + unit, y: c.bbox[1] + unit * 4, 'font-size': unit * 3.5, fill: 'hsl(' + (c.n * 47 % 360) + ' 90% 35%)', 'font-weight': 700 }, c.n);
    }));
    document.getElementById('out').textContent = JSON.stringify(list.map(({ depth, ...c }) => c));
  } else {
    [-2.5, 0, 2.5].forEach(factor => {
      const svg = show(parse(), 400);
      const [x, y, w, h] = box(svg);
      svg.setAttribute('viewBox', [x, y, w, h].join(' '));
      const unit = Math.max(w, h) / 100;
      const targets = input.parts.map(part => ({ part, element: at(svg, part.path) }));
      targets.forEach(({ part, element }) => {
        if (!element) return;
        const wrapper = document.createElementNS(ns, 'g');
        element.replaceWith(wrapper); wrapper.appendChild(element);
        wrapper.setAttribute('transform', 'rotate(' + part.swing * factor + ' ' + part.pivot.replace(',', ' ') + ')');
      });
      mark(svg, g => input.parts.forEach(part => { const [px, py] = part.pivot.split(/[\s,]+/).map(Number); el(g, 'circle', { cx: px, cy: py, r: unit * 1.2, fill: 'red' }) }));
    });
    document.getElementById('out').textContent = JSON.stringify({ missing: input.parts.filter(p => !at(parse(), p.path)).map(p => p.path) });
  }
} catch (error) { document.getElementById('out').textContent = JSON.stringify({ error: String(error) }) }
</script></body></html>
"@)
    $uri = ([Uri]$page).AbsoluteUri
    $size = if ($Parts) { '1220,410' } else { '1000,1000' }
    # Edge logs harmless noise on stderr, which Windows PowerShell turns into an error under 'Stop'.
    $ErrorActionPreference = 'Continue'
    & $edge --headless=new --disable-gpu --no-first-run --hide-scrollbars --virtual-time-budget=4000 --window-size=$size --screenshot="$Out" $uri 2>$null | Out-Null
    $html = & $edge --headless=new --disable-gpu --no-first-run --virtual-time-budget=4000 --dump-dom $uri 2>$null | Out-String
    $ErrorActionPreference = 'Stop'
    $match = [regex]::Match($html, '<pre id="out">(.*?)</pre>', 'Singleline')
    if (-not $match.Success) { throw 'Edge did not draw the character' }
    $result = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
    if ($result -match '"error"') { throw "Could not draw the character: $result" }
    Write-Output "image: $Out"
    Write-Output $result
}
finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
