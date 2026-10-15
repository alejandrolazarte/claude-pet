import type { Mood } from '../types'

// The white blob of overlay/web/src/Pet.tsx as markup, for the surfaces that draw an Svg (the mobile app).
const MOTION: Record<Mood, string> = {
  idle: '<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="2.4s" repeatCount="indefinite"/>',
  thinking: '<animateTransform attributeName="transform" type="rotate" values="-4 28 40;4 28 40;-4 28 40" dur="1.6s" repeatCount="indefinite"/>',
  working: '<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur=".45s" repeatCount="indefinite"/>',
  browsing: '<animateTransform attributeName="transform" type="translate" values="-2 0;2 0;-2 0" dur="1.2s" repeatCount="indefinite"/>',
  asking: '<animateTransform attributeName="transform" type="translate" values="-1.5 0;1.5 0;-1.5 0" dur=".25s" repeatCount="indefinite"/>',
  happy: '<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur=".3s" repeatCount="4"/>',
  sad: '',
  sleeping: '<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="3.5s" repeatCount="indefinite"/>',
}

const BLINK = '<animate attributeName="ry" values="3.4;3.4;.4;3.4" keyTimes="0;.94;.97;1" dur="4s" repeatCount="indefinite"/>'

function eyes(mood: Mood): string {
  if (mood === 'sleeping' || mood === 'happy') {
    const curve = mood === 'happy' ? -4 : 3

    return `<path d="M19 25q3 ${curve} 6 0M31 25q3 ${curve} 6 0" stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"/>`
  }

  const y = mood === 'sad' ? 27 : 25

  return `<ellipse cx="22" cy="${y}" rx="2.6" ry="3.4" fill="#222">${BLINK}</ellipse><ellipse cx="34" cy="${y}" rx="2.6" ry="3.4" fill="#222">${BLINK}</ellipse>`
}

const EXTRA: Record<Mood, string> = {
  idle: '',
  working: '',
  happy: '',
  sleeping: '<text x="44" y="12" font-size="9" fill="#9aa" font-family="sans-serif">z<animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/></text>',
  thinking: '<g fill="#9aa"><circle cx="46" cy="10" r="1.6"/><circle cx="50" cy="7" r="2"><animate attributeName="opacity" values=".2;1;.2" dur="1.2s" repeatCount="indefinite"/></circle></g>',
  sad: '<path d="M38 20q1 4 0 6" stroke="#7bc" stroke-width="2" fill="none"/>',
  asking: '<g><circle cx="48" cy="10" r="6" fill="#e5484d"><animate attributeName="r" values="6;6.9;6" dur=".7s" repeatCount="indefinite"/></circle><text x="48" y="13.5" font-size="10" fill="#fff" font-family="sans-serif" font-weight="700" text-anchor="middle">!</text></g>',
  browsing: '<path d="M45 6l0 10l3-3l2 4l2-1l-2-4l4 0z" fill="#fff" stroke="#222" stroke-width="0.8" stroke-linejoin="round"><animateTransform attributeName="transform" type="translate" values="0 0;-3 3;0 0" dur=".8s" repeatCount="indefinite"/></path>',
}

export function blobSvg(mood: Mood): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 44">',
    '<ellipse cx="28" cy="41" rx="15" ry="2" fill="#000" opacity="0.15"/>',
    `<g>${MOTION[mood]}`,
    '<path d="M10 38C8 24 14 10 28 10s20 14 18 28c-1 3-35 3-36 0z" fill="#f7f7f7" stroke="#d8d8d8"/>',
    '<circle cx="17" cy="31" r="2.4" fill="#f9b4c4" opacity="0.7"/>',
    '<circle cx="39" cy="31" r="2.4" fill="#f9b4c4" opacity="0.7"/>',
    eyes(mood),
    '</g>',
    EXTRA[mood],
    '</svg>',
  ].join('')
}
