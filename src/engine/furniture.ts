import {
  FurnitureItem,
  ProjectData,
  RoomDimensions,
  WallId,
  WallOpening,
} from '../types/electrical';
import { formatMeters, getSurfaceSize, roundMm } from './geometry';
import { randomId } from './ids';
import { OpeningDragResult, OpeningLock } from './openingDrag';

export interface FurnitureTemplate {
  name: string;
  width: number;
  height: number;
  depth: number;
  bottom: number;
}

export interface CatalogFurniture extends FurnitureTemplate {
  room: string;
  group: string;
}

/** Common sizes in metres; the number in a name is the width in centimetres. */
export const FURNITURE_CATALOG: CatalogFurniture[] = [
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Donji element 30', width: 0.3, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Donji element 40', width: 0.4, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Donji element 45', width: 0.45, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Donji element 60', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Donji element 80', width: 0.8, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Donji element 90', width: 0.9, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Kutni donji element', width: 0.9, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Element sa sudoperom 60', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Element sa sudoperom 80', width: 0.8, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Donji elementi', name: 'Element s ladicama 60', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić 30', width: 0.3, height: 0.7, depth: 0.35, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić 40', width: 0.4, height: 0.7, depth: 0.35, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić 60', width: 0.6, height: 0.7, depth: 0.35, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić 80', width: 0.8, height: 0.7, depth: 0.35, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić 90', width: 0.9, height: 0.7, depth: 0.35, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić nad napom', width: 0.6, height: 0.35, depth: 0.35, bottom: 1.8 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Viseći ormarić, visoki 60', width: 0.6, height: 0.9, depth: 0.35, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Kuhinjska polica 60', width: 0.6, height: 0.04, depth: 0.25, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Viseći elementi', name: 'Kuhinjska polica 90', width: 0.9, height: 0.04, depth: 0.25, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Visoki elementi', name: 'Visoki ormar 40', width: 0.4, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Visoki elementi', name: 'Visoki ormar 60', width: 0.6, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Visoki elementi', name: 'Visoki element za pećnicu', width: 0.6, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Visoki elementi', name: 'Visoki element za hladnjak', width: 0.6, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Hladnjak', width: 0.6, height: 1.85, depth: 0.65, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Hladnjak side-by-side', width: 0.9, height: 1.8, depth: 0.75, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Štednjak', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Ugradbena pećnica', width: 0.6, height: 0.6, depth: 0.55, bottom: 0.85 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Perilica posuđa 45', width: 0.45, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Perilica posuđa 60', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Perilica rublja', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Sušilica rublja', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Mikrovalna pećnica', width: 0.5, height: 0.3, depth: 0.4, bottom: 1.45 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Napa 60', width: 0.6, height: 0.4, depth: 0.5, bottom: 1.6 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Napa 90', width: 0.9, height: 0.4, depth: 0.5, bottom: 1.6 },
  { room: 'Kuhinja', group: 'Aparati', name: 'Radna ploča, aparati na njoj', width: 0.6, height: 0.35, depth: 0.6, bottom: 0.9 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'TV komoda 120', width: 1.2, height: 0.5, depth: 0.4, bottom: 0 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'TV komoda 150', width: 1.5, height: 0.5, depth: 0.4, bottom: 0 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'TV komoda 180', width: 1.8, height: 0.45, depth: 0.4, bottom: 0 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Viseća TV komoda 150', width: 1.5, height: 0.35, depth: 0.35, bottom: 0.4 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Televizor 43"', width: 0.97, height: 0.57, depth: 0.06, bottom: 1.0 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Televizor 55"', width: 1.23, height: 0.71, depth: 0.06, bottom: 0.95 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Televizor 65"', width: 1.45, height: 0.84, depth: 0.06, bottom: 0.9 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Televizor 75"', width: 1.67, height: 0.96, depth: 0.06, bottom: 0.85 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Soundbar', width: 0.9, height: 0.08, depth: 0.1, bottom: 0.7 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Komoda 80', width: 0.8, height: 0.85, depth: 0.45, bottom: 0 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Komoda 120', width: 1.2, height: 0.85, depth: 0.45, bottom: 0 },
  { room: 'Dnevni boravak', group: 'TV i komode', name: 'Komoda 160', width: 1.6, height: 0.85, depth: 0.45, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Regal 40', width: 0.4, height: 2.0, depth: 0.35, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Regal 80', width: 0.8, height: 2.0, depth: 0.35, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Regal 120', width: 1.2, height: 2.0, depth: 0.35, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Niski regal 80', width: 0.8, height: 0.85, depth: 0.35, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Niski regal 120', width: 1.2, height: 0.85, depth: 0.35, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Vitrina 60', width: 0.6, height: 1.9, depth: 0.4, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Vitrina 90', width: 0.9, height: 1.9, depth: 0.4, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Viseći regal 80', width: 0.8, height: 0.35, depth: 0.3, bottom: 1.4 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Viseći regal 120', width: 1.2, height: 0.35, depth: 0.3, bottom: 1.4 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Viseći regal 160', width: 1.6, height: 0.35, depth: 0.3, bottom: 1.4 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Zidna polica 60', width: 0.6, height: 0.04, depth: 0.22, bottom: 1.4 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Zidna polica 90', width: 0.9, height: 0.04, depth: 0.22, bottom: 1.4 },
  { room: 'Dnevni boravak', group: 'Regali i police', name: 'Zidna polica 120', width: 1.2, height: 0.04, depth: 0.22, bottom: 1.4 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Fotelja', width: 0.85, height: 0.85, depth: 0.9, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Kauč dvosjed', width: 1.6, height: 0.85, depth: 0.95, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Kauč trosjed', width: 2.2, height: 0.85, depth: 0.95, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Kutna garnitura', width: 2.7, height: 0.85, depth: 1.6, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Stolić uz kauč', width: 0.5, height: 0.55, depth: 0.5, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Stol za blagovanje 140', width: 1.4, height: 0.75, depth: 0.85, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Radni stol 120', width: 1.2, height: 0.75, depth: 0.7, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Sjedenje i stolovi', name: 'Radni stol 160', width: 1.6, height: 0.75, depth: 0.8, bottom: 0 },
  { room: 'Dnevni boravak', group: 'Grijanje i klima', name: 'Klima uređaj', width: 0.8, height: 0.3, depth: 0.25, bottom: 2.15 },
  { room: 'Dnevni boravak', group: 'Grijanje i klima', name: 'Radijator 80', width: 0.8, height: 0.6, depth: 0.12, bottom: 0.12 },
  { room: 'Dnevni boravak', group: 'Grijanje i klima', name: 'Radijator 120', width: 1.2, height: 0.6, depth: 0.12, bottom: 0.12 },
  { room: 'Dnevni boravak', group: 'Grijanje i klima', name: 'Električna grijalica', width: 0.9, height: 0.45, depth: 0.15, bottom: 0.15 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Ormar 100', width: 1.0, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Ormar 150', width: 1.5, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Ormar 200', width: 2.0, height: 2.1, depth: 0.6, bottom: 0 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Krevet 90', width: 0.9, height: 0.5, depth: 2.0, bottom: 0 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Krevet 160', width: 1.6, height: 0.5, depth: 2.0, bottom: 0 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Krevet 180', width: 1.8, height: 0.5, depth: 2.0, bottom: 0 },
  { room: 'Ostalo', group: 'Spavaća soba', name: 'Noćni ormarić', width: 0.5, height: 0.55, depth: 0.4, bottom: 0 },
  { room: 'Ostalo', group: 'Kupaonica i tehnika', name: 'Bojler 50 L', width: 0.45, height: 0.75, depth: 0.45, bottom: 1.7 },
  { room: 'Ostalo', group: 'Kupaonica i tehnika', name: 'Bojler 80 L', width: 0.45, height: 1.05, depth: 0.45, bottom: 1.45 },
  { room: 'Ostalo', group: 'Kupaonica i tehnika', name: 'Umivaonik', width: 0.6, height: 0.2, depth: 0.45, bottom: 0.7 },
  { room: 'Ostalo', group: 'Kupaonica i tehnika', name: 'Ogledalo', width: 0.6, height: 0.8, depth: 0.03, bottom: 1.2 },
  { room: 'Ostalo', group: 'Kupaonica i tehnika', name: 'Plinski bojler', width: 0.45, height: 0.75, depth: 0.35, bottom: 1.45 },
];

