export type Point = { x: number; y: number }

// A press that stays within a few pixels is a tap; past that it is the start of a drag.
export function movedBeyond(start: Point, point: Point, px: number): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) > px
}
