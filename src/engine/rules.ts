import { ElectricalNode, ProjectData, RoutedSegment, SurfaceId } from '../types/electrical';
import { resolveNodeParentBox } from './electricalEngine';
import { formatNumber } from './geometry';

export interface RuleHint {
  id: string;
  level: 'warning' | 'info';
  text: string;
}

/** Copper resistivity at conductor operating temperature, Ω·mm²/m. */
const COPPER_RESISTIVITY = 0.0225;
/** Recommended limits for installations fed from the public low-voltage network. */
const VOLTAGE_DROP_LIMIT_LIGHTING = 3;
const VOLTAGE_DROP_LIMIT_OTHER = 5;

/** Length from the distribution board to a node along its feeders, in metres. */
function lengthToNode(
  nodeId: string,
  data: ProjectData,
  segments: RoutedSegment[],
  seen = new Set<string>()
): number {
  if (seen.has(nodeId)) return 0;
  seen.add(nodeId);
  const own = segments
    .filter((s) => s.toNodeId === nodeId)
    .reduce((sum, s) => sum + s.routeLengthMeters, 0);
  const node = data.nodes.find((n) => n.id === nodeId);
  const parent = node && resolveNodeParentBox(node, data.nodes, data.circuits);
  return own + (parent ? lengthToNode(parent.id, data, segments, seen) : 0);
}

/** Worst-case voltage drop of a circuit: full load at its farthest point, in percent. */
export function circuitVoltageDropPercent(
  circuitId: string,
  powerWatts: number,
  data: ProjectData,
  segments: RoutedSegment[]
): number {
  const circuit = data.circuits.find((c) => c.id === circuitId);
  if (!circuit || powerWatts <= 0) return 0;
  const longest = data.nodes
    .filter((n) => n.circuitId === circuitId)
    .reduce((max, n) => Math.max(max, lengthToNode(n.id, data, segments)), 0);
  const resistancePerMeter = COPPER_RESISTIVITY / circuit.cableCrossSection;
  if (circuit.phaseType === '3P') {
    const current = powerWatts / (Math.sqrt(3) * 400);
    return ((Math.sqrt(3) * longest * current * resistancePerMeter) / 400) * 100;
  }
  const current = powerWatts / 230;
  return ((2 * longest * current * resistancePerMeter) / 230) * 100;
}

export const MIN_CROSS_SECTION: Record<number, number> = { 10: 1.5, 16: 2.5, 20: 4 };

/** Recommended limit for a circuit: lighting-only circuits are held to the lower one. */
export function voltageDropLimitPercent(circuitId: string, nodes: ElectricalNode[]): number {
  const members = nodes.filter((n) => n.circuitId === circuitId);
  const onlyLights =
    members.length > 0 &&
    members.every(
      (n) =>
        n.category.startsWith('light_') ||
        n.category.startsWith('switch_') ||
        n.category === 'junction_box'
    );
  return onlyLights ? VOLTAGE_DROP_LIMIT_LIGHTING : VOLTAGE_DROP_LIMIT_OTHER;
}

export const hasSchukoSockets = (circuitId: string, nodes: ElectricalNode[]) =>
  nodes.some(
    (n) =>
      n.circuitId === circuitId &&
      (n.category === 'socket_single' || n.category === 'socket_double')
  );

export const isBoxOutsideZone = (y: number, roomHeight: number) =>
  y > roomHeight - 0.15 + 1e-9 || y < roomHeight - 0.45 - 1e-9;

export const hasLightsAndSockets = (circuitId: string, nodes: ElectricalNode[]) => {
  const members = nodes.filter((n) => n.circuitId === circuitId);
  return (
    members.some((n) => n.category.startsWith('light_')) &&
    members.some((n) => n.category.startsWith('socket_'))
  );
};

