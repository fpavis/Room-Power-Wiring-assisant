import { ElectricalCircuit, ElectricalNode, RoutedSegment, WireConductor } from '../types/electrical';
import { layoutBoardRails } from './boardLayout';

export type Phase = 'L1' | 'L2' | 'L3';

/** One physical cable leaving the board. */
export interface BoardCable {
  nodeId: string;
  label: string;
  spec: string;
  conductors: WireConductor[];
}

export interface BoardCircuit {
  circuit: ElectricalCircuit;
  cables: BoardCable[];
  phases: Phase[];
  powerWatts: number;
  /** Outgoing terminal number, continuous across the board. */
  terminal: number;
}

export interface RcdGroup {
  code: string;
  poles: 2 | 4;
  ratedAmps: number;
  circuits: BoardCircuit[];
  powerWatts: number;
}

export interface BoardPlan {
  supplyPhases: 1 | 3;
  mainSwitch: { poles: 2 | 4; ratedAmps: number };
  surgeProtector: { poles: 2 | 4 };
  groups: RcdGroup[];
  phaseLoadsWatts: Record<Phase, number>;
  modules: { used: number; enclosure: number };
}

/** Practice, not a norm: a fault then cuts off only part of the installation. */
const MAX_CIRCUITS_PER_RCD = 6;
const SPARE_MODULE_SHARE = 0.2;
const ENCLOSURE_SIZES = [12, 18, 24, 36, 48, 54, 72, 96];

function isLightingCircuit(circuitId: string, nodes: ElectricalNode[]): boolean {
  const members = nodes.filter((n) => n.circuitId === circuitId);
  return (
    members.some((n) => n.category.startsWith('light_')) &&
    members.every(
      (n) =>
        n.category.startsWith('light_') ||
        n.category.startsWith('switch_') ||
        n.category === 'junction_box'
    )
  );
}

/**
 * Lays out the distribution board: a main switch, then RCD groups that each feed their
 * own breakers and own neutral bar. The protective conductor bypasses the RCDs.
 */
