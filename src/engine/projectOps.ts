import {
  CatalogApplianceTemplate,
  ELEMENT_CATALOG,
  INITIAL_APPLIANCES,
  INITIAL_CIRCUITS,
  INITIAL_NODES,
  INITIAL_OPENINGS,
  INITIAL_ROOM,
} from '../data/presets';
import {
  ApplianceItem,
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  ProjectData,
  SurfaceId,
  WallId,
  WallOpening,
} from '../types/electrical';
import { isPointInsideOpening } from './electricalEngine';
import { getSurfaceSize, isNodeOutsideSurface, roundMm } from './geometry';
import { randomId } from './ids';

/** Every circuit colour has at least 4.5:1 contrast on the white drawing sheet. */
export const CIRCUIT_COLORS = [
  '#0A5FC4',
  '#00753B',
  '#A85400',
  '#6D35B8',
  '#00707F',
  '#5F5F00',
];

const newId = (prefix: string) => `${prefix}-${randomId(4)}`;

export function createEmptyProject(): ProjectData {
  return {
    room: { length: 4, width: 3, height: 2.6 },
    openings: [],
    nodes: [],
    appliances: [],
    circuits: [
      {
        id: newId('cir'),
        code: 'SK-1',
        name: 'Utičnice',
        breakerAmps: 16,
        breakerCurve: 'B',
        phaseType: '1P',
        cableCrossSection: 2.5,
        color: CIRCUIT_COLORS[0],
        mainJunctionBoxId: '',
      },
      {
        id: newId('cir'),
        code: 'SK-2',
        name: 'Rasvjeta',
        breakerAmps: 10,
        breakerCurve: 'B',
        phaseType: '1P',
        cableCrossSection: 1.5,
        color: CIRCUIT_COLORS[1],
        mainJunctionBoxId: '',
      },
    ],
  };
}

export function createExampleProject(): ProjectData {
  return structuredClone({
    room: INITIAL_ROOM,
    openings: INITIAL_OPENINGS,
    nodes: INITIAL_NODES,
    circuits: INITIAL_CIRCUITS,
    appliances: INITIAL_APPLIANCES,
  });
}

/** Ceiling lights go on the ceiling only; boxes go anywhere; the rest on walls. */
export function canPlaceOn(category: ElementCategory, surface: SurfaceId): boolean {
  if (category === 'light_ceiling') return surface === 'ceiling';
  if (category === 'junction_box') return true;
  return surface !== 'ceiling';
}