export const FURNITURE_ROOMS = ['Kuhinja', 'Dnevni boravak', 'Ostalo'];

const SNAP_DISTANCE = 0.08;
const TOUCH_TOLERANCE = 0.0005;

type Placement = Pick<FurnitureItem, 'wall' | 'offsetFromLeft' | 'width' | 'height' | 'depth' | 'bottom'>;

/** Volume in the room: x from the west wall, y from the south wall, z from the floor. */
interface RoomBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Openings only block what stands right against their wall plane. */
const OPENING_THICKNESS = 0.02;

function wallBox(
  wall: WallId,
  left: number,
  width: number,
  depth: number,
  bottom: number,
  height: number,
  room: RoomDimensions
): RoomBox {
  const { length: L, width: W } = room;
  const minZ = bottom;
  const maxZ = bottom + height;
  switch (wall) {
    case 'north':
      return { minX: left, maxX: left + width, minY: W - depth, maxY: W, minZ, maxZ };
    case 'south':
      return { minX: L - left - width, maxX: L - left, minY: 0, maxY: depth, minZ, maxZ };
    case 'west':
      return { minX: 0, maxX: depth, minY: left, maxY: left + width, minZ, maxZ };
    case 'east':
      return { minX: L - depth, maxX: L, minY: W - left - width, maxY: W - left, minZ, maxZ };
  }
}

