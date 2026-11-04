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

export function getSurfaceSize(
  surface: SurfaceId,
  room: RoomDimensions,
  centerWall?: WallId
): { width: number; height: number } {
  switch (surface) {
    case 'north':
    case 'south':
      return { width: room.length, height: room.height };
    case 'east':
    case 'west':
      return { width: room.width, height: room.height };
    case 'ceiling': {
      const isEastOrWest =
        centerWall === 'east' ||
        centerWall === 'west' ||
        (!centerWall && room.width >= room.length);
      return {
        width: isEastOrWest ? room.width : room.length,
        height: isEastOrWest ? room.length : room.width,
      };
    }
  }
}

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
      cableSpec: `NYM-J 5x${cs.toFixed(1)} mm²`,
      crossSectionMm2: cs,
      conduitDiameterMm: 25,
      description: 'Trofazni vod (3 faze L1/L2/L3 + Nula + Uzemljenje)',
    };
  }

  if (cat === 'socket_single' || cat === 'socket_double') {
    const cs = circuit.cableCrossSection;
    return {
      conductors: ['L', 'N', 'PE'],
      cableSpec: `NYM-J 3x${cs.toFixed(1)} mm²`,
      crossSectionMm2: cs,
      conduitDiameterMm: cs >= 2.5 ? 20 : 16,
      description: 'Napojni vod utičnice (Faza L + Nula N + Uzemljenje PE)',
    };
  }

  if (cat === 'switch_single') {
    return {
      conductors: ['L', 'L_switched', 'PE'],
      cableSpec: 'NYM-J 3x1.5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 16,
      description: 'Jednopolni prekidač (Faza L dovod + Komutirana faza L\' odvod + PE)',
    };
  }

  if (cat === 'switch_double') {
    return {
      conductors: ['L', 'L_switched', 'L_switched_2', 'N', 'PE'],
      cableSpec: 'NYM-J 5x1.5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 20,
      description: 'Serijski prekidač (Faza L + 2 komutirana odvoda L\'/L\'\' + N + PE)',
    };
  }

  if (cat === 'switch_two_way') {
    return {
      conductors: ['L', 'L_traveler_1', 'L_traveler_2', 'N', 'PE'],
      cableSpec: 'NYM-J 5x1.5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 20,
      description: 'Izmjenični prekidač (Faza/L\' + 2 korespondenta K1/K2 + N + PE)',
    };
  }

  if (cat === 'switch_cross') {
    return {
      conductors: ['L_traveler_1', 'L_traveler_2', 'L_switched', 'L_switched_2', 'PE'],
      cableSpec: 'NYM-J 5x1.5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 20,
      description: 'Križni prekidač (2 ulazna korespondenta K1/K2 + 2 izlazna korespondenta + PE)',
    };
  }

  if (cat === 'light_ceiling' || cat === 'light_wall') {
    return {
      conductors: ['L_switched', 'N', 'PE'],
      cableSpec: 'NYM-J 3x1.5 mm²',
      crossSectionMm2: 1.5,
      conduitDiameterMm: 16,
      description: 'Vod rasvjetnog tijela (Komutirana faza L\' + Nula N + Uzemljenje PE)',
    };
  }

  // Junction box interconnect (main trunk)
  const cs = circuit.cableCrossSection;
  return {
    conductors: circuit.phaseType === '3P' ? ['L1', 'L2', 'L3', 'N', 'PE'] : ['L', 'N', 'PE'],
    cableSpec: `NYM-J ${circuit.phaseType === '3P' ? 5 : 3}x${cs.toFixed(1)} mm²`,
    crossSectionMm2: cs,
    conduitDiameterMm: 25,
    description: 'Glavni napojni vod razvodne kutije',
  };
}

/**
 * Computes orthogonal points on a single wall avoiding door/window openings
 */
