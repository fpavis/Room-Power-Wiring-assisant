import { ELEMENT_CATALOG, WALL_META } from '../data/presets';
import {
  ApplianceItem,
  BomSummary,
  CircuitAnalysis,
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  RoomDimensions,
  RoutedSegment,
  SocketBalanceSummary,
  SurfaceId,
  WallId,
  WallOpening,
  WireConductor,
} from '../types/electrical';
import { formatNumber, getSurfaceSize } from './geometry';

export { getSurfaceSize };


export function isPointInsideOpening(
  surface: SurfaceId,
  x: number,
  y: number,
  openings: WallOpening[],
  margin = 0.08
): WallOpening | null {
  if (surface === 'ceiling') return null;
  for (const op of openings) {
    if (op.wall !== surface) continue;
    const left = op.offsetFromLeft - margin;
    const right = op.offsetFromLeft + op.width + margin;
    const bottom = op.sillHeight - (op.type === 'door' ? 0 : margin);
    const top = op.sillHeight + op.height + margin;
    if (x >= left && x <= right && y >= bottom && y <= top) {
      return op;
    }
  }
  return null;
}

export interface SnapResult {
  x: number;
  y: number;
  snappedXNodeId?: string;
  snappedYNodeId?: string;
  snappedStandardHeight?: number;
  kotaOdPoda: number;
  kotaOdStropa: number;
  kotaOdLijevo: number;
  kotaOdDesno: number;
  collidingOpening: WallOpening | null;
}

const STANDARD_WALL_HEIGHTS = [0.3, 0.45, 0.6, 1.05, 1.15, 1.85, 2.2, 2.3];

export function computeSnapAndDimensions(
  surface: SurfaceId,
  rawX: number,
  rawY: number,
  room: RoomDimensions,
  nodes: ElectricalNode[],
  openings: WallOpening[],
  excludeNodeId?: string,
  enableSnap = true
): SnapResult {
  const { width, height } = getSurfaceSize(surface, room);
  let x = Math.max(0.1, Math.min(width - 0.1, Number(rawX.toFixed(2))));
  let y = Math.max(0.1, Math.min(height - 0.1, Number(rawY.toFixed(2))));

  let snappedXNodeId: string | undefined;
  let snappedYNodeId: string | undefined;
  let snappedStandardHeight: number | undefined;

  if (enableSnap) {
    const surfaceNodes = nodes.filter(
      (n) => n.surface === surface && n.id !== excludeNodeId
    );
    const SNAP_THRESHOLD = 0.08; // 8 cm magnetic snap to same axis

    for (const other of surfaceNodes) {
      if (Math.abs(x - other.x) <= SNAP_THRESHOLD) {
        x = other.x;
        snappedXNodeId = other.id;
        break;
      }
    }

    for (const other of surfaceNodes) {
      if (Math.abs(y - other.y) <= SNAP_THRESHOLD) {
        y = other.y;
        snappedYNodeId = other.id;
        break;
      }
    }

    // If not snapped to another node's Y on a wall, check standard installation heights
    if (!snappedYNodeId && surface !== 'ceiling') {
      for (const stdH of STANDARD_WALL_HEIGHTS) {
        if (stdH < height && Math.abs(y - stdH) <= 0.04) {
          y = stdH;
          snappedStandardHeight = stdH;
          break;
        }
      }
      // Also check 30 cm from ceiling
      const upperZone = Number((room.height - 0.3).toFixed(2));
      if (Math.abs(y - upperZone) <= 0.04) {
        y = upperZone;
        snappedStandardHeight = upperZone;
      }
    }

    // On ceiling, snap to center axes
    if (surface === 'ceiling') {
      if (!snappedXNodeId && Math.abs(x - width / 2) <= 0.08) {
        x = Number((width / 2).toFixed(2));
      }
      if (!snappedYNodeId && Math.abs(y - height / 2) <= 0.08) {
        y = Number((height / 2).toFixed(2));
      }
    }
  }

  x = Number(x.toFixed(2));
  y = Number(y.toFixed(2));

  const collidingOpening = isPointInsideOpening(surface, x, y, openings, 0.05);

  return {
    x,
    y,
    snappedXNodeId,
    snappedYNodeId,
    snappedStandardHeight,
    kotaOdPoda: y,
    kotaOdStropa: Number((height - y).toFixed(2)),
    kotaOdLijevo: x,
    kotaOdDesno: Number((width - x).toFixed(2)),
    collidingOpening,
  };
}