const furnitureBox = (f: Placement, room: RoomDimensions) =>
  wallBox(f.wall, f.offsetFromLeft, f.width, f.depth, f.bottom, f.height, room);

const openingBox = (
  o: Pick<WallOpening, 'wall' | 'offsetFromLeft' | 'width' | 'height' | 'sillHeight'>,
  room: RoomDimensions
) => wallBox(o.wall, o.offsetFromLeft, o.width, OPENING_THICKNESS, o.sillHeight, o.height, room);

const boxesOverlap = (a: RoomBox, b: RoomBox) =>
  a.minX < b.maxX - TOUCH_TOLERANCE &&
  a.maxX > b.minX + TOUCH_TOLERANCE &&
  a.minY < b.maxY - TOUCH_TOLERANCE &&
  a.maxY > b.minY + TOUCH_TOLERANCE &&
  a.minZ < b.maxZ - TOUCH_TOLERANCE &&
  a.maxZ > b.minZ + TOUCH_TOLERANCE;

/** The piece of furniture standing where an opening would go, if any. */
export function furnitureBlockingOpening(
  opening: Pick<WallOpening, 'wall' | 'offsetFromLeft' | 'width' | 'height' | 'sillHeight'>,
  room: RoomDimensions,
  furniture: FurnitureItem[]
): FurnitureItem | undefined {
  const box = openingBox(opening, room);
  return furniture.find((f) => boxesOverlap(box, furnitureBox(f, room)));
}

/** Where furniture on other walls occupies this wall's strip, as local x intervals. */
function intervalsFromOtherWalls(
  wall: WallId,
  depth: number,
  bottom: number,
  height: number,
  room: RoomDimensions,
  furniture: FurnitureItem[]
): { left: number; right: number }[] {
  const { length: L, width: W } = room;
  const result: { left: number; right: number }[] = [];
  for (const f of furniture.filter((item) => item.wall !== wall)) {
    if (f.bottom >= bottom + height || f.bottom + f.height <= bottom) continue;
    const box = furnitureBox(f, room);
    switch (wall) {
      case 'north':
        if (box.maxY > W - depth) result.push({ left: box.minX, right: box.maxX });
        break;
      case 'south':
        if (box.minY < depth) result.push({ left: L - box.maxX, right: L - box.minX });
        break;
      case 'west':
        if (box.minX < depth) result.push({ left: box.minY, right: box.maxY });
        break;
      case 'east':
        if (box.maxX > L - depth) result.push({ left: W - box.maxY, right: W - box.minY });
        break;
    }
  }
  return result;
}

