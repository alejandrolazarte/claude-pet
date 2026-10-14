import type { ReactElement } from 'react'

import { parseArt } from './art'
import { frameLoopSeconds, neutralFrameOf, parseParts, parseViewBox, partSwing, type Box } from './svgLayout'
import type { Mood } from './sessions'

export type GenericArt = { box: Box; outline: boolean; html: (mood: Mood) => string }

const SIZE = 110

const SVG_NS = 'http://www.w3.org/2000/svg'

export function genericArt(svg: string, viewBox: string | undefined, partsJson?: unknown, outline = false): GenericArt {
  const root = parseArt(svg).querySelector('svg')
  const groups = [...(root?.children ?? [])]
  const parts = parseParts(partsJson)
  const box = parseViewBox(viewBox) ?? parseViewBox(root?.getAttribute('viewBox') ?? undefined) ?? { x: 0, y: 0, width: 100, height: 100 }
  const neutral = neutralFrameOf(
    groups.map(group => group.querySelector(':scope > animate[attributeName="visibility"]')?.getAttribute('values') ?? undefined),
  )
  const render = (mood: Mood, edit: (group: Element, index: number) => void) => {
    if (!root) {
      return ''
    }
    const copy = root.cloneNode(true) as Element
    ;[...copy.children].forEach(edit)
    // Find every part before wrapping any: a wrapper shifts the indices of the paths after it.
    const targets = parts.map(part => ({ part, element: part.path.reduce<Element | undefined>((node, i) => node?.children[i], copy) }))
    targets.forEach(({ part, element }, index) => {
      if (!element) {
        return
      }
      const wrapper = copy.ownerDocument.createElementNS(SVG_NS, 'g')
      element.replaceWith(wrapper)
      wrapper.appendChild(element)
      const swing = partSwing(mood, part, index)
      if ('droop' in swing) {
        wrapper.setAttribute('transform', swing.droop)
        return
      }
      const animation = copy.ownerDocument.createElementNS(SVG_NS, 'animateTransform')
      animation.setAttribute('attributeName', 'transform')
      animation.setAttribute('type', 'rotate')
      animation.setAttribute('values', swing.values)
      animation.setAttribute('dur', `${swing.seconds}s`)
      animation.setAttribute('begin', `${swing.begin}s`)
      animation.setAttribute('repeatCount', 'indefinite')
      wrapper.prepend(animation)
    })

    return [...copy.children].map(child => child.outerHTML).join('')
  }
  const rendered = new Map<Mood, string>()

  return {
    box,
    outline,
    html: mood => {
      let html = rendered.get(mood)
      if (html === undefined) {
        const playback = frameLoopSeconds(mood, groups.length)
        html =
          neutral === undefined
            ? render(mood, () => {})
            : playback === 'still'
              ? render(mood, (group, index) => {
                  group.querySelectorAll('animate').forEach(a => a.remove())
                  group.setAttribute('visibility', index === neutral ? 'visible' : 'hidden')
                })
              : render(mood, group => group.querySelectorAll('animate').forEach(a => a.setAttribute('dur', `${playback}s`)))
        rendered.set(mood, html)
      }

      return html
    },
  }
}

function bodyMotion(mood: Mood, { x, y, width, height }: Box): ReactElement | null {
  const u = height / 100
  const pivot = `${x + width / 2} ${y + height}`
  const translate = (values: string, dur: string, repeat = 'indefinite') => (
    <animateTransform attributeName="transform" type="translate" values={values} dur={dur} repeatCount={repeat} />
  )
  const rotate = (degrees: number, dur: string) => (
    <animateTransform
      attributeName="transform"
      type="rotate"
      values={`${-degrees} ${pivot};${degrees} ${pivot};${-degrees} ${pivot}`}
      dur={dur}
      repeatCount="indefinite"
    />
  )

  switch (mood) {
    case 'idle':
      return translate(`0 0;0 ${-1.5 * u};0 0`, '2.4s')
    case 'thinking':
      return rotate(3, '1.6s')
    case 'working':
      return translate(`0 0;0 ${-3.5 * u};0 0`, '.45s')
    case 'browsing':
      return rotate(4, '1.2s')
    case 'asking':
      return translate(`${-2 * u} 0;${2 * u} 0;${-2 * u} 0`, '.25s')
    case 'happy':
      return translate(`0 0;0 ${-4 * u};0 0`, '.3s', '4')
    case 'sleeping':
      return translate(`0 0;0 ${0.75 * u};0 0`, '3.5s')
    default:
      return null
  }
}