/**
 * Determines conductor bundle, cable spec, and conduit diameter for a connection
 */
export function getCableAndConduitSpec(
  targetNode: ElectricalNode,
  circuit: ElectricalCircuit
): {
  conductors: WireConductor[];
  cableSpec: string;
  crossSectionMm2: 1.5 | 2.5 | 4.0;
  conduitDiameterMm: 16 | 20 | 25 | 32;
  description: string;
} {
  const cat = targetNode.category;

  if (cat === 'socket_shuko_3p' || circuit.phaseType === '3P') {
    const cs = circuit.cableCrossSection >= 2.5 ? circuit.cableCrossSection : 2.5;
    return {
      conductors: ['L1', 'L2', 'L3', 'N', 'PE'],
      cableSpec: `NYM-J 5x${formatNumber(cs, 1)} mm²`,
      crossSectionMm2: cs,
      conduitDiameterMm: 25,
      description: 'Trofazni vod (3 faze L1/L2/L3 + Nula + Uzemljenje)',
    };
  }

  if (cat === 'socket_single' || cat === 'socket_double') {
    const cs = circuit.cableCrossSection;
    return {
      conductors: ['L', 'N', 'PE'],
      cableSpec: `NYM-J 3x${formatNumber(cs, 1)} mm²`,
      crossSectionMm2: cs,
      conduitDiameterMm: cs >= 2.5 ? 20 : 16,
      description: 'Napojni vod utičnice (Faza L + Nula N + Uzemljenje PE)',
    };
  }

  if (cat === 'switch_single') {
    return {
      conductors: ['L', 'L_switched', 'PE'],
      cableSpec: 'NYM-J 3x1,5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 16,
      description: 'Jednopolni prekidač (Faza L dovod + Komutirana faza L\' odvod + PE)',
    };
  }

  if (cat === 'switch_double') {
    return {
      conductors: ['L', 'L_switched', 'L_switched_2', 'N', 'PE'],
      cableSpec: 'NYM-J 5x1,5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 20,
      description: 'Serijski prekidač (Faza L + 2 komutirana odvoda L\'/L\'\' + N + PE)',
    };
  }

  if (cat === 'switch_two_way') {
    return {
      conductors: ['L', 'L_traveler_1', 'L_traveler_2', 'N', 'PE'],
      cableSpec: 'NYM-J 5x1,5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 20,
      description: 'Izmjenični prekidač (Faza/L\' + 2 korespondenta K1/K2 + N + PE)',
    };
  }

  if (cat === 'switch_cross') {
    return {
      conductors: ['L_traveler_1', 'L_traveler_2', 'L_switched', 'L_switched_2', 'PE'],
      cableSpec: 'NYM-J 5x1,5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 20,
      description: 'Križni prekidač (2 ulazna korespondenta K1/K2 + 2 izlazna korespondenta + PE)',
    };
  }

  if (cat === 'light_ceiling' || cat === 'light_wall') {
    return {
      conductors: ['L_switched', 'N', 'PE'],
      cableSpec: 'NYM-J 3x1,5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 16,
      description: 'Vod rasvjetnog tijela (Komutirana faza L\' + Nula N + Uzemljenje PE)',
    };
  }

  // Junction box interconnect (main trunk)
  const cs = circuit.cableCrossSection;
  return {
    conductors: ['L', 'N', 'PE'],
    cableSpec: `NYM-J 3x${formatNumber(cs, 1)} mm²`,
    crossSectionMm2: cs,
    conduitDiameterMm: 25,
    description: 'Glavni napojni vod razvodne kutije',
  };
}