function nextNumber(
  labels: string[],
  prefix: string
): number {
  const used = new Set(
    labels
      .map((l) => l.match(new RegExp(`^${prefix}-(\\d+)`))?.[1])
      .filter(Boolean)
      .map(Number)
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function labelPrefix(category: ElementCategory): string {
  if (category.startsWith('socket_')) return 'U';
  return ELEMENT_CATALOG[category].shortCode;
}

export function addNode(
  data: ProjectData,
  category: ElementCategory,
  surface: SurfaceId,
  position?: { x: number; y: number },
  preferredCircuitId?: string
): { data: ProjectData; nodeId: string } | null {
  if (!canPlaceOn(category, surface) || data.circuits.length === 0) return null;
  const meta = ELEMENT_CATALOG[category];
  const size = getSurfaceSize(surface, data.room);
  const x = position?.x ?? size.width / 2;
  const y =
    position?.y ??
    (surface === 'ceiling'
      ? size.height / 2
      : Math.min(size.height - 0.15, meta.defaultHeightMeters));

  const isLighting = category.startsWith('light_') || category.startsWith('switch_');
  const circuitId =
    (preferredCircuitId && data.circuits.some((c) => c.id === preferredCircuitId)
      ? preferredCircuitId
      : undefined) ??
    (isLighting ? data.circuits.find((c) => c.breakerAmps === 10)?.id : undefined) ??
    data.circuits[0].id;

  const mainRo = data.nodes.find((n) => n.category === 'distribution_board');
  const sameWallBox = data.nodes.find(
    (n) =>
      n.category === 'junction_box' &&
      n.circuitId === circuitId &&
      n.surface === surface
  );
  const circuitBoxId = data.circuits.find((c) => c.id === circuitId)?.mainJunctionBoxId;

  const id = newId('node');
  const prefix = labelPrefix(category);
  const number = nextNumber(
    data.nodes.map((n) => n.label),
    prefix
  );
  const description =
    category === 'distribution_board'
      ? 'Razvodni ormar'
      : category === 'junction_box'
      ? 'Razvodna kutija'
      : meta.name;

  const node: ElectricalNode = {
    id,
    surface,
    category,
    label: `${prefix}-${number} (${description})`,
    x: roundMm(x),
    y: roundMm(y),
    circuitId,
    parentBoxId:
      category === 'distribution_board'
        ? undefined
        : category === 'junction_box'
        ? mainRo?.id
        : sameWallBox?.id || circuitBoxId || mainRo?.id,
  };

  const nodes =
    category === 'junction_box'
      ? data.nodes.map((n) =>
          n.category !== 'distribution_board' &&
          n.category !== 'junction_box' &&
          n.circuitId === circuitId &&
          n.surface === surface
            ? { ...n, parentBoxId: id }
            : n
        )
      : data.nodes;

  return { data: { ...data, nodes: [...nodes, node] }, nodeId: id };
}

export function moveNode(
  data: ProjectData,
  nodeId: string,
  surface: SurfaceId,
  x: number,
  y: number
): ProjectData {
  return {
    ...data,
    nodes: data.nodes.map((n) =>
      n.id === nodeId ? { ...n, surface, x: roundMm(x), y: roundMm(y) } : n
    ),
  };
}

export function updateNode(
  data: ProjectData,
  nodeId: string,
  patch: Partial<ElectricalNode>
): ProjectData {
  return {
    ...data,
    nodes: data.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
  };
}

export function deleteNode(data: ProjectData, nodeId: string): ProjectData {
  const mainRo = data.nodes.find(
    (n) => n.category === 'distribution_board' && n.id !== nodeId
  );
  return {
    ...data,
    nodes: data.nodes
      .filter((n) => n.id !== nodeId)
      .map((n) => ({
        ...n,
        parentBoxId: n.parentBoxId === nodeId ? mainRo?.id : n.parentBoxId,
        controlledTargetIds: n.controlledTargetIds?.filter((t) => t !== nodeId),
      })),
    appliances: data.appliances.map((a) =>
      a.assignedNodeId === nodeId ? { ...a, assignedNodeId: undefined } : a
    ),
    circuits: data.circuits.map((c) =>
      c.mainJunctionBoxId === nodeId ? { ...c, mainJunctionBoxId: '' } : c
    ),
  };
}

export function groupDevicesUnderNewBox(
  data: ProjectData,
  circuitId: string,
  surface: SurfaceId
): { data: ProjectData; nodeId: string } | null {
  const wall: WallId = surface === 'ceiling' ? 'north' : surface;
  const devices = data.nodes.filter(
    (n) =>
      n.category !== 'distribution_board' &&
      n.category !== 'junction_box' &&
      n.circuitId === circuitId &&
      n.surface === wall
  );
  const x =
    devices.length > 0
      ? devices.reduce((sum, d) => sum + d.x, 0) / devices.length
      : getSurfaceSize(wall, data.room).width / 2;
  return addNode(
    data,
    'junction_box',
    wall,
    { x, y: Math.max(0.35, data.room.height - 0.3) },
    circuitId
  );
}

export function moveNodeInside(data: ProjectData, nodeId: string): ProjectData {
  const margin = 0.05;
  return {
    ...data,
    nodes: data.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const { width, height } = getSurfaceSize(n.surface, data.room);
      return {
        ...n,
        x: roundMm(Math.max(margin, Math.min(width - margin, n.x))),
        y: roundMm(Math.max(margin, Math.min(height - margin, n.y))),
      };
    }),
  };
}

export const getOutsideNodes = (data: ProjectData): ElectricalNode[] =>
  data.nodes.filter((n) => isNodeOutsideSurface(n, data.room));

export function addOpening(
  data: ProjectData,
  opening: Omit<WallOpening, 'id'>
): ProjectData {
  return {
    ...data,
    openings: [...data.openings, { ...opening, id: newId('op') }],
  };
}

