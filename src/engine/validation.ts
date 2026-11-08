import { FurnitureItem, RoomDimensions, WallOpening } from '../types/electrical';
import { furnitureBlockingOpening } from './furniture';
import { formatMeters, getSurfaceSize } from './geometry';

export const ROOM_LIMITS = {
  length: { min: 1, max: 30 },
  width: { min: 1, max: 30 },
  height: { min: 1.8, max: 6 },
} as const;

export function validateRoomField(
  field: keyof RoomDimensions,
  value: number
): string | null {
  const { min, max } = ROOM_LIMITS[field];
  if (value < min || value > max) {
    return `Upiši vrijednost od ${formatMeters(min)} do ${formatMeters(max)} m.`;
  }
  return null;
}

export type OpeningField = 'offsetFromLeft' | 'width' | 'height' | 'sillHeight';
export type OpeningErrors = Partial<Record<OpeningField, string>>;

export function validateOpening(
  op: Pick<WallOpening, 'wall' | 'type' | OpeningField>,
  room: RoomDimensions,
  furniture: FurnitureItem[] = []
): OpeningErrors {
  const errors: OpeningErrors = {};
  const wallWidth = getSurfaceSize(op.wall, room).width;

  if (op.width <= 0) {
    errors.width = 'Širina mora biti veća od 0.';
  } else if (op.width > wallWidth) {
    errors.width = `Zid je širok ${formatMeters(wallWidth)} m.`;
  }
  if (op.height <= 0) {
    errors.height = 'Visina mora biti veća od 0.';
  }
  if (op.offsetFromLeft < 0) {
    errors.offsetFromLeft = 'Udaljenost ne može biti negativna.';
  } else if (!errors.width && op.offsetFromLeft + op.width > wallWidth + 1e-9) {
    errors.offsetFromLeft = `Otvor prelazi rub zida. Najviše ${formatMeters(
      Math.max(0, wallWidth - op.width)
    )} m.`;
  }
  if (op.type === 'door' && op.sillHeight !== 0) {
    errors.sillHeight = 'Vrata počinju od poda.';
  } else if (op.sillHeight < 0) {
    errors.sillHeight = 'Parapet ne može biti negativan.';
  } else if (!errors.height && op.sillHeight + op.height > room.height + 1e-9) {
    errors.height = `Otvor prelazi strop. Visina zida je ${formatMeters(room.height)} m.`;
  }
  if (Object.keys(errors).length === 0) {
    const blocking = furnitureBlockingOpening(op, room, furniture);
    if (blocking) errors.offsetFromLeft = `Na tom mjestu je namještaj: ${blocking.name}.`;
  }
  return errors;
}