const CW_WALLS: WallId[] = ['north', 'east', 'south', 'west'];

/**
 * Returns the primary wall containing the Razvodni ormar s osiguračima (distribution_board)
 * or main junction box. This wall is placed in the center of the unfolded 2D/3D strip,
 * with Strop directly above it, Left wall to the left, and Right wall to the right.
 */
export function getPrimaryJunctionBoxWall(
  nodes: ElectricalNode[],
  selectedNodeId?: string | null
): WallId {
  if (selectedNodeId) {
    const sel = nodes.find((n) => n.id === selectedNodeId);
    if (
      sel &&
      sel.category === 'distribution_board' &&
      sel.surface !== 'ceiling'
    ) {
      return sel.surface;
    }
  }
  const mainRo = nodes.find(
    (n) => n.category === 'distribution_board' && n.surface !== 'ceiling'
  );
  if (mainRo && mainRo.surface !== 'ceiling') {
    return mainRo.surface;
  }
  const firstRk = nodes.find(
    (n) => n.category === 'junction_box' && n.surface !== 'ceiling'
  );
  return (firstRk?.surface as WallId) || 'north';
}

/**
 * Returns the 4 walls ordered from left to right around `centerWall` (which has the distribution board):
 * [leftWall, centerWall, rightWall, oppositeWall]
 * When facing `centerWall` from inside the room:
 * - `leftWall` (counter-clockwise) is immediately to the LEFT of `centerWall`
 * - `centerWall` is in the MIDDLE (with Strop directly above it)
 * - `rightWall` (clockwise) is immediately to the RIGHT of `centerWall`
 * - `oppositeWall` continues to the right of `rightWall`
 */
export function getOrderedWallsAroundCenter(
  centerWall: WallId
): [WallId, WallId, WallId, WallId] {
  const idx = CW_WALLS.indexOf(centerWall);
  const leftWall = CW_WALLS[(idx + 3) % 4];
  const rightWall = CW_WALLS[(idx + 1) % 4];
  const oppositeWall = CW_WALLS[(idx + 2) % 4];
  return [leftWall, centerWall, rightWall, oppositeWall];
}

/**
 * Resolves the parent feeding box (`junction_box` RK or `distribution_board` RO) for any electrical node.
 * Hierarchy:
 * - `distribution_board` (Razvodni ormar s osiguračima): root power source (returns null)
 * - `junction_box` (Razvodna kutija): fed from `distribution_board` (RO) via 1 main feeder cable
 * - End devices (sockets, switches, lights): fed from their assigned `junction_box` (RK) so 1 main feeder
 *   branches to multiple devices, OR fed directly from `distribution_board` (RO) for dedicated circuits.
 */