export function updateOpening(
  data: ProjectData,
  id: string,
  patch: Partial<WallOpening>
): ProjectData {
  return {
    ...data,
    openings: data.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
  };
}

export function deleteOpening(data: ProjectData, id: string): ProjectData {
  return { ...data, openings: data.openings.filter((o) => o.id !== id) };
}

export function addApplianceFromTemplate(
  data: ProjectData,
  tpl: CatalogApplianceTemplate
): ProjectData {
  const findByName = (fragment: string) =>
    data.circuits.find((c) => c.name.toLowerCase().includes(fragment))?.id;
  const circuitId =
    (tpl.category === 'kuhinja'
      ? findByName('kuhinj')
      : tpl.category === 'klima_grijanje'
      ? findByName('klim')
      : undefined) ?? data.circuits[0]?.id;
  if (!circuitId) return data;
  const appliance: ApplianceItem = {
    id: newId('app'),
    name: tpl.name,
    category: tpl.category,
    powerWatts: tpl.powerWatts,
    requiresDedicatedCircuit: tpl.requiresDedicatedCircuit,
    threePhase: tpl.threePhase,
    circuitId,
  };
  return { ...data, appliances: [...data.appliances, appliance] };
}

export function addCustomAppliance(
  data: ProjectData,
  name: string,
  powerWatts: number
): ProjectData {
  if (!data.circuits[0]) return data;
  const appliance: ApplianceItem = {
    id: newId('app'),
    name,
    category: 'ostalo',
    powerWatts,
    requiresDedicatedCircuit: powerWatts >= 2500,
    circuitId: data.circuits[0].id,
  };
  return { ...data, appliances: [...data.appliances, appliance] };
}

export function deleteAppliance(data: ProjectData, id: string): ProjectData {
  return { ...data, appliances: data.appliances.filter((a) => a.id !== id) };
}

export function assignAppliance(
  data: ProjectData,
  applianceId: string,
  nodeId: string | undefined
): ProjectData {
  const node = data.nodes.find((n) => n.id === nodeId);
  return {
    ...data,
    appliances: data.appliances.map((a) =>
      a.id === applianceId
        ? { ...a, assignedNodeId: nodeId, circuitId: node?.circuitId ?? a.circuitId }
        : a
    ),
  };
}

function nextCircuitCode(circuits: ElectricalCircuit[]): string {
  return `SK-${nextNumber(
    circuits.map((c) => c.code),
    'SK'
  )}`;
}

function unusedColor(circuits: ElectricalCircuit[]): string {
  return (
    CIRCUIT_COLORS.find((color) => !circuits.some((c) => c.color === color)) ??
    CIRCUIT_COLORS[circuits.length % CIRCUIT_COLORS.length]
  );
}

export function addCircuit(data: ProjectData): ProjectData {
  const circuit: ElectricalCircuit = {
    id: newId('cir'),
    code: nextCircuitCode(data.circuits),
    name: 'Novi krug',
    breakerAmps: 16,
    breakerCurve: 'B',
    phaseType: '1P',
    cableCrossSection: 2.5,
    color: unusedColor(data.circuits),
    mainJunctionBoxId: '',
  };
  return { ...data, circuits: [...data.circuits, circuit] };
}

