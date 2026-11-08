import { ELEMENT_CATALOG } from '../data/presets';
import { defaultFurnitureDepth } from '../engine/furniture';
import { ElementCategory, ProjectData } from '../types/electrical';

export const SCHEMA_VERSION = 1;
export const FILE_FORMAT = 'elektroplan';
export const FILE_EXTENSION = '.elektroplan.json';

export class ProjectFileError extends Error {}

/** Projects saved before furniture existed simply have none. */
export function normalizeProjectData(data: ProjectData): ProjectData {
  return {
    ...data,
    furniture: (data.furniture ?? []).map((f) => ({
      ...f,
      depth: f.depth ?? defaultFurnitureDepth(f.name),
    })),
  };
}

export function serializeProject(name: string, data: ProjectData): string {
  return JSON.stringify(
    {
      format: FILE_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      name,
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2
  );
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const INVALID = 'Datoteka je oštećena ili nije valjan ElektroPlan projekt.';
const SURFACES = new Set(['north', 'east', 'south', 'west', 'ceiling']);
const WALLS = new Set(['north', 'east', 'south', 'west']);

function assertProjectData(value: unknown): asserts value is ProjectData {
  const fail = () => {
    throw new ProjectFileError(INVALID);
  };
  if (!isObject(value)) return fail();
  const { room, openings, nodes, circuits, appliances, furniture } = value;
  if (
    !isObject(room) ||
    !isFiniteNumber(room.length) ||
    !isFiniteNumber(room.width) ||
    !isFiniteNumber(room.height) ||
    !Array.isArray(openings) ||
    !Array.isArray(nodes) ||
    !Array.isArray(circuits) ||
    !Array.isArray(appliances)
  ) {
    return fail();
  }

  for (const o of openings) {
    if (
      !isObject(o) ||
      typeof o.id !== 'string' ||
      !WALLS.has(o.wall as string) ||
      (o.type !== 'door' && o.type !== 'window') ||
      !isFiniteNumber(o.offsetFromLeft) ||
      !isFiniteNumber(o.width) ||
      !isFiniteNumber(o.height) ||
      !isFiniteNumber(o.sillHeight)
    ) {
      return fail();
    }
  }

  if (furniture !== undefined) {
    if (!Array.isArray(furniture)) return fail();
    for (const f of furniture) {
      if (
        !isObject(f) ||
        typeof f.id !== 'string' ||
        typeof f.name !== 'string' ||
        !WALLS.has(f.wall as string) ||
        !isFiniteNumber(f.offsetFromLeft) ||
        !isFiniteNumber(f.width) ||
        !isFiniteNumber(f.height) ||
        !isFiniteNumber(f.bottom) ||
        (f.depth !== undefined && !isFiniteNumber(f.depth))
      ) {
        return fail();
      }
    }
  }

  const circuitIds = new Set<string>();
  for (const c of circuits) {
    if (
      !isObject(c) ||
      typeof c.id !== 'string' ||
      typeof c.code !== 'string' ||
      typeof c.name !== 'string' ||
      !isFiniteNumber(c.breakerAmps) ||
      !isFiniteNumber(c.cableCrossSection)
    ) {
      return fail();
    }
    circuitIds.add(c.id);
  }

  for (const n of nodes) {
    if (
      !isObject(n) ||
      typeof n.id !== 'string' ||
      typeof n.label !== 'string' ||
      !SURFACES.has(n.surface as string) ||
      !(n.category as ElementCategory in ELEMENT_CATALOG) ||
      !isFiniteNumber(n.x) ||
      !isFiniteNumber(n.y) ||
      !circuitIds.has(n.circuitId as string)
    ) {
      return fail();
    }
  }

  for (const a of appliances) {
    if (
      !isObject(a) ||
      typeof a.id !== 'string' ||
      typeof a.name !== 'string' ||
      !isFiniteNumber(a.powerWatts) ||
      !circuitIds.has(a.circuitId as string)
    ) {
      return fail();
    }
  }
}

export function parseProjectFile(text: string): { name: string; data: ProjectData } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectFileError(INVALID);
  }
  if (!isObject(parsed) || parsed.format !== FILE_FORMAT) {
    throw new ProjectFileError(
      'Ovo nije ElektroPlan projekt. Stariji JSON izvozi nisu podržani.'
    );
  }
  if (!isFiniteNumber(parsed.schemaVersion) || parsed.schemaVersion > SCHEMA_VERSION) {
    throw new ProjectFileError(
      'Projekt je spremljen u novijoj verziji aplikacije. Osvježi aplikaciju pa pokušaj ponovno.'
    );
  }
  assertProjectData(parsed.data);
  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Uvezeni projekt',
    data: normalizeProjectData(parsed.data),
  };
}