export function planDistributionBoard(
  circuits: ElectricalCircuit[],
  powerByCircuit: Map<string, number>,
  nodes: ElectricalNode[],
  segments: RoutedSegment[] = []
): BoardPlan {
  const supplyPhases: 1 | 3 = circuits.some((c) => c.phaseType === '3P') ? 3 : 1;
  const poles: 2 | 4 = supplyPhases === 3 ? 4 : 2;
  const power = (c: ElectricalCircuit) => powerByCircuit.get(c.id) ?? 0;

  const groupCount =
    circuits.length <= 1 ? 1 : Math.max(2, Math.ceil(circuits.length / MAX_CIRCUITS_PER_RCD));
  const buckets: { circuits: ElectricalCircuit[]; power: number }[] = Array.from(
    { length: groupCount },
    () => ({ circuits: [], power: 0 })
  );

  // Lighting spreads over the groups first, so one fault never darkens everything.
  const lighting = circuits.filter((c) => isLightingCircuit(c.id, nodes));
  const others = circuits
    .filter((c) => !isLightingCircuit(c.id, nodes))
    .sort((a, b) => power(b) - power(a));
  lighting.forEach((c, i) => {
    const bucket = buckets[i % groupCount];
    bucket.circuits.push(c);
    bucket.power += power(c);
  });
  for (const c of others) {
    const open = buckets.filter((b) => b.circuits.length < MAX_CIRCUITS_PER_RCD);
    const target = (open.length > 0 ? open : buckets).reduce((best, b) =>
      b.power < best.power ? b : best
    );
    target.circuits.push(c);
    target.power += power(c);
  }

  const phaseLoadsWatts: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
  const lightestPhase = (): Phase => {
    if (supplyPhases === 1) return 'L1';
    return (['L1', 'L2', 'L3'] as Phase[]).reduce((best, p) =>
      phaseLoadsWatts[p] < phaseLoadsWatts[best] ? p : best
    );
  };

  // Three-phase loads first, then the largest single-phase ones, keeps phases even.
  const phaseOf = new Map<string, Phase[]>();
  for (const c of circuits.filter((item) => item.phaseType === '3P')) {
    phaseOf.set(c.id, ['L1', 'L2', 'L3']);
    for (const p of ['L1', 'L2', 'L3'] as Phase[]) phaseLoadsWatts[p] += power(c) / 3;
  }
  for (const c of circuits
    .filter((item) => item.phaseType !== '3P')
    .sort((a, b) => power(b) - power(a))) {
    const phase = lightestPhase();
    phaseOf.set(c.id, [phase]);
    phaseLoadsWatts[phase] += power(c);
  }

  const heaviestPhaseAmps = Math.max(...Object.values(phaseLoadsWatts)) / 230;
  const ratedAmps = heaviestPhaseAmps > 40 ? 63 : 40;

  const boardIds = new Set(
    nodes.filter((n) => n.category === 'distribution_board').map((n) => n.id)
  );
  const cablesOf = (circuitId: string): BoardCable[] => {
    const byTarget = new Map<string, RoutedSegment>();
    for (const s of segments) {
      if (boardIds.has(s.fromNodeId) && s.circuitId === circuitId && !byTarget.has(s.toNodeId)) {
        byTarget.set(s.toNodeId, s);
      }
    }
    return [...byTarget.values()].map((s) => ({
      nodeId: s.toNodeId,
      label: nodes.find((n) => n.id === s.toNodeId)?.label.split(' ')[0] ?? '',
      spec: s.cableSpec,
      conductors: s.conductors,
    }));
  };

  let terminal = 0;
  const groups: RcdGroup[] = buckets
    .filter((b) => b.circuits.length > 0)
    .map((b, i) => ({
      code: `FID-${i + 1}`,
      poles,
      ratedAmps,
      powerWatts: b.power,
      circuits: b.circuits.map((circuit) => ({
        circuit,
        cables: cablesOf(circuit.id),
        phases: phaseOf.get(circuit.id)!,
        powerWatts: power(circuit),
        terminal: ++terminal,
      })),
    }));

  const used =
    poles + // main switch
    poles + // surge protector
    1 + // wire passage beside the main switch
    groups.reduce(
      (sum, g) =>
        sum +
        g.poles +
        1 + // wire passage beside the RCD
        g.circuits.reduce((n, c) => n + (c.circuit.phaseType === '3P' ? 3 : 1), 0),
      0
    );
  const needed = Math.ceil(used * (1 + SPARE_MODULE_SHARE));
  const plan: BoardPlan = {
    supplyPhases,
    mainSwitch: { poles, ratedAmps },
    surgeProtector: { poles },
    groups,
    phaseLoadsWatts,
    modules: { used, enclosure: 0 },
  };
  // Devices that must stay together can leave gaps, so the size comes from the real layout.
  for (let size of ENCLOSURE_SIZES.filter((item) => item >= needed)) {
    plan.modules.enclosure = size;
    const layout = layoutBoardRails(plan);
    if (layout.rows.length * layout.perRow <= size) return plan;
  }
  let size = ENCLOSURE_SIZES[ENCLOSURE_SIZES.length - 1];
  do {
    size += 12;
    plan.modules.enclosure = size;
  } while (size < needed || layoutBoardRails(plan).rows.length * layoutBoardRails(plan).perRow > size);
  return plan;
}

/** Parts list entries for the board, keyed by description. */
export function boardBillOfMaterials(plan: BoardPlan): Record<string, number> {
  if (plan.groups.length === 0) return {};
  const { mainSwitch, surgeProtector, groups, modules } = plan;
  return {
    [`Glavna sklopka ${mainSwitch.poles}P ${mainSwitch.ratedAmps} A`]: 1,
    [`FID sklopka ${groups[0].poles}P ${groups[0].ratedAmps} A / 30 mA, tip A`]: groups.length,
    [`Odvodnik prenapona tip 2, ${surgeProtector.poles}P`]: 1,
    [`Razvodni ormar ${modules.enclosure} modula`]: 1,
    'Nulska sabirnica (po jedna za svaku FID sklopku)': groups.length,
    'Sabirnica zaštitnog vodiča PE': 1,
  };
}