// Two hops and a wiggle on the feet: the same 1.2 s as POKE_MS in App.tsx.
function pokeMotion({ x, y, width, height }: Box): ReactElement {
  const u = height / 100
  const pivot = `${x + width / 2} ${y + height}`

  return (
    <>
      <animateTransform attributeName="transform" type="translate" values={`0 0;0 ${-6 * u};0 0;0 ${-3 * u};0 0`} dur="1.2s" fill="freeze" />
      <animateTransform
        attributeName="transform"
        type="rotate"
        values={`0 ${pivot};-5 ${pivot};5 ${pivot};-3 ${pivot};0 ${pivot}`}
        dur="1.2s"
        additive="sum"
        fill="freeze"
      />
    </>
  )
}

export function PokeHeart({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 10})`}>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -14" dur="1.2s" fill="freeze" />
        <path d="M0,4 C-6,-1 -4,-6 0,-3 C4,-6 6,-1 0,4 Z" fill="#f2557a" stroke="#fff" strokeWidth={1}>
          <animate attributeName="opacity" values="1;1;0" keyTimes="0;.6;1" dur="1.2s" fill="freeze" />
        </path>
      </g>
    </g>
  )
}

// Extras sit near the top right corner, since nothing is known about where its face is. Divided by the zoom,
// so the size slider grows the character but not the extras.
function Extra({ mood, poked, box: { x, y, width, height }, zoom }: { mood: Mood; poked: boolean; box: Box; zoom: number }) {
  const u = height / 100 / zoom
  const ax = x + width * 0.86
  const ay = y + height * 0.14

  if (poked) {
    return <PokeHeart x={ax} y={ay} size={12 * u} />
  }

  switch (mood) {
    case 'sleeping':
      return (
        <text x={ax - 2 * u} y={ay + 4 * u} fontSize={12 * u} fill="#555" fontFamily="sans-serif" fontWeight={700}>
          z<animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
        </text>
      )
    case 'thinking':
      return (
        <g fill="#555">
          <circle cx={ax - 3 * u} cy={ay + 3 * u} r={2.2 * u} />
          <circle cx={ax + 3 * u} cy={ay - 3.5 * u} r={3.2 * u}>
            <animate attributeName="opacity" values=".2;1;.2" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </g>
      )
    case 'sad':
      return <path d={`M${ax} ${ay}q${2 * u} ${4.5 * u} 0 ${6.5 * u}q${-2 * u} ${-2 * u} 0 ${-6.5 * u}z`} fill="#7bc" />
    case 'asking':
      return (
        <g>
          <circle cx={ax} cy={ay} r={8 * u} fill="#e5484d">
            <animate attributeName="r" values={`${8 * u};${9.2 * u};${8 * u}`} dur=".7s" repeatCount="indefinite" />
          </circle>
          <text x={ax} y={ay + 4.2 * u} fontSize={12 * u} fill="#fff" fontFamily="sans-serif" fontWeight={700} textAnchor="middle">
            !
          </text>
        </g>
      )
    case 'browsing':
      return (
        <g transform={`translate(${ax - 4 * u} ${ay - 6 * u}) scale(${u / 4})`}>
          <path d="M0 0v60l18-18l13 26l13-6l-13-26h24z" fill="#fff" stroke="#111" strokeWidth={5} strokeLinejoin="round">
            <animateTransform attributeName="transform" type="translate" values="0 0;-18 18;0 0" dur=".8s" repeatCount="indefinite" />
          </path>
        </g>
      )
    default:
      return null
  }
}

export function Generic({ art, scale: zoom, mood, poke, label }: { art: GenericArt; scale: number; mood: Mood; poke?: number; label: string }) {
  const { box } = art
  const scale = (SIZE * zoom) / Math.max(box.width, box.height)
  const poked = poke !== undefined

  return (
    // key: a new mood or a new tap swaps the SMIL elements, so the animation starts over
    <svg
      key={poke ?? mood}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      width={Math.round(box.width * scale)}
      height={Math.round(box.height * scale)}
      className={art.outline ? 'outlined' : undefined}
      aria-label={label}
    >
      <g>
        {poked ? pokeMotion(box) : bodyMotion(mood, box)}
        {/* Parts and frame loops play at their happy speed while the reaction lasts. */}
        <g dangerouslySetInnerHTML={{ __html: art.html(poked ? 'happy' : mood) }} />
      </g>
      <Extra mood={mood} poked={poked} box={box} zoom={zoom} />
    </svg>
  )
}
