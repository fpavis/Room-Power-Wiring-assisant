import {
  CatalogApplianceTemplate,
  ELEMENT_CATALOG,
  INITIAL_APPLIANCES,
  INITIAL_CIRCUITS,
  INITIAL_FURNITURE,
  INITIAL_NODES,
  INITIAL_OPENINGS,
  INITIAL_ROOM,
  WALL_META,
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
import {
  circuitVoltageDropPercent,
  directFeedGroups,
  hasLightsAndSockets,
  hasSchukoSockets,
  isBoxOutsideZone,
  MIN_CROSS_SECTION,
  voltageDropLimitPercent,
} from './rules';
import { computeRoutedSegments } from './routing';
import { formatMeters, formatNumber, getSurfaceSize, isNodeOutsideSurface, roundMm } from './geometry';
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
    furniture: [],
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
    furniture: INITIAL_FURNITURE,
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
  const y = Math.max(0.35, data.room.height - 0.3);
  const width = getSurfaceSize(wall, data.room).width;
  const average =
    devices.length > 0 ? devices.reduce((sum, d) => sum + d.x, 0) / devices.length : width / 2;
  // Above the device nearest the group's middle, so that drop is straight.
  const candidates = [...devices].sort(
    (a, b) => Math.abs(a.x - average) - Math.abs(b.x - average)
  );
  const clear = (x: number) =>
    !isPointInsideOpening(wall, x, y, data.openings, 0.1) &&
    !data.nodes.some(
      (n) =>
        n.surface === wall &&
        (n.category === 'junction_box' || n.category === 'distribution_board') &&
        Math.abs(n.x - x) < 0.25
    );
  const x = candidates.map((d) => d.x).find(clear) ?? average;
  return addNode(data, 'junction_box', wall, { x, y }, circuitId);
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

/** Finds a wall position at height `y` clear of openings, furniture and other elements. */
function findFreeWallSpot(
  y: number,
  data: Pick<ProjectData, 'room' | 'openings' | 'furniture'>,
  nodes: ElectricalNode[]
): { surface: WallId; x: number } | null {
  const walls: WallId[] = ['north', 'east', 'south', 'west'];
  for (const surface of walls) {
    const { width } = getSurfaceSize(surface, data.room);
    for (let x = 0.3; x <= width - 0.3 + 1e-9; x += 0.1) {
      const candidate = roundMm(x);
      const behindFurniture = data.furniture.some(
        (f) =>
          f.wall === surface &&
          candidate > f.offsetFromLeft - 0.05 &&
          candidate < f.offsetFromLeft + f.width + 0.05 &&
          y > f.bottom - 0.05 &&
          y < f.bottom + f.height + 0.05
      );
      const blocked =
        behindFurniture ||
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

export interface NetworkAdaptation {
  data: ProjectData;
  /** What applying this would change, in words for the user. */
  changes: string[];
  /** Problems the automatic pass cannot solve. */
  unresolved: string[];
}

const HIGH_LOAD_PERCENT = 80;
const MAX_1P_WATTS_ON_20A = 4600;
const SECTION_STEPS = [1.5, 2.5, 4] as const;

/**
 * Plans fixes for the network without touching the input: own circuits where needed,
 * heavily loaded shared circuits split up, missing outlets added on free wall space.
 */
export function autoAdaptNetwork(data: ProjectData): NetworkAdaptation {
  let circuits = [...data.circuits];
  let nodes = [...data.nodes];
  const appliances = data.appliances.map((a) => ({ ...a }));
  const changes: string[] = [];
  const unresolved: string[] = [];
  const board = nodes.find((n) => n.category === 'distribution_board');
  let feeder = board ?? nodes.find((n) => n.category === 'junction_box');

  const shortLabel = (n: ElectricalNode) => n.label.split(' ')[0];
  const wallName = (surface: WallId) => WALL_META[surface].short.replace('Zid ', '');
  const nextSocketLabel = (name: string) =>
    `U-${nextNumber(
      nodes.map((n) => n.label),
      'U'
    )} (${name})`;
  const circuitOf = (a: ApplianceItem) =>
    nodes.find((n) => n.id === a.assignedNodeId)?.circuitId ?? a.circuitId;
  const lightsWatts = (circuitId: string) =>
    nodes
      .filter((n) => n.circuitId === circuitId)
      .reduce((sum, n) => sum + (ELEMENT_CATALOG[n.category]?.defaultPowerWatts ?? 0), 0);
  const appliancesOn = (circuitId: string) => appliances.filter((a) => circuitOf(a) === circuitId);
  const capacity = (c: ElectricalCircuit) => c.breakerAmps * 230 * (c.phaseType === '3P' ? 3 : 1);
  const loadPercent = (c: ElectricalCircuit) =>
    ((appliancesOn(c.id).reduce((sum, a) => sum + a.powerWatts, 0) + lightsWatts(c.id)) / capacity(c)) * 100;

  function makeCircuit(app: ApplianceItem, threePhaseSocket = false): ElectricalCircuit {
    const circuit: ElectricalCircuit = {
      id: newId('cir'),
      code: nextCircuitCode(circuits),
      name: `Zasebni: ${app.name.slice(0, 24)}`,
      breakerAmps: 16,
      breakerCurve: 'B',
      phaseType: app.threePhase || threePhaseSocket ? '3P' : '1P',
      cableCrossSection: 2.5,
      color: unusedColor(circuits),
      mainJunctionBoxId: feeder?.id ?? '',
    };
    circuits.push(circuit);
    return circuit;
  }

  /** Gives an appliance its own circuit, on its own socket. Returns false if there is no room. */
  function giveOwnCircuit(app: ApplianceItem): boolean {
    const socket = nodes.find((n) => n.id === app.assignedNodeId);
    const sharesSocket =
      socket && appliances.some((a) => a !== app && a.assignedNodeId === socket.id);

    if (socket && !sharesSocket) {
      const circuit = makeCircuit(app, socket.category === 'socket_shuko_3p');
      nodes = nodes.map((n) =>
        n.id === socket.id
          ? {
              ...n,
              circuitId: circuit.id,
              parentBoxId: feeder?.id,
              category: app.threePhase ? ('socket_shuko_3p' as const) : n.category,
            }
          : n
      );
      app.circuitId = circuit.id;
      changes.push(
        `Novi krug ${circuit.code} (${circuit.breakerCurve}${circuit.breakerAmps}, 2,5 mm²) za: ${app.name}. Utičnica ${shortLabel(socket)} prelazi na taj krug.`
      );
      return true;
    }

    const y = app.threePhase ? 0.6 : 0.3;
    const spot = findFreeWallSpot(y, data, nodes);
    if (!spot) {
      unresolved.push(`Nema slobodnog mjesta za utičnicu: ${app.name}.`);
      return false;
    }
    const circuit = makeCircuit(app);
    const added: ElectricalNode = {
      id: newId('node'),
      surface: spot.surface,
      category: app.threePhase ? 'socket_shuko_3p' : 'socket_single',
      label: nextSocketLabel(app.name),
      x: spot.x,
      y,
      circuitId: circuit.id,
      parentBoxId: feeder?.id,
    };
    nodes.push(added);
    app.circuitId = circuit.id;
    app.assignedNodeId = added.id;
    changes.push(
      `Novi krug ${circuit.code} (${circuit.breakerCurve}${circuit.breakerAmps}, 2,5 mm²) za: ${app.name}. Nova utičnica ${shortLabel(added)} na zidu ${wallName(spot.surface)}, ${formatMeters(spot.x)} m od kuta.`
    );
    return true;
  }

  // Added outlets go on a general socket circuit, never on one reserved for a single load.
  const generalSocketCircuit = (): ElectricalCircuit => {
    const existing = circuits.find(
      (c) =>
        c.phaseType === '1P' &&
        c.breakerAmps === 16 &&
        !c.name.startsWith('Zasebni') &&
        !nodes.some((n) => n.circuitId === c.id && n.category.startsWith('light_'))
    );
    if (existing) return existing;
    const created: ElectricalCircuit = {
      id: newId('cir'),
      code: nextCircuitCode(circuits),
      name: 'Utičnice',
      breakerAmps: 16,
      breakerCurve: 'B',
      phaseType: '1P',
      cableCrossSection: 2.5,
      color: unusedColor(circuits),
      mainJunctionBoxId: feeder?.id ?? '',
    };
    circuits.push(created);
    return created;
  };

  // Elements left outside their surface go back onto it
  for (const node of getOutsideNodes({ ...data, nodes })) {
    const moved = moveNodeInside({ ...data, nodes }, node.id);
    nodes = moved.nodes;
    changes.push(`${shortLabel(node)}: premješta se natrag unutar plohe.`);
  }

  // Every installation needs a board to start from, including one this pass is about to create
  if ((nodes.length > 0 || appliances.length > 0) && !board) {
    const spot = findFreeWallSpot(1.65, data, nodes);
    if (spot && circuits[0]) {
      const created = addNode(
        { ...data, nodes, circuits, appliances },
        'distribution_board',
        spot.surface,
        { x: spot.x, y: 1.65 },
        circuits[0].id
      );
      if (created) {
        nodes = created.data.nodes;
        feeder = nodes.find((n) => n.id === created.nodeId);
        changes.push(`Novi razvodni ormar na zidu ${wallName(spot.surface)}, ${formatMeters(spot.x)} m od kuta.`);
      }
    } else {
      unresolved.push('Nema slobodnog mjesta za razvodni ormar.');
    }
  }

  // Single-phase equipment does not belong on a three-phase circuit, or the reverse
  const needsThreePhase = (n: ElectricalNode) => n.category === 'socket_shuko_3p';
  const isSinglePhaseOnly = (n: ElectricalNode) =>
    n.category === 'socket_single' ||
    n.category === 'socket_double' ||
    n.category === 'socket_fixed_1p' ||
    n.category.startsWith('switch_') ||
    n.category.startsWith('light_');
  const isLight = (n: ElectricalNode) =>
    n.category.startsWith('switch_') || n.category.startsWith('light_');
  for (const node of nodes.filter(isSinglePhaseOnly)) {
    const own = circuits.find((c) => c.id === node.circuitId);
    if (own?.phaseType !== '3P') continue;
    const wantsLighting = isLight(node);
    let target = circuits.find(
      (c) => c.phaseType === '1P' && (wantsLighting ? c.breakerAmps === 10 : c.breakerAmps === 16)
    );
    if (!target) {
      target = {
        id: newId('cir'),
        code: nextCircuitCode(circuits),
        name: wantsLighting ? 'Rasvjeta' : 'Utičnice',
        breakerAmps: wantsLighting ? 10 : 16,
        breakerCurve: 'B',
        phaseType: '1P',
        cableCrossSection: wantsLighting ? 1.5 : 2.5,
        color: unusedColor(circuits),
        mainJunctionBoxId: feeder?.id ?? '',
      };
      circuits.push(target);
    }
    const targetId = target.id;
    nodes = nodes.map((n) =>
      n.id === node.id ? { ...n, circuitId: targetId, parentBoxId: feeder?.id } : n
    );
    changes.push(`${shortLabel(node)}: prelazi s trofaznog kruga ${own.code} na jednofazni ${target.code}.`);
  }
  for (const node of nodes.filter(needsThreePhase)) {
    const own = circuits.find((c) => c.id === node.circuitId);
    if (!own || own.phaseType === '3P') continue;
    const others = nodes.filter((n) => n.circuitId === own.id && n.id !== node.id);
    if (others.length === 0) {
      circuits = circuits.map((c) => (c.id === own.id ? { ...c, phaseType: '3P' as const } : c));
      changes.push(`${own.code}: postaje trofazni krug zbog priključka ${shortLabel(node)}.`);
      continue;
    }
    const created: ElectricalCircuit = {
      id: newId('cir'),
      code: nextCircuitCode(circuits),
      name: `Trofazni: ${shortLabel(node)}`,
      breakerAmps: 16,
      breakerCurve: 'B',
      phaseType: '3P',
      cableCrossSection: 2.5,
      color: unusedColor(circuits),
      mainJunctionBoxId: feeder?.id ?? '',
    };
    circuits.push(created);
    nodes = nodes.map((n) =>
      n.id === node.id ? { ...n, circuitId: created.id, parentBoxId: feeder?.id } : n
    );
    changes.push(`Novi trofazni krug ${created.code} za priključak ${shortLabel(node)}.`);
  }

  // A device fed through a junction box must be on that box's circuit
  nodes = nodes.map((n) => {
    if (n.category === 'junction_box' || n.category === 'distribution_board') return n;
    const box = nodes.find((p) => p.id === n.parentBoxId);
    if (box?.category !== 'junction_box' || box.circuitId === n.circuitId) return n;
    changes.push(`${shortLabel(n)}: napajanje se ispravlja jer je kutija ${shortLabel(box)} na drugom krugu.`);
    return { ...n, parentBoxId: feeder?.id };
  });

  // A Schuko socket is rated 16 A, so its circuit may not be fused higher
  circuits = circuits.map((c) => {
    if (c.breakerAmps <= 16 || !hasSchukoSockets(c.id, nodes)) return c;
    changes.push(`${c.code}: osigurač se smanjuje na 16 A jer je Šuko utičnica nazivno 16 A.`);
    return { ...c, breakerAmps: 16 as const };
  });

  // More appliances on a socket than it has places
  for (const socket of nodes.filter((n) => n.category.startsWith('socket_'))) {
    const slots = ELEMENT_CATALOG[socket.category].outletsProvided;
    const excess = appliances
      .filter((a) => a.assignedNodeId === socket.id)
      .sort((a, b) => a.powerWatts - b.powerWatts)
      .slice(slots);
    for (const app of excess) {
      const spot = findFreeWallSpot(0.3, data, nodes);
      if (!spot) {
        unresolved.push(`Nema slobodnog mjesta za utičnicu: ${app.name}.`);
        continue;
      }
      // A socket on a three-phase or 20 A circuit cannot simply gain a Schuko neighbour.
      const source = circuits.find((c) => c.id === socket.circuitId);
      const staysOnCircuit = app.threePhase || (source?.phaseType === '1P' && source.breakerAmps <= 16);
      const added: ElectricalNode = {
        id: newId('node'),
        surface: spot.surface,
        category: app.threePhase ? 'socket_shuko_3p' : 'socket_single',
        label: nextSocketLabel(app.name),
        x: spot.x,
        y: 0.3,
        circuitId: staysOnCircuit ? socket.circuitId : generalSocketCircuit().id,
        parentBoxId: staysOnCircuit ? socket.parentBoxId : feeder?.id,
      };
      nodes.push(added);
      app.assignedNodeId = added.id;
      changes.push(
        `Utičnica ${shortLabel(socket)} ima premalo mjesta. Nova utičnica ${shortLabel(added)} na zidu ${wallName(spot.surface)} za: ${app.name}.`
      );
    }
  }

  // Lighting away from socket circuits
  for (const circuit of [...circuits]) {
    if (!hasLightsAndSockets(circuit.id, nodes)) continue;
    const isLightingOnly = (c: ElectricalCircuit) => {
      const members = nodes.filter((n) => n.circuitId === c.id);
      return (
        members.length > 0 &&
        members.every(
          (n) =>
            n.category.startsWith('light_') ||
            n.category.startsWith('switch_') ||
            n.category === 'junction_box'
        )
      );
    };
    let target = circuits.find(
      (c) => c.phaseType === '1P' && c.breakerAmps === 10 && isLightingOnly(c)
    );
    if (!target) {
      target = {
        id: newId('cir'),
        code: nextCircuitCode(circuits),
        name: 'Rasvjeta',
        breakerAmps: 10,
        breakerCurve: 'B',
        phaseType: '1P',
        cableCrossSection: 1.5,
        color: unusedColor(circuits),
        mainJunctionBoxId: feeder?.id ?? '',
      };
      circuits.push(target);
    }
    const lightingId = target.id;
    const moved = nodes.filter(
      (n) =>
        n.circuitId === circuit.id &&
        (n.category.startsWith('light_') || n.category.startsWith('switch_'))
    );
    nodes = nodes.map((n) =>
      moved.some((m) => m.id === n.id)
        ? { ...n, circuitId: lightingId, parentBoxId: feeder?.id }
        : n
    );
    changes.push(
      `${circuit.code}: rasvjeta i prekidači (${moved.map(shortLabel).join(', ')}) prelaze na krug ${target.code}.`
    );
  }

  // Three-phase appliances need a three-phase socket on a three-phase circuit
  for (const app of appliances.filter((a) => a.threePhase && a.assignedNodeId)) {
    const socket = nodes.find((n) => n.id === app.assignedNodeId);
    const circuit = circuits.find((c) => c.id === socket?.circuitId);
    if (socket && (socket.category !== 'socket_shuko_3p' || circuit?.phaseType !== '3P')) {
      giveOwnCircuit(app);
    }
  }

  // 1. Appliances that need their own circuit
  for (const app of appliances) {
    if (!app.requiresDedicatedCircuit && app.powerWatts < 2500) continue;
    if (appliancesOn(circuitOf(app)).length <= 1) continue;
    giveOwnCircuit(app);
  }

  // 2. Shared circuits under high load: move the strongest appliance off first
  for (const circuit of [...circuits]) {
    while (loadPercent(circuit) >= HIGH_LOAD_PERCENT) {
      const onCircuit = appliancesOn(circuit.id).sort((a, b) => b.powerWatts - a.powerWatts);
      if (onCircuit.length === 0) break;
      if (onCircuit.length === 1 && lightsWatts(circuit.id) === 0) {
        const others = nodes.some(
          (n) => n.circuitId === circuit.id && n.id !== onCircuit[0].assignedNodeId && n.category.startsWith('socket_')
        );
        if (!others || !onCircuit[0].assignedNodeId) break;
      }
      if (!giveOwnCircuit(onCircuit[0])) break;
    }
  }

  // 3. A single appliance close to or over its breaker: a stronger fixed connection
  circuits = circuits.map((circuit) => {
    const percent = loadPercent(circuit);
    if (percent < HIGH_LOAD_PERCENT) return circuit;
    const onCircuit = appliancesOn(circuit.id);
    const total = onCircuit.reduce((sum, a) => sum + a.powerWatts, 0);
    if (onCircuit.length !== 1) {
      if (percent > 100) {
        unresolved.push(`${circuit.code}: krug je preopterećen, a trošila se ne mogu razdvojiti.`);
      }
      return circuit;
    }
    const app = onCircuit[0];
    const socket = nodes.find((n) => n.id === app.assignedNodeId);
    const needsThreePhase = `${circuit.code}: ${app.name} (${total} W) traži trofazni priključak ili ručnu izmjenu.`;
    if (circuit.phaseType !== '1P' || circuit.breakerAmps >= 20 || total > MAX_1P_WATTS_ON_20A) {
      unresolved.push(needsThreePhase);
      return circuit;
    }
    if (!socket) {
      unresolved.push(`${circuit.code}: ${app.name} prvo treba dodijeliti utičnici.`);
      return circuit;
    }
    nodes = nodes.map((n) => (n.id === socket.id ? { ...n, category: 'socket_fixed_1p' as const } : n));
    const after = (total / (20 * 230)) * 100;
    changes.push(
      `${circuit.code}: ${shortLabel(socket)} postaje fiksni priključak, osigurač 20 A, presjek 4,0 mm². Opterećenje pada s ${formatNumber(percent, 0)} % na ${formatNumber(after, 0)} %.`
    );
    if (after >= HIGH_LOAD_PERCENT) unresolved.push(needsThreePhase);
    return { ...circuit, breakerAmps: 20 as const, cableCrossSection: 4 as const };
  });

  // 4. Missing outlets
  const outlets = nodes.reduce(
    (acc, n) =>
      acc +
      (n.category === 'socket_single' || n.category === 'socket_fixed_1p'
        ? 1
        : n.category === 'socket_double'
        ? 2
        : 0),
    0
  );
  let deficit = appliances.filter((a) => !a.threePhase).length - outlets;
  while (deficit > 0 && circuits[0]) {
    const spot = findFreeWallSpot(0.3, data, nodes);
    if (!spot) {
      unresolved.push(`Nema slobodnog mjesta za još ${deficit} utičničnih mjesta.`);
      break;
    }
    const isDouble = deficit >= 2;
    const outletCircuit = generalSocketCircuit();
    const added: ElectricalNode = {
      id: newId('node'),
      surface: spot.surface,
      category: isDouble ? 'socket_double' : 'socket_single',
      label: nextSocketLabel('Dodana utičnica'),
      x: spot.x,
      y: 0.3,
      circuitId: outletCircuit.id,
      parentBoxId:
        nodes.find(
          (n) =>
            n.category === 'junction_box' &&
            n.surface === spot.surface &&
            n.circuitId === outletCircuit.id
        )?.id ?? feeder?.id,
    };
    nodes.push(added);
    changes.push(
      `Nova ${isDouble ? 'dvostruka' : 'jednostruka'} utičnica ${shortLabel(added)} na zidu ${wallName(spot.surface)}, ${formatMeters(spot.x)} m od kuta, na krugu ${outletCircuit.code}.`
    );
    deficit -= isDouble ? 2 : 1;
  }

  // 6. Junction boxes into the upper zone
  nodes = nodes.map((n) => {
    if (
      n.category !== 'junction_box' ||
      n.surface === 'ceiling' ||
      !isBoxOutsideZone(n.y, data.room.height)
    ) {
      return n;
    }
    const y = roundMm(data.room.height - 0.3);
    if (isPointInsideOpening(n.surface, n.x, y, data.openings, 0.1)) {
      unresolved.push(`${shortLabel(n)}: iznad nje je otvor, premjesti kutiju ručno.`);
      return n;
    }
    changes.push(`${shortLabel(n)}: premješta se u gornju instalacijsku zonu, ${formatMeters(y)} m od poda.`);
    return { ...n, y };
  });

  // 7. A junction box where several elements run straight from the board
  for (const group of directFeedGroups({ nodes, circuits, appliances })) {
    if (group.surface === 'ceiling') continue;
    const created = groupDevicesUnderNewBox(
      { ...data, nodes, circuits, appliances },
      group.circuitId,
      group.surface
    );
    if (!created) continue;
    nodes = created.data.nodes;
    const box = nodes.find((n) => n.id === created.nodeId)!;
    const code = circuits.find((c) => c.id === group.circuitId)?.code;
    changes.push(
      `Nova razvodna kutija ${shortLabel(box)} na zidu ${wallName(group.surface as WallId)} za ${group.count} elementa kruga ${code}.`
    );
  }

  // 8. Conductor size: at least what the breaker needs, more if the voltage drop asks for it
  circuits = circuits.map((c) => {
    const minimum = MIN_CROSS_SECTION[c.breakerAmps];
    if (minimum && c.cableCrossSection < minimum) {
      changes.push(`${c.code}: presjek se povećava na ${formatNumber(minimum, 1)} mm² zbog osigurača ${c.breakerAmps} A.`);
      return { ...c, cableCrossSection: minimum as ElectricalCircuit['cableCrossSection'] };
    }
    return c;
  });

  const planned: ProjectData = { ...data, circuits, nodes, appliances };
  const segments = computeRoutedSegments(planned.room, nodes, circuits, planned.openings);
  circuits = circuits.map((c) => {
    const power =
      appliancesOn(c.id).reduce((sum, a) => sum + a.powerWatts, 0) + lightsWatts(c.id);
    const limit = voltageDropLimitPercent(c.id, nodes);
    const dropWith = (section: ElectricalCircuit['cableCrossSection']) =>
      circuitVoltageDropPercent(
        c.id,
        power,
        { ...planned, circuits: planned.circuits.map((x) => (x.id === c.id ? { ...x, cableCrossSection: section } : x)) },
        segments
      );
    if (dropWith(c.cableCrossSection) <= limit) return c;
    const enough = SECTION_STEPS.find((section) => section > c.cableCrossSection && dropWith(section) <= limit);
    if (!enough) {
      unresolved.push(`${c.code}: pad napona prelazi ${limit} % i uz presjek 4,0 mm². Skrati vod ili razdvoji krug.`);
      return c;
    }
    changes.push(`${c.code}: presjek se povećava na ${formatNumber(enough, 1)} mm² zbog pada napona.`);
    return { ...c, cableCrossSection: enough };
  });

  return { data: { ...data, circuits, nodes, appliances }, changes, unresolved };
}
