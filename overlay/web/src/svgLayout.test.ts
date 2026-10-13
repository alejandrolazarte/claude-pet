import { describe, expect, it } from 'vitest'

import { frameLoopSeconds, neutralFrameOf, parseParts, parseViewBox, partSwing } from './svgLayout'

describe('neutralFrameOf', () => {
  it('finds the frame-by-frame animation and the frame shown first', () => {
    // Arrange: Pochita's export, the last group starts visible
    const visibility = [
      'hidden; visible; visible',
      'hidden; visible; hidden; hidden',
      'hidden; visible; hidden; hidden',
      'hidden; visible; hidden; hidden',
      'visible; hidden; hidden',
    ]

    // Act
    const neutral = neutralFrameOf(visibility)

    // Assert
    expect(neutral).toBe(4)
  })

  it('is not a frame animation when a group has no visibility animation, or there is a single group', () => {
    // Act
    const missing = neutralFrameOf(['visible; hidden', undefined])
    const single = neutralFrameOf(['visible; hidden'])
    const none = neutralFrameOf([])

    // Assert
    expect(missing).toBeUndefined()
    expect(single).toBeUndefined()
    expect(none).toBeUndefined()
  })

  it('falls back to the first frame when none starts visible', () => {
    // Act
    const neutral = neutralFrameOf(['hidden; visible', 'hidden; visible'])

    // Assert
    expect(neutral).toBe(0)
  })
})

describe('parseViewBox', () => {
  it('reads four numbers separated by spaces or commas', () => {
    // Act
    const spaces = parseViewBox('25 30 455 400')
    const commas = parseViewBox(' 0,0, 4000 ,4000 ')

    // Assert
    expect(spaces).toEqual({ x: 25, y: 30, width: 455, height: 400 })
    expect(commas).toEqual({ x: 0, y: 0, width: 4000, height: 4000 })
  })

  it('rejects anything that is not a usable box', () => {
    // Act
    const results = [undefined, '', '0 0 100', '0 0 0 100', '0 0 100 -5', 'a b c d', '0 0 100 100 5'].map(parseViewBox)

    // Assert
    expect(results).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined])
  })
})

describe('parseParts', () => {
  it('keeps the parts with a path, a pivot and a swing', () => {
    // Act
    const parts = parseParts([
      { path: '0.1.0', pivot: '1780 2600', swing: -4 },
      { path: '2', pivot: '10,20', swing: 6 },
    ])

    // Assert
    expect(parts).toEqual([
      { path: [0, 1, 0], pivot: { x: 1780, y: 2600 }, swing: -4 },
      { path: [2], pivot: { x: 10, y: 20 }, swing: 6 },
    ])
  })

  it('drops whatever is malformed, from an edited file anyone can write', () => {
    // Act
    const parts = parseParts([
      { path: '0.x', pivot: '1 2', swing: 4 },
      { path: '0', pivot: '1', swing: 4 },
      { path: '0', pivot: '1 2', swing: 'mucho' },
      { path: '0', pivot: '1 2', swing: 90 },
      { path: '', pivot: '1 2', swing: 4 },
      null,
      'tail',
    ])
    const notAList = parseParts({ path: '0', pivot: '1 2', swing: 4 })

    // Assert
    expect(parts).toEqual([])
    expect(notAList).toEqual([])
  })
})

describe('partSwing', () => {
  const tail = { path: [0], pivot: { x: 100, y: 200 }, swing: -4 }

  it('wags around the pivot, wider and faster the busier Claude is, each part a little later', () => {
    // Act
    const idle = partSwing('idle', tail, 0)
    const working = partSwing('working', tail, 2)

    // Assert
    expect(idle).toEqual({ values: '0 100 200;-4 100 200;0 100 200', seconds: 3, begin: 0 })
    expect(working).toEqual({ values: '0 100 200;-8 100 200;0 100 200', seconds: 0.6, begin: 0.24 })
  })

  it('droops toward the outside when Claude is sad', () => {
    // Act
    const sad = partSwing('sad', tail, 0)

    // Assert
    expect(sad).toEqual({ droop: 'rotate(-8 100 200)' })
  })
})

describe('frameLoopSeconds', () => {
  it('keeps Pochita, five frames, at the loop lengths it was tuned with', () => {
    // Act
    const loops = (['idle', 'working', 'browsing', 'happy'] as const).map(mood => frameLoopSeconds(mood, 5))

    // Assert
    expect(loops).toEqual([2.4, 0.567, 0.9, 0.4])
  })

  it('gives every frame the same time, so a 30-frame video loops six times slower than five frames', () => {
    // Act
    const working = frameLoopSeconds('working', 30)
    const happy = frameLoopSeconds('happy', 30)

    // Assert
    expect(working).toBe(3.402)
    expect(happy).toBe(2.4)
  })

  it('caps the calm loops, so a long video waits or browses at about its own speed, not in slow motion', () => {
    // Act
    const idle = frameLoopSeconds('idle', 19)
    const browsing = frameLoopSeconds('browsing', 19)

    // Assert
    expect(idle).toBe(3.233)
    expect(browsing).toBe(2.586)
  })

  it('never waits or browses faster than it works, whatever the number of frames', () => {
    // Act
    const loops = [2, 5, 12, 19, 30, 60].map(frames => ['idle', 'browsing', 'working'].map(mood => frameLoopSeconds(mood as 'idle', frames)))

    // Assert
    loops.forEach(([idle, browsing, working]) => {
      expect(idle).toBeGreaterThanOrEqual(browsing as number)
      expect(browsing).toBeGreaterThanOrEqual(working as number)
    })
  })

  it('holds the neutral frame while thinking, asking, sad or sleeping', () => {
    // Act
    const loops = (['thinking', 'asking', 'sad', 'sleeping'] as const).map(mood => frameLoopSeconds(mood, 30))

    // Assert
    expect(loops).toEqual(['still', 'still', 'still', 'still'])
  })
})
