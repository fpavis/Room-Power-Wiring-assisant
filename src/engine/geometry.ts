import {
  ElectricalNode,
  ElementCategory,
  RoomDimensions,
  SurfaceId,
  WallId,
} from '../types/electrical';

export interface Point {
  x: number;
  y: number;
}

/** Rounds to the nearest millimetre, the precision positions are stored at. */
export const roundMm = (meters: number): number =>
  Math.round(meters * 1000) / 1000;

/**
 * Size of a surface in its stored coordinates. The ceiling always uses
 * x along room.length (from the west wall) and y along room.width (from the south wall).
 */
export function getSurfaceSize(
  surface: SurfaceId,
  room: RoomDimensions
): { width: number; height: number } {
  switch (surface) {
    case 'north':
    case 'south':
      return { width: room.length, height: room.height };
    case 'east':
    case 'west':
      return { width: room.width, height: room.height };
    case 'ceiling':
      return { width: room.length, height: room.width };
  }
}

/** Size of the ceiling as drawn when hinged to the top edge of `center`. */
export function getCeilingViewSize(
  room: RoomDimensions,
  center: WallId
): { width: number; height: number } {
  return center === 'north' || center === 'south'
    ? { width: room.length, height: room.width }
    : { width: room.width, height: room.length };
}

/** Stored ceiling point to the drawn position; view y = 0 is the hinge edge. */
export function ceilingToView(
  p: Point,
  room: RoomDimensions,
  center: WallId
): Point {
  const { length: L, width: W } = room;
  switch (center) {
    case 'north':
      return { x: p.x, y: W - p.y };
    case 'south':
      return { x: L - p.x, y: p.y };
    case 'west':
      return { x: p.y, y: p.x };
    case 'east':
      return { x: W - p.y, y: L - p.x };
  }
}

export function viewToCeiling(
  v: Point,
  room: RoomDimensions,
  center: WallId
): Point {
  const { length: L, width: W } = room;
  switch (center) {
    case 'north':
      return { x: v.x, y: W - v.y };
    case 'south':
      return { x: L - v.x, y: v.y };
    case 'west':
      return { x: v.y, y: v.x };
    case 'east':
      return { x: L - v.y, y: W - v.x };
  }
}

/** Point on the ceiling edge directly above a position along a wall. */
export function wallPointOnCeilingEdge(
  wall: WallId,
  localX: number,
  room: RoomDimensions
): Point {
  const { length: L, width: W } = room;
  switch (wall) {
    case 'north':
      return { x: localX, y: W };
    case 'east':
      return { x: L, y: W - localX };
    case 'south':
      return { x: L - localX, y: 0 };
    case 'west':
      return { x: 0, y: localX };
  }
}

export function isNodeOutsideSurface(
  node: Pick<ElectricalNode, 'surface' | 'x' | 'y'>,
  room: RoomDimensions
): boolean {
  const { width, height } = getSurfaceSize(node.surface, room);
  return node.x < 0 || node.x > width || node.y < 0 || node.y > height;
}

/** Real outer dimensions in metres (width, height). */
export const ELEMENT_FOOTPRINT: Record<
  ElementCategory,
  { width: number; height: number; shape: 'rect' | 'circle' }
> = {
  socket_single: { width: 0.08, height: 0.08, shape: 'rect' },
  socket_double: { width: 0.15, height: 0.08, shape: 'rect' },
  socket_shuko_3p: { width: 0.1, height: 0.1, shape: 'rect' },
  socket_fixed_1p: { width: 0.1, height: 0.1, shape: 'rect' },
  switch_single: { width: 0.08, height: 0.08, shape: 'rect' },
  switch_double: { width: 0.08, height: 0.08, shape: 'rect' },
  switch_two_way: { width: 0.08, height: 0.08, shape: 'rect' },
  switch_cross: { width: 0.08, height: 0.08, shape: 'rect' },
  junction_box: { width: 0.1, height: 0.1, shape: 'circle' },
  distribution_board: { width: 0.3, height: 0.4, shape: 'rect' },
  light_ceiling: { width: 0.3, height: 0.3, shape: 'circle' },
  light_wall: { width: 0.15, height: 0.15, shape: 'circle' },
};