export function resolveNodeParentBox(
  node: ElectricalNode,
  nodes: ElectricalNode[],
  circuits: ElectricalCircuit[]
): ElectricalNode | null {
  if (node.category === 'distribution_board') {
    return null;
  }

  const mainRo =
    nodes.find((n) => n.category === 'distribution_board') || null;

  // For a junction box (RK), its parent is either an explicitly selected parent box or the main RO
  if (node.category === 'junction_box') {
    if (node.parentBoxId && node.parentBoxId !== node.id) {
      const explicitParent = nodes.find((n) => n.id === node.parentBoxId);
      if (explicitParent) return explicitParent;
    }
    return mainRo;
  }

  // For end devices (sockets, switches, lights):
  // 1. Check explicit parentBoxId
  if (node.parentBoxId && node.parentBoxId !== node.id) {
    const explicitBox = nodes.find(
      (n) =>
        n.id === node.parentBoxId &&
        (n.category === 'junction_box' || n.category === 'distribution_board')
    );
    if (explicitBox) return explicitBox;
  }

  // 2. Check if there is a junction_box on the SAME circuit and SAME wall
  const sameWallRk = nodes.find(
    (n) =>
      n.category === 'junction_box' &&
      n.circuitId === node.circuitId &&
      n.surface === node.surface
  );
  if (sameWallRk) return sameWallRk;

  // 3. Check the circuit's designated mainJunctionBoxId
  const circuit = circuits.find((c) => c.id === node.circuitId);
  if (circuit?.mainJunctionBoxId) {
    const circuitBox = nodes.find((n) => n.id === circuit.mainJunctionBoxId);
    if (circuitBox) return circuitBox;
  }

  // 4. Check any junction_box on the same circuit
  const anyCircuitRk = nodes.find(
    (n) => n.category === 'junction_box' && n.circuitId === node.circuitId
  );
  if (anyCircuitRk) return anyCircuitRk;

  // 5. Fallback to the main distribution board (RO) or any junction box
  return (
    mainRo || nodes.find((n) => n.category === 'junction_box') || null
  );
}

/** Cable to buy for a measured length: 10 % reserve, whole metres. */
export const cablePurchaseMeters = (meters: number): number =>
  Math.ceil(meters * 1.1);

/** Conduit to buy for a measured length: 8 % reserve, whole metres. */
export const conduitPurchaseMeters = (meters: number): number =>
  Math.ceil(meters * 1.08);

/**
 * Full engineering analysis: Socket vs Appliance balance, Circuit loads, and Bill of Materials (BOM)
 */
