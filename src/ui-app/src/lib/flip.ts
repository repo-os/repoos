/**
 * Minimal FLIP bookkeeping for the optional card glide (#0292).
 *
 * When a task changes status, Vue unmounts its card from the source column
 * and mounts a fresh card in the destination column in the same render. To
 * glide it between the two positions, the card captures its OLD bounding of
 * the source rect right before it unmounts (`recordOrigin`) and, on mount in
 * its new home, consumes that rect (`takeOrigin`) to seed a translate from
 * the old spot down to the new one — the classic First/Last/Invert/Play.
 *
 * A task id with no recorded origin (normal mount, no transition) simply gets
 * null and never animates, so ordinary rendering is untouched.
 */

export interface FlipRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Old positions of cards mid-transition, keyed by task id. */
const origins = new Map<string, FlipRect>();

/** Record where a card was before it unmounts because its column changed. */
export function recordOrigin(id: string, rect: FlipRect): void {
  origins.set(id, rect);
}

/** Consume the recorded origin for a task id, or null if there is none. */
export function takeOrigin(id: string): FlipRect | null {
  const rect = origins.get(id) ?? null;
  origins.delete(id);
  return rect;
}