/** Standard drawing scales, largest first. */
export const PRINT_SCALES = [25, 50, 100, 200, 500] as const;

/** Largest standard scale at which `widthM` x `heightM` fits in the given millimetres. */
export function pickPrintScale(
  widthM: number,
  heightM: number,
  availableWidthMm: number,
  availableHeightMm: number
): (typeof PRINT_SCALES)[number] {
  for (const scale of PRINT_SCALES) {
    if (
      (widthM * 1000) / scale <= availableWidthMm &&
      (heightM * 1000) / scale <= availableHeightMm
    ) {
      return scale;
    }
  }
  return PRINT_SCALES[PRINT_SCALES.length - 1];
}

/** Metres as typed: two decimals minimum, millimetres shown only when present. */
export function formatMeters(value: number): string {
  const rounded = roundMm(value);
  const decimals = Math.abs(rounded * 100 - Math.round(rounded * 100)) > 1e-6 ? 3 : 2;
  return rounded.toFixed(decimals).replace('.', ',');
}

export function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals).replace('.', ',');
}

/** Accepts "2,05" and "2.05"; null when the text is not a number. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Greedy non-overlapping placement for fixed-size tag labels around anchors. */
export interface LabelRequest {
  id: string;
  x: number;
  y: number;
  anchorWidth: number;
  anchorHeight: number;
  labelWidth: number;
  labelHeight: number;
  gap: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export type Box = [x: number, y: number, width: number, height: number];

export function placeLabels(
  requests: LabelRequest[],
  obstacles: Box[],
  /** Things a label should avoid but may touch when nothing else fits, e.g. cables. */
  softObstacles: Box[] = []
): Map<string, { x: number; y: number }> {
  const placed: Box[] = [...obstacles];
  const anchors: Box[] = requests.map((r) => [
    r.x - r.anchorWidth / 2,
    r.y - r.anchorHeight / 2,
    r.anchorWidth,
    r.anchorHeight,
  ]);
  const overlaps = (a: Box, b: Box, pad: number) =>
    a[0] < b[0] + b[2] + pad &&
    a[0] + a[2] + pad > b[0] &&
    a[1] < b[1] + b[3] + pad &&
    a[1] + a[3] + pad > b[1];

  const result = new Map<string, { x: number; y: number }>();
  for (const r of requests) {
    const { labelWidth: w, labelHeight: h, gap } = r;
    const halfW = r.anchorWidth / 2;
    const halfH = r.anchorHeight / 2;
    const step = h * 0.6;
    let chosen: [number, number] = [r.x + halfW + gap, r.y - h / 2];
    let bestScore = Infinity;

    for (let ring = 0; ring < 9; ring++) {
      const g = gap + ring * step;
      const candidates: [number, number][] = [
        [r.x + halfW + g, r.y - h / 2],
        [r.x - halfW - w - g, r.y - h / 2],
        [r.x + halfW + g, r.y + g * 0.5],
        [r.x - halfW - w - g, r.y + g * 0.5],
        [r.x + halfW + g, r.y - h - g * 0.5],
        [r.x - halfW - w - g, r.y - h - g * 0.5],
        [r.x - w / 2, r.y + halfH + g],
        [r.x - w / 2, r.y - halfH - h - g],
      ];
      for (const [x, y] of candidates) {
        const inside =
          x >= r.bounds.x + 1 &&
          y >= r.bounds.y + 1 &&
          x + w <= r.bounds.x + r.bounds.width - 1 &&
          y + h <= r.bounds.y + r.bounds.height - 1;
        if (!inside) continue;
        const box: Box = [x, y, w, h];
        const hard =
          placed.filter((p) => overlaps(box, p, 2)).length +
          anchors.filter((a) => overlaps(box, a, 0)).length;
        const soft = softObstacles.filter((p) => overlaps(box, p, 1)).length;
        const score = hard * 1000 + soft * 50 + ring;
        if (score < bestScore) {
          bestScore = score;
          chosen = [x, y];
        }
      }
      if (bestScore <= ring) break;
    }

    placed.push([chosen[0], chosen[1], w, h]);
    result.set(r.id, { x: chosen[0], y: chosen[1] });
  }
  return result;
}
