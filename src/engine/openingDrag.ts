import {
  ElectricalNode,
  FurnitureItem,
  RoomDimensions,
  WallId,
  WallOpening,
} from '../types/electrical';
import { furnitureBlockingOpening } from './furniture';
import { getSurfaceSize, roundMm } from './geometry';

export interface OpeningLock {
  axis: 'x' | 'y';
  /** Locked value of offsetFromLeft or sillHeight. */
  value: number;
  /** Position of the guide line in wall metres. */
  guide: number;
  label: string;
}

export interface OpeningDragResult {
  wall: WallId;
  offsetFromLeft: number;
  sillHeight: number;
  valid: boolean;
  reason: string | null;
  locks: OpeningLock[];
}

const SNAP_DISTANCE = 0.06;
const EDGE_DISTANCE = 0.15;
const STANDARD_SILLS = [0.9, 1.05];
const STANDARD_DOOR_HEAD = 2.05;
const MIN_GAP = 0.05;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function firstWithin(raw: number, options: OpeningLock[]): OpeningLock | null {
  let best: OpeningLock | null = null;
  let bestDistance = SNAP_DISTANCE;
  for (const option of options) {
    const distance = Math.abs(option.value - raw);
    if (distance <= bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Position for an opening being dragged. Doors stay on the floor, everything stays
 * inside the wall, and good positions (wall centre, 15 cm from edges and neighbours,
 * standard sills, aligned lintels) lock in when the opening comes close.
 */
export function computeOpeningDrag(
  opening: WallOpening,
  wall: WallId,
  rawOffset: number,
  rawSill: number,
  room: RoomDimensions,
  openings: WallOpening[],
  nodes: ElectricalNode[],
  furniture: FurnitureItem[] = []
): OpeningDragResult {
  const wallWidth = getSurfaceSize(wall, room).width;
  const others = openings.filter((o) => o.id !== opening.id);
  const locks: OpeningLock[] = [];
  const { width, height } = opening;

  const maxOffset = wallWidth - width;
  const maxSill = room.height - height;
  if (maxOffset < 0 || maxSill < 0) {
    return {
      wall,
      offsetFromLeft: Math.max(0, rawOffset),
      sillHeight: opening.type === 'door' ? 0 : Math.max(0, rawSill),
      valid: false,
      reason: maxOffset < 0 ? 'Otvor je širi od ovog zida.' : 'Otvor je viši od zida.',
      locks,
    };
  }

  let offset = clamp(rawOffset, 0, maxOffset);
  const sameWall = others.filter((o) => o.wall === wall);
  const xOptions: OpeningLock[] = [
    { axis: 'x', value: maxOffset / 2, guide: wallWidth / 2, label: 'Sredina zida' },
  ];
  if (EDGE_DISTANCE <= maxOffset) {
    xOptions.push(
      { axis: 'x', value: EDGE_DISTANCE, guide: EDGE_DISTANCE, label: '15 cm od kuta' },
      {
        axis: 'x',
        value: maxOffset - EDGE_DISTANCE,
        guide: wallWidth - EDGE_DISTANCE,
        label: '15 cm od kuta',
      }
    );
  }
  for (const other of sameWall) {
    const afterOther = other.offsetFromLeft + other.width + EDGE_DISTANCE;
    const beforeOther = other.offsetFromLeft - EDGE_DISTANCE - width;
    if (afterOther <= maxOffset) {
      xOptions.push({
        axis: 'x',
        value: afterOther,
        guide: other.offsetFromLeft + other.width,
        label: '15 cm od otvora',
      });
    }
    if (beforeOther >= 0) {
      xOptions.push({
        axis: 'x',
        value: beforeOther,
        guide: other.offsetFromLeft,
        label: '15 cm od otvora',
      });
    }
  }
  const xLock = firstWithin(offset, xOptions);
  if (xLock) {
    offset = xLock.value;
    locks.push(xLock);
  }

  let sill = 0;
  if (opening.type === 'door') {
    locks.push({ axis: 'y', value: 0, guide: 0, label: 'Vrata do poda' });
  } else {
    sill = clamp(rawSill, 0, maxSill);
    const yOptions: OpeningLock[] = STANDARD_SILLS.filter((s) => s <= maxSill).map((s) => ({
      axis: 'y',
      value: s,
      guide: s,
      label: `Parapet ${Math.round(s * 100)} cm`,
    }));
    const heads = new Set<number>([
      STANDARD_DOOR_HEAD,
      ...others.filter((o) => o.type === 'door').map((o) => o.sillHeight + o.height),
    ]);
    for (const head of heads) {
      const value = head - height;
      if (value >= 0 && value <= maxSill) {
        yOptions.push({ axis: 'y', value, guide: head, label: 'Poravnato s vratima' });
      }
    }
    const yLock = firstWithin(sill, yOptions);
    if (yLock) {
      sill = yLock.value;
      locks.push(yLock);
    }
  }

  const offsetFromLeft = xLock ? roundMm(offset) : Math.round(offset * 100) / 100;
  const sillHeight =
    opening.type === 'door' || locks.some((l) => l.axis === 'y')
      ? roundMm(sill)
      : Math.round(sill * 100) / 100;

  const right = offsetFromLeft + width;
  const top = sillHeight + height;
  const blockingOpening = sameWall.find(
    (o) =>
      offsetFromLeft < o.offsetFromLeft + o.width + MIN_GAP &&
      right > o.offsetFromLeft - MIN_GAP &&
      sillHeight < o.sillHeight + o.height + MIN_GAP &&
      top > o.sillHeight - MIN_GAP
  );
  if (blockingOpening) {
    return {
      wall,
      offsetFromLeft,
      sillHeight,
      valid: false,
      reason: `Preklapa se s otvorom: ${blockingOpening.label}.`,
      locks,
    };
  }

  const blockingFurniture = furnitureBlockingOpening(
    { wall, offsetFromLeft, width, height, sillHeight },
    room,
    furniture
  );
  if (blockingFurniture) {
    return {
      wall,
      offsetFromLeft,
      sillHeight,
      valid: false,
      reason: `Na tom mjestu je namještaj: ${blockingFurniture.name}.`,
      locks,
    };
  }

  const blockingNode = nodes.find(
    (n) =>
      n.surface === wall &&
      n.x > offsetFromLeft - MIN_GAP &&
      n.x < right + MIN_GAP &&
      n.y > sillHeight - MIN_GAP &&
      n.y < top + MIN_GAP
  );
  if (blockingNode) {
    return {
      wall,
      offsetFromLeft,
      sillHeight,
      valid: false,
      reason: `Na tom mjestu je element ${blockingNode.label.split(' ')[0]}.`,
      locks,
    };
  }

  return { wall, offsetFromLeft, sillHeight, valid: true, reason: null, locks };
}