function buildWallOrthogonalPath(
  wall: WallId,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  room: RoomDimensions,
  openings: WallOpening[]
): { x: number; y: number }[] {
  const upperZoneY = Number(Math.max(0.3, room.height - 0.3).toFixed(2));
  const wallOpenings = openings.filter((o) => o.wall === wall);

  // If start and end have same X, check if vertical segment hits an opening
  if (Math.abs(startX - endX) < 0.02) {
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const hitOp = wallOpenings.find(
      (op) =>
        startX > op.offsetFromLeft - 0.05 &&
        startX < op.offsetFromLeft + op.width + 0.05 &&
        maxY > op.sillHeight &&
        minY < op.sillHeight + op.height
    );
    if (!hitOp) {
      return [
        { x: startX, y: startY },
        { x: endX, y: endY },
      ];
    }
    // Detour around opening left or right edge
    const detourX =
      startX - hitOp.offsetFromLeft < hitOp.offsetFromLeft + hitOp.width - startX
        ? Math.max(0.1, Number((hitOp.offsetFromLeft - 0.12).toFixed(2)))
        : Number((hitOp.offsetFromLeft + hitOp.width + 0.12).toFixed(2));
    return [
      { x: startX, y: startY },
      { x: detourX, y: startY },
      { x: detourX, y: endY },
      { x: endX, y: endY },
    ];
  }

  // Standard DIN VDE 0100 routing: route via upper installation zone (30 cm below ceiling)
  let routeY = upperZoneY;

  // Check if horizontal segment at routeY between startX and endX hits a tall opening
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  for (const op of wallOpenings) {
    const opTop = op.sillHeight + op.height;
    if (
      maxX > op.offsetFromLeft &&
      minX < op.offsetFromLeft + op.width &&
      routeY >= op.sillHeight - 0.05 &&
      routeY <= opTop + 0.05
    ) {
      // Raise routeY above the opening lintel
      routeY = Number(Math.min(room.height - 0.08, opTop + 0.12).toFixed(2));
    }
  }

  // Also check if vertical drop at endX hits a window/door
  let dropX = endX;
  const dropMinY = Math.min(routeY, endY);
  const dropMaxY = Math.max(routeY, endY);
  for (const op of wallOpenings) {
    if (
      dropX > op.offsetFromLeft - 0.04 &&
      dropX < op.offsetFromLeft + op.width + 0.04 &&
      dropMaxY > op.sillHeight &&
      dropMinY < op.sillHeight + op.height
    ) {
      dropX =
        endX < op.offsetFromLeft + op.width / 2
          ? Math.max(0.1, Number((op.offsetFromLeft - 0.12).toFixed(2)))
          : Number((op.offsetFromLeft + op.width + 0.12).toFixed(2));
    }
  }

  const pts: { x: number; y: number }[] = [{ x: startX, y: startY }];
  if (Math.abs(startY - routeY) > 0.01) {
    pts.push({ x: startX, y: routeY });
  }
  if (Math.abs(startX - dropX) > 0.01) {
    pts.push({ x: dropX, y: routeY });
  }
  if (Math.abs(dropX - endX) > 0.01) {
    pts.push({ x: dropX, y: endY });
  }
  pts.push({ x: endX, y: endY });

  return deduplicatePoints(pts);
}

function deduplicatePoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  for (const p of pts) {
    const prev = result[result.length - 1];
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 0.005) {
      result.push({ x: Number(p.x.toFixed(3)), y: Number(p.y.toFixed(3)) });
    }
  }
  return result;
}

