/**
 * Pure model for a finger drawing: an ordered list of committed strokes plus the one in progress.
 * The canvas screen renders from this and mutates it through these reducers; keeping it pure makes
 * undo/clear/stroke-building testable without Skia or touch input. Rendering turns each stroke into
 * an SVG path string (strokeToSvgPath) that Skia draws.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  color: string;
  width: number;
  points: Point[];
}

export interface DrawingState {
  strokes: Stroke[];
  /** The stroke currently under the finger, not yet committed. */
  current: Stroke | null;
}

export const emptyDrawing: DrawingState = { strokes: [], current: null };

/** Start a new stroke at `point`. Any uncommitted stroke is dropped first. */
export function beginStroke(
  state: DrawingState,
  stroke: { id: string; color: string; width: number; point: Point },
): DrawingState {
  return {
    strokes: state.strokes,
    current: { id: stroke.id, color: stroke.color, width: stroke.width, points: [stroke.point] },
  };
}

/** Append a point to the in-progress stroke. No-op if none is active. */
export function extendStroke(state: DrawingState, point: Point): DrawingState {
  if (!state.current) return state;
  return {
    strokes: state.strokes,
    current: { ...state.current, points: [...state.current.points, point] },
  };
}

/** Commit the in-progress stroke (if it has any points) to the drawing. */
export function endStroke(state: DrawingState): DrawingState {
  if (!state.current || state.current.points.length === 0) {
    return { strokes: state.strokes, current: null };
  }
  return { strokes: [...state.strokes, state.current], current: null };
}

/** Remove the most recently committed stroke. */
export function undo(state: DrawingState): DrawingState {
  return { strokes: state.strokes.slice(0, -1), current: null };
}

/** Remove every stroke. (The round-trip's background image is separate, so it survives.) */
export function clear(state: DrawingState): DrawingState {
  return emptyDrawing;
}

/** True when nothing has been drawn — used to disable Send on an empty canvas. */
export function isEmpty(state: DrawingState): boolean {
  return state.strokes.length === 0 && !state.current;
}

/**
 * Serialize a stroke's points to an SVG path: move to the first point, then line to each next.
 * A single-point tap becomes a degenerate move (Skia renders a round cap as a dot). Empty → "".
 */
export function strokeToSvgPath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const move = `M ${first.x} ${first.y}`;
  if (rest.length === 0) return `${move} L ${first.x} ${first.y}`;
  return move + rest.map((p) => ` L ${p.x} ${p.y}`).join('');
}