export function analyzeProject(
  nodes: ElectricalNode[],
  appliances: ApplianceItem[],
  circuits: ElectricalCircuit[],
  segments: RoutedSegment[]
): {
  socketBalance: SocketBalanceSummary;
  circuitAnalyses: CircuitAnalysis[];
  bom: BomSummary;
} {
  // 1. Socket vs Appliance Balance
  const totalSingleSockets = nodes.filter((n) => n.category === 'socket_single').length;
  const totalDoubleSockets = nodes.filter((n) => n.category === 'socket_double').length;
  const totalThreePhaseSockets = nodes.filter(
    (n) => n.category === 'socket_shuko_3p'
  ).length;

  const totalAvailableOutlets1P = totalSingleSockets * 1 + totalDoubleSockets * 2;
  const totalAvailableOutlets3P = totalThreePhaseSockets;

  const plugAppliances1P = appliances.filter((a) => !a.threePhase);
  const plugAppliances3P = appliances.filter((a) => Boolean(a.threePhase));

  const totalPlugAppliances1P = plugAppliances1P.length;
  const totalPlugAppliances3P = plugAppliances3P.length;

  const assignedAppliancesCount = appliances.filter((a) =>
    Boolean(a.assignedNodeId && nodes.some((n) => n.id === a.assignedNodeId))
  ).length;
  const unassignedAppliancesCount = appliances.length - assignedAppliancesCount;

  const freeOutlets1P = Math.max(0, totalAvailableOutlets1P - totalPlugAppliances1P);
  const missingOutlets1P = Math.max(0, totalPlugAppliances1P - totalAvailableOutlets1P);
  const missingOutlets3P = Math.max(0, totalPlugAppliances3P - totalAvailableOutlets3P);

  const socketBalance: SocketBalanceSummary = {
    totalSingleSockets,
    totalDoubleSockets,
    totalThreePhaseSockets,
    totalAvailableOutlets1P,
    totalAvailableOutlets3P,
    totalPlugAppliances1P,
    totalPlugAppliances3P,
    assignedAppliancesCount,
    unassignedAppliancesCount,
    freeOutlets1P,
    missingOutlets1P,
    missingOutlets3P,
    isBalanced: missingOutlets1P === 0 && missingOutlets3P === 0,
  };

  // 2. Circuit Load & Cable Analysis
  const circuitAnalyses: CircuitAnalysis[] = circuits.map((circuit) => {
    const cNodes = nodes.filter((n) => n.circuitId === circuit.id);
    const cSegments = segments.filter((s) => s.circuitId === circuit.id);

    const socketOutletsCount = cNodes.reduce(
      (acc, n) => acc + (ELEMENT_CATALOG[n.category]?.outletsProvided || 0),
      0
    );
    const switchesCount = cNodes.filter((n) => n.category.startsWith('switch_')).length;
    const lightsCount = cNodes.filter((n) => n.category.startsWith('light_')).length;

    // Appliances assigned to a node on this circuit OR assigned directly to this circuitId
    const assignedAppliances = appliances.filter((app) => {
      if (app.assignedNodeId) {
        const targetNode = nodes.find((n) => n.id === app.assignedNodeId);
        if (targetNode) {
          return targetNode.circuitId === circuit.id;
        }
      }
      return app.circuitId === circuit.id;
    });

    const appliancesPower = assignedAppliances.reduce((s, a) => s + a.powerWatts, 0);
    const lightsPower = cNodes.reduce(
      (s, n) => s + (ELEMENT_CATALOG[n.category]?.defaultPowerWatts || 0),
      0
    );
    const totalPowerWatts = appliancesPower + lightsPower;

    const currentAmps = Number(
      (
        totalPowerWatts /
        (circuit.phaseType === '3P' ? 3 * 230 : 230)
      ).toFixed(2)
    );
    const maxCapacityWatts =
      circuit.phaseType === '3P'
        ? circuit.breakerAmps * 230 * 3
        : circuit.breakerAmps * 230;

    const utilizationPercent = Number(
      Math.min(999, (totalPowerWatts / maxCapacityWatts) * 100).toFixed(1)
    );

    let status: 'nominal' | 'warning' | 'overload' = 'nominal';
    if (utilizationPercent > 100) status = 'overload';
    else if (utilizationPercent >= 80) status = 'warning';

    const recommendedBreakerAmps: 10 | 16 | 20 =
      lightsCount > 0 && socketOutletsCount === 0 && totalPowerWatts <= 2000
        ? 10
        : totalPowerWatts > 3680 && circuit.phaseType === '1P'
        ? 20
        : 16;

    const recommendedCrossSection: 1.5 | 2.5 | 4.0 =
      recommendedBreakerAmps === 10 ? 1.5 : recommendedBreakerAmps === 20 ? 4.0 : 2.5;

    const warnings: string[] = [];
    if (status === 'overload') {
      warnings.push(
        `Preopterećenje kruga! Ukupno ${totalPowerWatts} W (${formatNumber(currentAmps, 2)} A) prelazi granicu osigurača ${circuit.breakerCurve}${circuit.breakerAmps} (${maxCapacityWatts} W).`
      );
    } else if (status === 'warning') {
      warnings.push(
        `Visoko opterećenje (${formatNumber(utilizationPercent, 1)} %). Preporučuje se odvojiti jača trošila u zaseban strujni krug.`
      );
    }

    if (circuit.breakerAmps >= 16 && circuit.cableCrossSection < 2.5) {
      warnings.push(
        `Za osigurač od ${circuit.breakerAmps}A obavezan je presjek vodiča minimalno 2,5 mm².`
      );
    }

    const dedicatedApps = assignedAppliances.filter((a) => a.requiresDedicatedCircuit);
    if (dedicatedApps.length > 0 && assignedAppliances.length > 1) {
      warnings.push(
        `Uređaj "${dedicatedApps[0].name}" zahtijeva zaseban strujni krug, a dijeli krug s još ${
          assignedAppliances.length - 1
        } trošila.`
      );
    }

    // Check if single socket has multiple appliances assigned
    for (const node of cNodes) {
      const appsOnNode = appliances.filter((a) => a.assignedNodeId === node.id);
      const maxSlots = ELEMENT_CATALOG[node.category]?.outletsProvided || 0;
      if (maxSlots > 0 && appsOnNode.length > maxSlots) {
        warnings.push(
          `Utičnica "${node.label}" ima ${maxSlots} priključna mjesta, a dodijeljeno joj je ${appsOnNode.length} uređaja!`
        );
      }
    }

    const totalCableLengthMeters = Number(
      cSegments.reduce((s, seg) => s + seg.lengthMeters, 0).toFixed(2)
    );

    const conduitLengthsByDiameter: Record<16 | 20 | 25 | 32, number> = {
      16: 0,
      20: 0,
      25: 0,
      32: 0,
    };
    for (const seg of cSegments) {
      conduitLengthsByDiameter[seg.conduitDiameterMm] = Number(
        (conduitLengthsByDiameter[seg.conduitDiameterMm] + seg.routeLengthMeters).toFixed(2)
      );
    }

    return {
      circuit,
      nodesCount: cNodes.length,
      socketOutletsCount,
      switchesCount,
      lightsCount,
      assignedAppliances,
      totalPowerWatts,
      currentAmps,
      maxCapacityWatts,
      utilizationPercent,
      status,
      recommendedBreakerAmps,
      recommendedCrossSection,
      totalCableLengthMeters,
      conduitLengthsByDiameter,
      warnings,
    };
  });

  // 3. Bill of Materials (BOM)
  const cablesBySpec: Record<string, number> = {};
  const conduitsByDiameter: Record<number, number> = { 16: 0, 20: 0, 25: 0, 32: 0 };

  let totalEstimatedLengthMeters = 0;
  let totalRouteLengthMeters = 0;
  for (const seg of segments) {
    cablesBySpec[seg.cableSpec] = Number(
      ((cablesBySpec[seg.cableSpec] || 0) + seg.lengthMeters).toFixed(2)
    );
    conduitsByDiameter[seg.conduitDiameterMm] = Number(
      ((conduitsByDiameter[seg.conduitDiameterMm] || 0) + seg.routeLengthMeters).toFixed(2)
    );
    totalEstimatedLengthMeters += seg.lengthMeters;
    totalRouteLengthMeters += seg.routeLengthMeters;
  }

  const countsByCategory: Record<ElementCategory, number> = {
    distribution_board: 0,
    junction_box: 0,
    socket_single: 0,
    socket_double: 0,
    socket_shuko_3p: 0,
    switch_single: 0,
    switch_double: 0,
    switch_two_way: 0,
    switch_cross: 0,
    light_ceiling: 0,
    light_wall: 0,
  };
  for (const n of nodes) {
    countsByCategory[n.category] = (countsByCategory[n.category] || 0) + 1;
  }

  const breakersBySpec: Record<string, number> = {};
  for (const c of circuits) {
    const key = `Automatski osigurač ${c.phaseType} ${c.breakerCurve}${c.breakerAmps}A`;
    breakersBySpec[key] = (breakersBySpec[key] || 0) + 1;
  }

  const wagoConnectorsCount =
    countsByCategory.junction_box * 5 +
    (countsByCategory.socket_single + countsByCategory.socket_double) * 1 +
    (countsByCategory.switch_single +
      countsByCategory.switch_double +
      countsByCategory.switch_two_way) *
      2;

  return {
    socketBalance,
    circuitAnalyses,
    bom: {
      cablesBySpec,
      conduitsByDiameter,
      countsByCategory,
      breakersBySpec,
      wagoConnectorsCount,
      totalEstimatedLengthMeters: Number(totalEstimatedLengthMeters.toFixed(2)),
      totalRouteLengthMeters: Number(totalRouteLengthMeters.toFixed(2)),
      totalPurchaseCableMeters: Object.values(cablesBySpec).reduce(
        (sum, meters) => sum + cablePurchaseMeters(meters),
        0
      ),
    },
  };
}