function computePolylineLength(pts: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return Number(len.toFixed(2));
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

/**
 * Builds an orthogonal path on a single wall at a specific pre-planned `trackY`,
 * avoiding any door/window openings along the vertical drop.
 */
function buildSingleWallDropPath(
  wall: WallId,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  trackY: number,
  room: RoomDimensions,
  openings: WallOpening[]
): { x: number; y: number }[] {
  const wallOpenings = openings.filter((o) => o.wall === wall);

  let dropX = endX;
  const dropMinY = Math.min(trackY, endY);
  const dropMaxY = Math.max(trackY, endY);
  for (const op of wallOpenings) {
    if (
      dropX > op.offsetFromLeft - 0.04 &&
      dropX < op.offsetFromLeft + op.width + 0.04 &&
      dropMaxY > op.sillHeight &&
      dropMinY < op.sillHeight + op.height
    ) {
      dropX =
        endX < op.offsetFromLeft + op.width / 2
          ? Math.max(0.08, Number((op.offsetFromLeft - 0.12).toFixed(3)))
          : Number((op.offsetFromLeft + op.width + 0.12).toFixed(3));
    }
  }

  const pts: { x: number; y: number }[] = [{ x: startX, y: startY }];
  if (Math.abs(startY - trackY) > 0.008) {
    pts.push({ x: startX, y: trackY });
  }
  if (Math.abs(startX - dropX) > 0.008) {
    pts.push({ x: dropX, y: trackY });
  }
  if (Math.abs(dropX - endX) > 0.008) {
    pts.push({ x: dropX, y: endY });
  }
  pts.push({ x: endX, y: endY });

  return deduplicatePoints(pts);
}

interface PlannedConnection {
  mainBox: ElectricalNode;
  target: ElectricalNode;
  circuit: ElectricalCircuit;
  spec: ReturnType<typeof getCableAndConduitSpec>;
  startStripIdx: number;
  endStripIdx: number;
  globalStartX: number;
  globalEndX: number;
  horizontalDistance: number;
  isMainFeeder: boolean;
  fedDevicesCount: number;
}

/**
 * Computes all routed cable and conduit segments across the 4 walls and ceiling.
 * Supports 2-level hierarchy:
 * 1. Main feeder lines: Razvodni ormar s osiguračima (RO) -> Razvodna kutija (RK) (1 feeder cable for N devices)
 * 2. Branch lines: Razvodna kutija (RK) -> individual sockets, switches, and lights
 * 3. Direct dedicated lines: Razvodni ormar (RO) -> dedicated appliances (oven, AC, etc.)
 *
 * Plans all parallel horizontal and vertical tracks globally BEFORE generating geometry
 * so that cables never cross on walls, across wall corners, or on the ceiling.
 */
export function computeRoutedSegments(
  room: RoomDimensions,
  nodes: ElectricalNode[],
  circuits: ElectricalCircuit[],
  openings: WallOpening[]
): RoutedSegment[] {
  const segments: RoutedSegment[] = [];
  const TRACK_SPACING = 0.04; // 4.0 cm spacing between parallel conduits
  const baseUpperZoneY = Number(Math.max(0.35, room.height - 0.3).toFixed(3));
  const BOX_SLACK_METERS = 0.25;

  const centerWall = getPrimaryJunctionBoxWall(nodes);
  const wallOrder = getOrderedWallsAroundCenter(centerWall);

  // Compute cumulative global X offset for each wall in the 4-wall strip
  const wallStartOffset: Record<WallId, number> = {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  };
  let accumX = 0;
  for (const w of wallOrder) {
    wallStartOffset[w] = accumX;
    accumX += getSurfaceSize(w, room).width;
  }

  const getGlobalX = (w: WallId, localX: number) => wallStartOffset[w] + localX;

  // Count how many downstream devices each junction_box feeds
  const childCountByBoxId = new Map<string, number>();
  for (const node of nodes) {
    if (
      node.category === 'distribution_board' ||
      node.category === 'junction_box'
    ) {
      continue;
    }
    const parentBox = resolveNodeParentBox(node, nodes, circuits);
    if (parentBox) {
      childCountByBoxId.set(
        parentBox.id,
        (childCountByBoxId.get(parentBox.id) || 0) + 1
      );
    }
  }

  const allConnections: PlannedConnection[] = [];

  for (const target of nodes) {
    if (target.category === 'distribution_board') continue;

    const parentBox = resolveNodeParentBox(target, nodes, circuits);
    if (!parentBox || parentBox.id === target.id) continue;

    const circuit =
      circuits.find((c) => c.id === target.circuitId) || circuits[0];
    if (!circuit) continue;

    const isMainFeeder = target.category === 'junction_box';
    const fedDevicesCount = isMainFeeder
      ? childCountByBoxId.get(target.id) || 0
      : 1;

    const baseSpec = getCableAndConduitSpec(target, circuit);
    const spec = isMainFeeder
      ? {
          ...baseSpec,
          conduitDiameterMm: (circuit.cableCrossSection >= 2.5 ? 25 : 20) as
            | 16
            | 20
            | 25
            | 32,
          description: `Glavni vod kruga ${circuit.code} (${parentBox.label} → ${target.label}) za ${fedDevicesCount} trošila`,
        }
      : baseSpec;

    const startWall: WallId =
      parentBox.surface === 'ceiling' ? centerWall : parentBox.surface;
    const endWall: WallId =
      target.surface === 'ceiling' ? centerWall : target.surface;

    const startStripIdx = wallOrder.indexOf(startWall);
    const endStripIdx = wallOrder.indexOf(endWall);
    const globalStartX = getGlobalX(startWall, parentBox.x);
    const globalEndX = getGlobalX(endWall, target.x);

    allConnections.push({
      mainBox: parentBox,
      target,
      circuit,
      spec,
      startStripIdx,
      endStripIdx,
      globalStartX,
      globalEndX,
      horizontalDistance: Math.abs(globalEndX - globalStartX),
      isMainFeeder,
      fedDevicesCount,
    });
  }

  // 1. CEILING CONNECTIONS (target.surface === 'ceiling') grouped by source box
  const ceilingConnsByBox = new Map<string, PlannedConnection[]>();
  for (const conn of allConnections) {
    if (conn.target.surface === 'ceiling') {
      const list = ceilingConnsByBox.get(conn.mainBox.id) || [];
      list.push(conn);
      ceilingConnsByBox.set(conn.mainBox.id, list);
    }
  }

  for (const [, ceilingConns] of ceilingConnsByBox.entries()) {
    const mainBox = ceilingConns[0].mainBox;
    ceilingConns.sort((a, b) => {
      const dirA = a.target.x < mainBox.x - 0.04 ? -1 : 1;
      const dirB = b.target.x < mainBox.x - 0.04 ? -1 : 1;
      if (dirA !== dirB) return dirA - dirB;
      if (dirA === -1) return a.target.y - b.target.y;
      return b.target.y - a.target.y;
    });

    ceilingConns.forEach((conn, idx) => {
      const count = ceilingConns.length;
      const xOffset = (idx - (count - 1) / 2) * TRACK_SPACING;
      const riseX = Number(Math.max(0.08, mainBox.x + xOffset).toFixed(3));

      if (mainBox.surface !== 'ceiling') {
        const wallRisePts = deduplicatePoints([
          { x: riseX, y: mainBox.y },
          { x: riseX, y: room.height },
        ]);
        segments.push({
          id: `seg-${mainBox.id}-${conn.target.id}-wall`,
          circuitId: conn.circuit.id,
          fromNodeId: mainBox.id,
          toNodeId: conn.target.id,
          surface: mainBox.surface,
          points: wallRisePts,
          lengthMeters: Number(
            (computePolylineLength(wallRisePts) + 0.15).toFixed(2)
          ),
          conduitDiameterMm: conn.spec.conduitDiameterMm,
          conductors: conn.spec.conductors,
          cableSpec: conn.spec.cableSpec,
          crossSectionMm2: conn.spec.crossSectionMm2,
          description: `${mainBox.label} → Strop (${conn.target.label})`,
          isMainFeeder: conn.isMainFeeder,
          fedDevicesCount: conn.fedDevicesCount,
        });

        const ceilPts = deduplicatePoints([
          { x: riseX, y: 0 },
          { x: riseX, y: conn.target.y },
          { x: conn.target.x, y: conn.target.y },
        ]);
        segments.push({
          id: `seg-${mainBox.id}-${conn.target.id}-ceiling`,
          circuitId: conn.circuit.id,
          fromNodeId: mainBox.id,
          toNodeId: conn.target.id,
          surface: 'ceiling',
          points: ceilPts,
          lengthMeters: Number(
            (computePolylineLength(ceilPts) + BOX_SLACK_METERS).toFixed(2)
          ),
          conduitDiameterMm: conn.spec.conduitDiameterMm,
          conductors: conn.spec.conductors,
          cableSpec: conn.spec.cableSpec,
          crossSectionMm2: conn.spec.crossSectionMm2,
          description: `Stropna trasa → ${conn.target.label} (${conn.spec.description})`,
          isMainFeeder: conn.isMainFeeder,
          fedDevicesCount: conn.fedDevicesCount,
        });
      } else {
        const ceilPts = deduplicatePoints([
          { x: riseX, y: mainBox.y },
          { x: riseX, y: conn.target.y },
          { x: conn.target.x, y: conn.target.y },
        ]);
        segments.push({
          id: `seg-${mainBox.id}-${conn.target.id}`,
          circuitId: conn.circuit.id,
          fromNodeId: mainBox.id,
          toNodeId: conn.target.id,
          surface: 'ceiling',
          points: ceilPts,
          lengthMeters: Number(
            (computePolylineLength(ceilPts) + BOX_SLACK_METERS).toFixed(2)
          ),
          conduitDiameterMm: conn.spec.conduitDiameterMm,
          conductors: conn.spec.conductors,
          cableSpec: conn.spec.cableSpec,
          crossSectionMm2: conn.spec.crossSectionMm2,
          description: `${mainBox.label} → ${conn.target.label}`,
          isMainFeeder: conn.isMainFeeder,
          fedDevicesCount: conn.fedDevicesCount,
        });
      }
    });
  }

  // 2. DIRECT VERTICAL WALL CONNECTIONS (same wall, aligned X with source box)
  const wallConns = allConnections.filter(
    (c) => c.target.surface !== 'ceiling'
  );
  const directVerticalConns = wallConns.filter(
    (c) =>
      c.startStripIdx === c.endStripIdx &&
      Math.abs(c.target.x - c.mainBox.x) <= 0.06
  );

  const directByBox = new Map<string, PlannedConnection[]>();
  for (const conn of directVerticalConns) {
    const list = directByBox.get(conn.mainBox.id) || [];
    list.push(conn);
    directByBox.set(conn.mainBox.id, list);
  }

  for (const [, boxDirect] of directByBox.entries()) {
    const mainBox = boxDirect[0].mainBox;
    boxDirect.sort((a, b) => b.target.y - a.target.y);
    boxDirect.forEach((conn, idx) => {
      const count = boxDirect.length;
      const xOffset = (idx - (count - 1) / 2) * TRACK_SPACING;
      const dropX = Number((mainBox.x + xOffset).toFixed(3));
      const pts = deduplicatePoints([
        { x: dropX, y: mainBox.y },
        { x: dropX, y: conn.target.y },
      ]);
      segments.push({
        id: `seg-${mainBox.id}-${conn.target.id}`,
        circuitId: conn.circuit.id,
        fromNodeId: mainBox.id,
        toNodeId: conn.target.id,
        surface: conn.target.surface,
        points: pts,
        lengthMeters: Number(
          (computePolylineLength(pts) + BOX_SLACK_METERS).toFixed(2)
        ),
        conduitDiameterMm: conn.spec.conduitDiameterMm,
        conductors: conn.spec.conductors,
        cableSpec: conn.spec.cableSpec,
        crossSectionMm2: conn.spec.crossSectionMm2,
        description: conn.spec.description,
        isMainFeeder: conn.isMainFeeder,
        fedDevicesCount: conn.fedDevicesCount,
      });
    });
  }

  // 3. GLOBAL LEFT-GOING & RIGHT-GOING HORIZONTAL TRUNK CONNECTIONS
  const leftConns = wallConns.filter(
    (c) =>
      !(
        c.startStripIdx === c.endStripIdx &&
        Math.abs(c.target.x - c.mainBox.x) <= 0.06
      ) && c.globalEndX < c.globalStartX
  );
  const rightConns = wallConns.filter(
    (c) =>
      !(
        c.startStripIdx === c.endStripIdx &&
        Math.abs(c.target.x - c.mainBox.x) <= 0.06
      ) && c.globalEndX >= c.globalStartX
  );

  const routeGlobalTrunkDirection = (
    trunkConns: PlannedConnection[],
    direction: 'left' | 'right'
  ) => {
    if (trunkConns.length === 0) return;

    // Sort globally by where the wire drops down (`globalEndX`):
    // - For right-going trunks: smaller `globalEndX` drops down earlier, so it gets a LOWER `trackY`.
    //   Longer runs that continue further right get HIGHER `trackY` so they pass cleanly above earlier drops and RK boxes!
    // - For left-going trunks: larger `globalEndX` (closer to center) drops down earlier, so it gets a LOWER `trackY`.
    //   Longer runs that continue further left get HIGHER `trackY`.
    trunkConns.sort((a, b) => {
      const endDiff =
        direction === 'right'
          ? a.globalEndX - b.globalEndX
          : b.globalEndX - a.globalEndX;
      if (Math.abs(endDiff) > 0.02) return endDiff;
      if (Math.abs(a.horizontalDistance - b.horizontalDistance) > 0.02) {
        return a.horizontalDistance - b.horizontalDistance;
      }
      return b.target.y - a.target.y;
    });

    const count = trunkConns.length;

    // Group connections that share the same source box so their initial vertical risers are offset in parallel without crossing
    const sameBoxGroups = new Map<string, PlannedConnection[]>();
    // Group connections that share the same destination X so their vertical drops are offset in parallel
    const sameXGroups = new Map<string, PlannedConnection[]>();

    for (const conn of trunkConns) {
      const bList = sameBoxGroups.get(conn.mainBox.id) || [];
      bList.push(conn);
      sameBoxGroups.set(conn.mainBox.id, bList);

      const xKey = `${conn.target.surface}:${Math.round(conn.target.x * 20)}`;
      const xList = sameXGroups.get(xKey) || [];
      xList.push(conn);
      sameXGroups.set(xKey, xList);
    }

    trunkConns.forEach((conn, rank) => {
      const mainBox = conn.mainBox;
      const yOffset = (rank - (count - 1) / 2) * TRACK_SPACING;
      const trackY = Number(
        Math.max(
          0.35,
          Math.min(room.height - 0.06, baseUpperZoneY + yOffset)
        ).toFixed(3)
      );

      // Compute non-crossing riser X offset at the source box:
      // Since `trunkConns` is sorted by ascending `trackY`, within `sameBoxList` earlier items have lower `trackY` and later items have higher `trackY`.
      // If `mainBox.y < trackY` (rising up to the trunk, like RO-1 at 1.65m):
      // - For right-going wires: lower `trackY` takes the RIGHTMOST riser (`+`), higher `trackY` takes the LEFTMOST riser (`-`) so it rises above lower corners before turning right!
      // - For left-going wires: lower `trackY` takes the LEFTMOST riser (`-`), higher `trackY` takes the RIGHTMOST riser (`+`) so it rises above lower corners before turning left!
      const boxList = sameBoxGroups.get(mainBox.id) || [conn];
      const boxIdx = boxList.indexOf(conn);
      const boxCount = boxList.length;
      const isRisingFromBox = mainBox.y <= trackY;
      const riserSign =
        direction === 'right'
          ? isRisingFromBox
            ? -1
            : 1
          : isRisingFromBox
          ? 1
          : -1;
      const riserXOffset =
        boxCount > 1
          ? (boxIdx - (boxCount - 1) / 2) * (TRACK_SPACING * 0.85) * riserSign
          : 0;
      const startRiserX = Number(
        Math.max(0.08, mainBox.x + riserXOffset).toFixed(3)
      );

      // Compute parallel drop X offset if multiple cables drop at the same X
      const xKey = `${conn.target.surface}:${Math.round(conn.target.x * 20)}`;
      const sameXList = sameXGroups.get(xKey) || [conn];
      const sameXIdx = sameXList.indexOf(conn);
      const sameXCount = sameXList.length;
      const dropOffsetSign = direction === 'right' ? 1 : -1;
      const dropXOffset =
        sameXCount > 1
          ? (sameXIdx - (sameXCount - 1) / 2) * TRACK_SPACING * dropOffsetSign
          : 0;
      const finalTargetX = Number((conn.target.x + dropXOffset).toFixed(3));

      // Same wall connection
      if (conn.startStripIdx === conn.endStripIdx) {
        const wall = wallOrder[conn.startStripIdx];
        const pts = buildSingleWallDropPath(
          wall,
          startRiserX,
          mainBox.y,
          finalTargetX,
          conn.target.y,
          trackY,
          room,
          openings
        );
        segments.push({
          id: `seg-${mainBox.id}-${conn.target.id}`,
          circuitId: conn.circuit.id,
          fromNodeId: mainBox.id,
          toNodeId: conn.target.id,
          surface: wall,
          points: pts,
          lengthMeters: Number(
            (computePolylineLength(pts) + BOX_SLACK_METERS).toFixed(2)
          ),
          conduitDiameterMm: conn.spec.conduitDiameterMm,
          conductors: conn.spec.conductors,
          cableSpec: conn.spec.cableSpec,
          crossSectionMm2: conn.spec.crossSectionMm2,
          description: conn.spec.description,
          isMainFeeder: conn.isMainFeeder,
          fedDevicesCount: conn.fedDevicesCount,
        });
        return;
      }

      // Multi-wall connection along the 4-wall strip (maintaining exact same `trackY` on every wall!)
      const step = direction === 'right' ? 1 : -1;
      let currIdx = conn.startStripIdx;
      let hopNumber = 1;

      while (true) {
        const wall = wallOrder[currIdx];
        const wallWidth = getSurfaceSize(wall, room).width;
        const isFirstWall = currIdx === conn.startStripIdx;
        const isLastWall = currIdx === conn.endStripIdx;

        if (isFirstWall) {
          const exitX = direction === 'right' ? wallWidth : 0;
          const pts = deduplicatePoints([
            { x: startRiserX, y: mainBox.y },
            { x: startRiserX, y: trackY },
            { x: exitX, y: trackY },
          ]);
          segments.push({
            id: `seg-${mainBox.id}-${conn.target.id}-w${hopNumber}`,
            circuitId: conn.circuit.id,
            fromNodeId: mainBox.id,
            toNodeId: conn.target.id,
            surface: wall,
            points: pts,
            lengthMeters: Number(
              (computePolylineLength(pts) + 0.08).toFixed(2)
            ),
            conduitDiameterMm: conn.spec.conduitDiameterMm,
            conductors: conn.spec.conductors,
            cableSpec: conn.spec.cableSpec,
            crossSectionMm2: conn.spec.crossSectionMm2,
            description: `${mainBox.label} → prijelaz u ${
              WALL_META[wallOrder[currIdx + step]].name
            }`,
            isMainFeeder: conn.isMainFeeder,
            fedDevicesCount: conn.fedDevicesCount,
          });
        } else if (!isLastWall) {
          const entryX = direction === 'right' ? 0 : wallWidth;
          const exitX = direction === 'right' ? wallWidth : 0;
          const pts = [
            { x: entryX, y: trackY },
            { x: exitX, y: trackY },
          ];
          segments.push({
            id: `seg-${mainBox.id}-${conn.target.id}-w${hopNumber}`,
            circuitId: conn.circuit.id,
            fromNodeId: mainBox.id,
            toNodeId: conn.target.id,
            surface: wall,
            points: pts,
            lengthMeters: Number(computePolylineLength(pts).toFixed(2)),
            conduitDiameterMm: conn.spec.conduitDiameterMm,
            conductors: conn.spec.conductors,
            cableSpec: conn.spec.cableSpec,
            crossSectionMm2: conn.spec.crossSectionMm2,
            description: `Tranzit kroz ${WALL_META[wall].name} → ${conn.target.label}`,
            isMainFeeder: conn.isMainFeeder,
            fedDevicesCount: conn.fedDevicesCount,
          });
        } else {
          const entryX = direction === 'right' ? 0 : wallWidth;
          const pts = buildSingleWallDropPath(
            wall,
            entryX,
            trackY,
            finalTargetX,
            conn.target.y,
            trackY,
            room,
            openings
          );
          segments.push({
            id: `seg-${mainBox.id}-${conn.target.id}-w${hopNumber}`,
            circuitId: conn.circuit.id,
            fromNodeId: mainBox.id,
            toNodeId: conn.target.id,
            surface: wall,
            points: pts,
            lengthMeters: Number(
              (computePolylineLength(pts) + BOX_SLACK_METERS).toFixed(2)
            ),
            conduitDiameterMm: conn.spec.conduitDiameterMm,
            conductors: conn.spec.conductors,
            cableSpec: conn.spec.cableSpec,
            crossSectionMm2: conn.spec.crossSectionMm2,
            description: conn.spec.description,
            isMainFeeder: conn.isMainFeeder,
            fedDevicesCount: conn.fedDevicesCount,
          });
          break;
        }

        currIdx += step;
        hopNumber++;
      }
    });
  };

  routeGlobalTrunkDirection(leftConns, 'left');
  routeGlobalTrunkDirection(rightConns, 'right');

  return segments;
}

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
        `Preopterećenje kruga! Ukupno ${totalPowerWatts} W (${currentAmps} A) prelazi granicu osigurača ${circuit.breakerCurve}${circuit.breakerAmps} (${maxCapacityWatts} W).`
      );
    } else if (status === 'warning') {
      warnings.push(
        `Visoko opterećenje (${utilizationPercent}%). Preporučuje se odvojiti jača trošila u zaseban strujni krug.`
      );
    }

    if (circuit.breakerAmps >= 16 && circuit.cableCrossSection < 2.5) {
      warnings.push(
        `Za osigurač od ${circuit.breakerAmps}A obavezan je presjek vodiča minimalno 2.5 mm²!`
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
        (conduitLengthsByDiameter[seg.conduitDiameterMm] + seg.lengthMeters).toFixed(2)
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
  const conduitsByDiameter: Record<number, number> = { 16: 0, 20: 0, 25: 0 };

  let totalEstimatedLengthMeters = 0;
  for (const seg of segments) {
    cablesBySpec[seg.cableSpec] = Number(
      ((cablesBySpec[seg.cableSpec] || 0) + seg.lengthMeters).toFixed(2)
    );
    conduitsByDiameter[seg.conduitDiameterMm] = Number(
      ((conduitsByDiameter[seg.conduitDiameterMm] || 0) + seg.lengthMeters).toFixed(2)
    );
    totalEstimatedLengthMeters += seg.lengthMeters;
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
    },
  };
}