/** Why a piece of furniture cannot stand here, or null when it can. */
export function furnitureConflict(
  item: Placement,
  room: RoomDimensions,
  furniture: FurnitureItem[],
  openings: WallOpening[],
  excludeId?: string
): string | null {
  const wallWidth = getSurfaceSize(item.wall, room).width;
  const right = item.offsetFromLeft + item.width;
  const top = item.bottom + item.height;

  if (item.width <= 0 || item.height <= 0) return 'Dimenzije moraju biti veće od 0.';
  if (item.offsetFromLeft < -TOUCH_TOLERANCE || right > wallWidth + TOUCH_TOLERANCE) {
    return `Element ne stane na zid širok ${formatMeters(wallWidth)} m.`;
  }
  if (item.bottom < -TOUCH_TOLERANCE || top > room.height + TOUCH_TOLERANCE) {
    return `Element prelazi visinu zida od ${formatMeters(room.height)} m.`;
  }

  const across = item.wall === 'north' || item.wall === 'south' ? room.width : room.length;
  if (item.depth <= 0) return 'Dubina mora biti veća od 0.';
  if (item.depth > across + TOUCH_TOLERANCE) {
    return `Dubina prelazi prostoriju od ${formatMeters(across)} m.`;
  }

  const box = furnitureBox(item, room);
  const opening = openings.find((o) => boxesOverlap(box, openingBox(o, room)));
  if (opening) {
    return `Ne može preko otvora: ${opening.type === 'door' ? 'vrata' : 'prozor'}.`;
  }

  const other = furniture.find(
    (f) => f.id !== excludeId && boxesOverlap(box, furnitureBox(f, room))
  );
  return other ? `Preklapa se s elementom: ${other.name}.` : null;
}

