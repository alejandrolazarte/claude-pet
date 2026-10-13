// Character art is downloaded third-party SVG: drop anything that could run before it reaches dangerouslySetInnerHTML.
export function parseArt(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  doc.querySelectorAll('script, foreignObject').forEach(node => node.remove())
  doc.querySelectorAll('*').forEach(node =>
    [...node.attributes]
      .filter(a => a.name.toLowerCase().startsWith('on') || /^\s*javascript:/i.test(a.value))
      .forEach(a => node.removeAttribute(a.name)),
  )

  return doc
}