/** Three or more elements of a circuit on one wall fed straight from the board. */
export function directFeedGroups(
  data: Pick<ProjectData, 'nodes' | 'circuits' | 'appliances'>
): { circuitId: string; surface: SurfaceId; count: number }[] {
  const { nodes, circuits, appliances } = data;
  const board = nodes.find((n) => n.category === 'distribution_board');
  if (!board) return [];
  const groups = new Map<string, { circuitId: string; surface: SurfaceId; count: number }>();
  for (const n of nodes) {
    const parent = resolveNodeParentBox(n, nodes, circuits);
    if (
      parent?.id === board.id &&
      (n.category.startsWith('socket_') || n.category.startsWith('switch_')) &&
      !appliances.some((a) => a.assignedNodeId === n.id && a.requiresDedicatedCircuit)
    ) {
      const key = `${n.circuitId}|${n.surface}`;
      const group = groups.get(key) ?? { circuitId: n.circuitId, surface: n.surface, count: 0 };
      group.count++;
      groups.set(key, group);
    }
  }
  return [...groups.values()].filter((g) => g.count >= 3);
}

export function checkInstallationRules(
  data: ProjectData,
  segments: RoutedSegment[],
  powerByCircuit: Map<string, number>
): RuleHint[] {
  const hints: RuleHint[] = [];
  const { nodes, circuits, room } = data;

  for (const circuit of circuits) {
    const members = nodes.filter((n) => n.circuitId === circuit.id);
    const minimum = MIN_CROSS_SECTION[circuit.breakerAmps];
    if (minimum && circuit.cableCrossSection < minimum && circuit.breakerAmps !== 16) {
      hints.push({
        id: `section-${circuit.id}`,
        level: 'warning',
        text: `${circuit.code}: osigurač ${circuit.breakerAmps} A traži presjek najmanje ${formatNumber(minimum, 1)} mm². Rješenje: povećati presjek.`,
      });
    }

    const power = powerByCircuit.get(circuit.id) ?? 0;
    const limit = voltageDropLimitPercent(circuit.id, nodes);
    const drop = circuitVoltageDropPercent(circuit.id, power, data, segments);
    if (drop > limit) {
      hints.push({
        id: `drop-${circuit.id}`,
        level: 'warning',
        text: `${circuit.code}: pad napona ${formatNumber(drop, 1)} % prelazi preporučenih ${limit} %. Rješenje: veći presjek ili kraći vod.`,
      });
    }

    if (hasLightsAndSockets(circuit.id, nodes)) {
      hints.push({
        id: `mixed-${circuit.id}`,
        level: 'info',
        text: `${circuit.code}: rasvjeta i utičnice na istom krugu. Rješenje: rasvjetu prebaciti na zaseban krug, da kvar na utičnici ne ugasi svjetlo.`,
      });
    }

    if (circuit.breakerAmps > 16 && hasSchukoSockets(circuit.id, nodes)) {
      hints.push({
        id: `schuko-${circuit.id}`,
        level: 'warning',
        text: `${circuit.code}: Šuko utičnica je nazivno 16 A, a osigurač je ${circuit.breakerAmps} A. Rješenje: osigurač 16 A ili fiksni priključak.`,
      });
    }
  }

  for (const box of nodes.filter((n) => n.category === 'junction_box' && n.surface !== 'ceiling')) {
    if (isBoxOutsideZone(box.y, room.height)) {
      hints.push({
        id: `zone-${box.id}`,
        level: 'info',
        text: `${box.label.split(' ')[0]}: razvodna kutija izvan gornje instalacijske zone (15 do 45 cm ispod stropa). Rješenje: premjestiti je u zonu.`,
      });
    }
  }

  const mainBoard = nodes.find((n) => n.category === 'distribution_board');
  if (nodes.length > 0 && !mainBoard) {
    hints.push({
      id: 'no-board',
      level: 'warning',
      text: 'Nema razvodnog ormara, pa vodovi nemaju izvor napajanja. Rješenje: dodati razvodni ormar.',
    });
  }

  for (const group of directFeedGroups(data)) {
    const code = circuits.find((c) => c.id === group.circuitId)?.code;
    hints.push({
      id: `box-${group.circuitId}-${group.surface}`,
      level: 'info',
      text: `${code}: ${group.count} elementa na istom zidu idu izravno iz ormara. Rješenje: razvodna kutija skraćuje vodove.`,
    });
  }

  return hints;
}