export function updateCircuit(
  data: ProjectData,
  id: string,
  patch: Partial<ElectricalCircuit>
): ProjectData {
  return {
    ...data,
    circuits: data.circuits.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

/** Moves everything on the circuit to the first remaining one; the last circuit stays. */
export function deleteCircuit(data: ProjectData, id: string): ProjectData {
  const fallback = data.circuits.find((c) => c.id !== id);
  if (!fallback) return data;
  return {
    ...data,
    circuits: data.circuits.filter((c) => c.id !== id),
    nodes: data.nodes.map((n) =>
      n.circuitId === id ? { ...n, circuitId: fallback.id } : n
    ),
    appliances: data.appliances.map((a) =>
      a.circuitId === id ? { ...a, circuitId: fallback.id } : a
    ),
  };
}

/** Finds a wall position at height `y` clear of openings and other elements. */
function findFreeWallSpot(
  y: number,
  data: Pick<ProjectData, 'room' | 'openings'>,
  nodes: ElectricalNode[]
): { surface: WallId; x: number } | null {
  const walls: WallId[] = ['north', 'east', 'south', 'west'];
  for (const surface of walls) {
    const { width } = getSurfaceSize(surface, data.room);
    for (let x = 0.3; x <= width - 0.3 + 1e-9; x += 0.1) {
      const candidate = roundMm(x);
      const blocked =
        isPointInsideOpening(surface, candidate, y, data.openings, 0.12) ||
        nodes.some(
          (n) =>
            n.surface === surface &&
            Math.abs(n.x - candidate) < 0.3 &&
            Math.abs(n.y - y) < 0.3
        );
      if (!blocked) return { surface, x: candidate };
    }
  }
  return null;
}

/**
 * Gives appliances that need it their own circuit and adds missing outlets on free wall
 * space. Returns a new project; appliances that cannot be placed are counted in `unplaced`.
 */
export function autoAdaptNetwork(data: ProjectData): {
  data: ProjectData;
  unplaced: number;
} {
  let circuits = [...data.circuits];
  let nodes = [...data.nodes];
  const appliances = data.appliances.map((a) => ({ ...a }));
  const parent =
    nodes.find((n) => n.category === 'distribution_board') ??
    nodes.find((n) => n.category === 'junction_box');
  let unplaced = 0;

  const nextSocketLabel = (name: string) =>
    `U-${nextNumber(
      nodes.map((n) => n.label),
      'U'
    )} (${name})`;

  for (const app of appliances) {
    if (!app.requiresDedicatedCircuit && app.powerWatts < 2500) continue;
    if (appliances.filter((a) => a.circuitId === app.circuitId).length <= 1) continue;

    if (app.assignedNodeId) {
      const circuit = makeDedicatedCircuit(app);
      circuits.push(circuit);
      app.circuitId = circuit.id;
      nodes = nodes.map((n) =>
        n.id === app.assignedNodeId ? { ...n, circuitId: circuit.id } : n
      );
      continue;
    }

    const y = app.threePhase ? 0.6 : 0.3;
    const spot = findFreeWallSpot(y, data, nodes);
    if (!spot) {
      unplaced++;
      continue;
    }
    const circuit = makeDedicatedCircuit(app);
    circuits.push(circuit);
    const socketId = newId('node');
    nodes.push({
      id: socketId,
      surface: spot.surface,
      category: app.threePhase ? 'socket_shuko_3p' : 'socket_single',
      label: nextSocketLabel(app.name),
      x: spot.x,
      y,
      circuitId: circuit.id,
      parentBoxId: parent?.id,
    });
    app.circuitId = circuit.id;
    app.assignedNodeId = socketId;
  }

  function makeDedicatedCircuit(app: ApplianceItem): ElectricalCircuit {
    return {
      id: newId('cir'),
      code: nextCircuitCode(circuits),
      name: `Zasebni: ${app.name.slice(0, 24)}`,
      breakerAmps: 16,
      breakerCurve: 'B',
      phaseType: app.threePhase ? '3P' : '1P',
      cableCrossSection: 2.5,
      color: unusedColor(circuits),
      mainJunctionBoxId: parent?.id ?? '',
    };
  }

  const outlets = nodes.reduce(
    (acc, n) =>
      acc +
      (n.category === 'socket_single' ? 1 : n.category === 'socket_double' ? 2 : 0),
    0
  );
  let deficit = appliances.filter((a) => !a.threePhase).length - outlets;
  while (deficit > 0 && circuits[0]) {
    const spot = findFreeWallSpot(0.3, data, nodes);
    if (!spot) {
      unplaced += deficit;
      break;
    }
    const isDouble = deficit >= 2;
    nodes.push({
      id: newId('node'),
      surface: spot.surface,
      category: isDouble ? 'socket_double' : 'socket_single',
      label: nextSocketLabel('Dodana utičnica'),
      x: spot.x,
      y: 0.3,
      circuitId: circuits[0].id,
      parentBoxId: parent?.id,
    });
    deficit -= isDouble ? 2 : 1;
  }

  circuits = circuits.map((c) =>
    c.breakerAmps >= 16 && c.cableCrossSection < 2.5
      ? { ...c, cableCrossSection: 2.5 }
      : c
  );
  return { data: { ...data, circuits, nodes, appliances }, unplaced };
}
