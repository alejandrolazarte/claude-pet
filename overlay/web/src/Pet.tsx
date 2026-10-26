import type { ReactElement, ReactNode } from 'react'

import type { CharacterId } from './characters'
import { Generic, PokeHeart, type GenericArt } from './Generic'
import type { Mood } from './sessions'

const MOTION: Record<Mood, ReactElement | null> = {
  idle: <animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="2.4s" repeatCount="indefinite" />,
  thinking: <animateTransform attributeName="transform" type="rotate" values="-4 28 40;4 28 40;-4 28 40" dur="1.6s" repeatCount="indefinite" />,
  working: <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur=".45s" repeatCount="indefinite" />,
  browsing: <animateTransform attributeName="transform" type="translate" values="-2 0;2 0;-2 0" dur="1.2s" repeatCount="indefinite" />,
  asking: <animateTransform attributeName="transform" type="translate" values="-1.5 0;1.5 0;-1.5 0" dur=".25s" repeatCount="indefinite" />,
  happy: <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur=".3s" repeatCount="4" />,
  sad: null,
  sleeping: <animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="3.5s" repeatCount="indefinite" />,
}

// Two hops and a wiggle on the feet: the same 1.2 s as POKE_MS in App.tsx.
const POKE_MOTION = (
  <>
    <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0;0 -3;0 0" dur="1.2s" fill="freeze" />
    <animateTransform
      attributeName="transform"
      type="rotate"
      values="0 28 40;-5 28 40;5 28 40;-3 28 40;0 28 40"
      dur="1.2s"
      additive="sum"
      fill="freeze"
    />
  </>
)

const BLINK = <animate attributeName="ry" values="3.4;3.4;.4;3.4" keyTimes="0;.94;.97;1" dur="4s" repeatCount="indefinite" />

function Eyes({ mood }: { mood: Mood }) {
  if (mood === 'sleeping' || mood === 'happy') {
    const curve = mood === 'happy' ? -4 : 3

    return (
      <path
        d={`M19 25q3 ${curve} 6 0M31 25q3 ${curve} 6 0`}
        stroke="#222"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    )
  }

  const y = mood === 'sad' ? 27 : 25

  return (
    <>
      <ellipse cx={22} cy={y} rx={2.6} ry={3.4} fill="#222">{BLINK}</ellipse>
      <ellipse cx={34} cy={y} rx={2.6} ry={3.4} fill="#222">{BLINK}</ellipse>
    </>
  )
}

function Extra({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'sleeping':
      return (
        <text x={44} y={12} fontSize={9} fill="#9aa" fontFamily="sans-serif">
          z<animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
        </text>
      )
    case 'thinking':
      return (
        <g fill="#9aa">
          <circle cx={46} cy={10} r={1.6} />
          <circle cx={50} cy={7} r={2}>
            <animate attributeName="opacity" values=".2;1;.2" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </g>
      )
    case 'sad':
      return <path d="M38 20q1 4 0 6" stroke="#7bc" strokeWidth={2} fill="none" />
    case 'asking':
      return (
        <g>
          <circle cx={48} cy={10} r={6} fill="#e5484d">
            <animate attributeName="r" values="6;6.9;6" dur=".7s" repeatCount="indefinite" />
          </circle>
          <text x={48} y={13.5} fontSize={10} fill="#fff" fontFamily="sans-serif" fontWeight={700} textAnchor="middle">
            !
          </text>
        </g>
      )
    case 'browsing':
      return (
        <path d="M45 6l0 10l3-3l2 4l2-1l-2-4l4 0z" fill="#fff" stroke="#222" strokeWidth={0.8} strokeLinejoin="round">
          <animateTransform attributeName="transform" type="translate" values="0 0;-3 3;0 0" dur=".8s" repeatCount="indefinite" />
        </path>
      )
    default:
      return null
  }
}

function Blob({ mood, poke, label, scale }: { mood: Mood; poke?: number; label: string; scale: number }) {
  const poked = poke !== undefined

  return (
    // key: a new mood or a new tap swaps the SMIL elements, so the animation starts over
    <svg key={poke ?? mood} viewBox="0 0 56 44" width={Math.round(72 * scale)} height={Math.round(57 * scale)} aria-label={label}>
      <ellipse cx={28} cy={41} rx={15} ry={2} fill="#000" opacity={0.15} />
      <g>
        {poked ? POKE_MOTION : MOTION[mood]}
        <path d="M10 38C8 24 14 10 28 10s20 14 18 28c-1 3-35 3-36 0z" fill="#f7f7f7" stroke="#d8d8d8" />
        <circle cx={17} cy={31} r={2.4} fill="#f9b4c4" opacity={0.7} />
        <circle cx={39} cy={31} r={2.4} fill="#f9b4c4" opacity={0.7} />
        <Eyes mood={poked ? 'happy' : mood} />
      </g>
      {/* The size slider grows the blob but not its extras, which are drawn around (48, 10). */}
      <g transform={`translate(48 10) scale(${1 / scale}) translate(-48 -10)`}>
        {poked ? <PokeHeart x={48} y={10} size={9} /> : <Extra mood={mood} />}
      </g>
    </svg>
  )
}

export type Art = { custom: Map<string, GenericArt> }

type PetProps = {
  art: Art
  character: CharacterId
  scale: number
  mood: Mood
  poke?: number
  label: string
  heading?: string
  others?: number
  onOthersHover?: (isOver: boolean) => void
  bubble?: ReactNode
}

export function Pet({ art, character, scale, mood, poke, label, heading, others = 0, onOthersHover, bubble }: PetProps) {
  return (
    <div className="pet">
      {bubble}
      {art.custom.has(character) ? (
        <Generic art={art.custom.get(character)!} scale={scale} mood={mood} poke={poke} label={label} />
      ) : (
        <Blob mood={mood} poke={poke} label={label} scale={scale} />
      )}
      {/* Next to the caption, not in a corner: the caption stays at the character's feet at any size or shape. */}
      <div className="footer">
        {others > 0 && (
          // mousemove, not mouseenter: the page never sees the cursor leave the window, so enter would not fire again
          <span className="others" onMouseMove={() => onOthersHover?.(true)} onMouseLeave={() => onOthersHover?.(false)}>
            +{others}
          </span>
        )}
        <div className="caption">
          {heading && <span>{heading}</span>}
          <span className="label">{label}</span>
        </div>
      </div>
    </div>
  )
}