function closest(raw: number, options: OpeningLock[]): OpeningLock | null {
  let best: OpeningLock | null = null;
  let bestDistance = SNAP_DISTANCE;
  for (const option of options) {
    const distance = Math.abs(option.value - raw);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

/** Position for furniture being dragged: stays on the wall and snaps to what is around it. */
export function computeFurnitureDrag(
  item: FurnitureItem,
  wall: WallId,
  rawOffset: number,
  rawBottom: number,
  room: RoomDimensions,
  furniture: FurnitureItem[],
  openings: WallOpening[]
): OpeningDragResult {
  const wallWidth = getSurfaceSize(wall, room).width;
  const { width, height } = item;
  const maxOffset = Math.max(0, wallWidth - width);
  const maxBottom = Math.max(0, room.height - height);
  const offset = Math.max(0, Math.min(maxOffset, rawOffset));
  const bottom = Math.max(0, Math.min(maxBottom, rawBottom));

  const others2 = furniture.filter((f) => f.id !== item.id);
  const others = others2.filter((f) => f.wall === wall);
  const wallOpenings = openings.filter((o) => o.wall === wall);
  const x = (value: number, guide: number, label: string): OpeningLock => ({
    axis: 'x',
    value,
    guide,
    label,
  });
  const y = (value: number, guide: number, label: string): OpeningLock => ({
    axis: 'y',
    value,
    guide,
    label,
  });

  const xOptions: OpeningLock[] = [
    x(0, 0, 'Uz kut'),
    x(maxOffset, wallWidth, 'Uz kut'),
    ...others.flatMap((f) => {
      const left = f.offsetFromLeft;
      const right = left + f.width;
      return [
        x(right, right, 'Uz element'),
        x(left - width, left, 'Uz element'),
        x(left, left, 'Poravnato'),
        x(right - width, right, 'Poravnato'),
      ];
    }),
    ...wallOpenings.flatMap((o) => [
      x(o.offsetFromLeft + o.width, o.offsetFromLeft + o.width, 'Uz otvor'),
      x(o.offsetFromLeft - width, o.offsetFromLeft, 'Uz otvor'),
    ]),
    ...intervalsFromOtherWalls(wall, item.depth, bottom, height, room, others2).flatMap((span) => [
      x(span.right, span.right, 'Uz element u kutu'),
      x(span.left - width, span.left, 'Uz element u kutu'),
    ]),
  ].filter((option) => option.value >= -TOUCH_TOLERANCE && option.value <= maxOffset + TOUCH_TOLERANCE);

  const yOptions: OpeningLock[] = [
    y(0, 0, 'Na podu'),
    y(maxBottom, room.height, 'Do stropa'),
    ...others.flatMap((f) => {
      const low = f.bottom;
      const high = low + f.height;
      return [
        y(high, high, 'Na elementu'),
        y(low - height, low, 'Ispod elementa'),
        y(low, low, 'Poravnato'),
        y(high - height, high, 'Poravnato'),
      ];
    }),
    ...wallOpenings
      .filter((o) => o.type === 'window')
      .map((o) => y(o.sillHeight - height, o.sillHeight, 'Ispod prozora')),
  ].filter((option) => option.value >= -TOUCH_TOLERANCE && option.value <= maxBottom + TOUCH_TOLERANCE);

  const xLock = closest(offset, xOptions);
  const yLock = closest(bottom, yOptions);
  const locks = [xLock, yLock].filter((l): l is OpeningLock => l !== null);
  const offsetFromLeft = xLock ? roundMm(xLock.value) : Math.round(offset * 100) / 100;
  const finalBottom = yLock ? roundMm(yLock.value) : Math.round(bottom * 100) / 100;

  const reason = furnitureConflict(
    { wall, offsetFromLeft, width, height, depth: item.depth, bottom: finalBottom },
    room,
    furniture,
    openings,
    item.id
  );
  return {
    wall,
    offsetFromLeft,
    sillHeight: finalBottom,
    valid: reason === null,
    reason,
    locks,
  };
}

/** First free position on a wall, next to what already stands there. */
export function findFurnitureSpot(
  template: FurnitureTemplate,
  wall: WallId,
  data: Pick<ProjectData, 'room' | 'furniture' | 'openings'>
): { offsetFromLeft: number; bottom: number } | null {
  const bottom = Math.max(0, Math.min(data.room.height - template.height, template.bottom));
  const candidates = [
    0,
    ...data.furniture.filter((f) => f.wall === wall).map((f) => f.offsetFromLeft + f.width),
    ...data.openings.filter((o) => o.wall === wall).map((o) => o.offsetFromLeft + o.width),
    ...intervalsFromOtherWalls(wall, template.depth, bottom, template.height, data.room, data.furniture).map(
      (span) => span.right
    ),
  ].sort((a, b) => a - b);
  for (const offsetFromLeft of candidates) {
    const conflict = furnitureConflict(
      {
        wall,
        offsetFromLeft,
        width: template.width,
        height: template.height,
        depth: template.depth,
        bottom,
      },
      data.room,
      data.furniture,
      data.openings
    );
    if (!conflict) return { offsetFromLeft: roundMm(offsetFromLeft), bottom: roundMm(bottom) };
  }
  return null;
}

export function addFurniture(
  data: ProjectData,
  template: FurnitureTemplate,
  wall: WallId
): ProjectData | null {
  const spot = findFurnitureSpot(template, wall, data);
  if (!spot) return null;
  const item: FurnitureItem = {
    id: `fur-${randomId(4)}`,
    wall,
    name: template.name,
    width: template.width,
    height: template.height,
    depth: template.depth,
    ...spot,
  };
  return { ...data, furniture: [...data.furniture, item] };
}

export function updateFurniture(
  data: ProjectData,
  id: string,
  patch: Partial<FurnitureItem>
): ProjectData {
  return {
    ...data,
    furniture: data.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  };
}

export function deleteFurniture(data: ProjectData, id: string): ProjectData {
  return { ...data, furniture: data.furniture.filter((f) => f.id !== id) };
}

/** Depth for items saved before furniture had one, taken from the catalog by name. */
export function defaultFurnitureDepth(name: string): number {
  return FURNITURE_CATALOG.find((item) => item.name.startsWith(name))?.depth ?? 0.6;
}
