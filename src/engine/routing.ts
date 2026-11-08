import { WALL_META } from '../data/presets';
import {
  ElectricalCircuit,
  ElectricalNode,
  RoomDimensions,
  RoutedSegment,
  SurfaceId,
  WallId,
  WallOpening,
} from '../types/electrical';
import {
  getCableAndConduitSpec,
  getOrderedWallsAroundCenter,
  getPrimaryJunctionBoxWall,
  resolveNodeParentBox,
} from './electricalEngine';
import {
  ceilingToView,
  getSurfaceSize,
  Point,
  wallPointOnCeilingEdge,
} from './geometry';

const TRACK_SPACING = 0.04;
const BOX_SLACK_METERS = 0.25;
const round3 = (v: number) => Number(v.toFixed(3));
const round2 = (v: number) => Number(v.toFixed(2));

function deduplicatePoints(pts: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of pts) {
    const prev = result[result.length - 1];
    if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 0.0005) {
      result.push({ x: round3(p.x), y: round3(p.y) });
    }
  }
  return result;
}

function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

function wallDropPath(
  wall: WallId,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  trackY: number,
  openings: WallOpening[]
): Point[] {
  let dropX = endX;
  const dropMinY = Math.min(trackY, endY);
  const dropMaxY = Math.max(trackY, endY);
  for (const op of openings.filter((o) => o.wall === wall)) {
    if (
      dropX > op.offsetFromLeft - 0.04 &&
      dropX < op.offsetFromLeft + op.width + 0.04 &&
      dropMaxY > op.sillHeight &&
      dropMinY < op.sillHeight + op.height
    ) {
      dropX =
        endX < op.offsetFromLeft + op.width / 2
          ? Math.max(0.08, round3(op.offsetFromLeft - 0.12))
          : round3(op.offsetFromLeft + op.width + 0.12);
    }
  }
  return [
    { x: startX, y: startY },
    { x: startX, y: trackY },
    { x: dropX, y: trackY },
    { x: dropX, y: endY },
    { x: endX, y: endY },
  ];
}

interface Connection {
  parent: ElectricalNode;
  target: ElectricalNode;
  circuit: ElectricalCircuit;
  spec: ReturnType<typeof getCableAndConduitSpec>;
  startIdx: number;
  endIdx: number;
  /** Where the run starts on its wall; a ceiling parent starts at the hinge. */
  startX: number;
  startY: number;
  globalStartX: number;
  globalEndX: number;
  isMainFeeder: boolean;
  fedDevicesCount: number;
}

/**
 * Routes every cable as orthogonal runs on the walls and ceiling. Each run starts and
 * ends at the true centre of its elements; parallel conduits sit on real 4 cm tracks.
 */
export function computeRoutedSegments(
  room: RoomDimensions,
  nodes: ElectricalNode[],
  circuits: ElectricalCircuit[],
  openings: WallOpening[]
): RoutedSegment[] {
  const segments: RoutedSegment[] = [];
  const baseTrackY = round3(Math.max(0.35, room.height - 0.3));
  const minTrackY = openings.reduce(
    (m, o) => Math.max(m, o.sillHeight + o.height + 0.05),
    0.35
  );

  const centerWall = getPrimaryJunctionBoxWall(nodes);
  const wallOrder = getOrderedWallsAroundCenter(centerWall);
  const wallStart = {} as Record<WallId, number>;
  let accum = 0;
  for (const w of wallOrder) {
    wallStart[w] = accum;
    accum += getSurfaceSize(w, room).width;
  }

  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.category === 'distribution_board' || n.category === 'junction_box') continue;
    const p = resolveNodeParentBox(n, nodes, circuits);
    if (p) childCount.set(p.id, (childCount.get(p.id) || 0) + 1);
  }

  const add = (
    c: Connection,
    suffix: string,
    surface: SurfaceId,
    rawPoints: Point[],
    slack: number,
    description: string
  ) => {
    const points = deduplicatePoints(rawPoints);
    if (points.length < 2) return;
    const route = polylineLength(points);
    segments.push({
      id: `seg-${c.parent.id}-${c.target.id}${suffix}`,
      circuitId: c.circuit.id,
      fromNodeId: c.parent.id,
      toNodeId: c.target.id,
      surface,
      points,
      routeLengthMeters: round2(route),
      lengthMeters: round2(route + slack),
      conduitDiameterMm: c.spec.conduitDiameterMm,
      conductors: c.spec.conductors,
      cableSpec: c.spec.cableSpec,
      crossSectionMm2: c.spec.crossSectionMm2,
      description,
      isMainFeeder: c.isMainFeeder,
      fedDevicesCount: c.fedDevicesCount,
    });
  };

  const connections: Connection[] = [];
  for (const target of nodes) {
    if (target.category === 'distribution_board') continue;
    const parent = resolveNodeParentBox(target, nodes, circuits);
    if (!parent || parent.id === target.id) continue;
    const circuit = circuits.find((c) => c.id === target.circuitId) || circuits[0];
    if (!circuit) continue;

    const isMainFeeder = target.category === 'junction_box';
    const fedDevicesCount = isMainFeeder ? childCount.get(target.id) || 0 : 1;
    const baseSpec = getCableAndConduitSpec(target, circuit);
    const spec = isMainFeeder
      ? {
          ...baseSpec,
          conduitDiameterMm: (circuit.cableCrossSection >= 2.5 ? 25 : 20) as 20 | 25,
          description: `Glavni vod kruga ${circuit.code} (${parent.label} → ${target.label}) za ${fedDevicesCount} trošila`,
        }
      : baseSpec;

    const startOnCeiling = parent.surface === 'ceiling';
    const startWall: WallId = parent.surface === 'ceiling' ? centerWall : parent.surface;
    const endWall: WallId = target.surface === 'ceiling' ? centerWall : target.surface;
    const startX = startOnCeiling
      ? ceilingToView(parent, room, centerWall).x
      : parent.x;
    const startY = startOnCeiling ? room.height : parent.y;

    connections.push({
      parent,
      target,
      circuit,
      spec,
      startIdx: wallOrder.indexOf(startWall),
      endIdx: wallOrder.indexOf(endWall),
      startX,
      startY,
      globalStartX: wallStart[startWall] + startX,
      globalEndX: wallStart[endWall] + (target.surface === 'ceiling' ? 0 : target.x),
      isMainFeeder,
      fedDevicesCount,
    });
  }

  routeCeilingConnections(connections.filter((c) => c.target.surface === 'ceiling'));

  const wallConnections = connections.filter((c) => c.target.surface !== 'ceiling');
  for (const c of wallConnections) {
    if (c.parent.surface === 'ceiling') {
      add(
        c,
        '-ceil-start',
        'ceiling',
        [c.parent, wallPointOnCeilingEdge(centerWall, c.startX, room)],
        0.08,
        `${c.parent.label} → silazak na zid`
      );
    }
  }

  const isDirect = (c: Connection) =>
    c.startIdx === c.endIdx && Math.abs(c.target.x - c.startX) <= 0.06;
  routeDirectDrops(wallConnections.filter(isDirect));
  const trunks = wallConnections.filter((c) => !isDirect(c));
  routeTrunks(trunks.filter((c) => c.globalEndX < c.globalStartX), 'left');
  routeTrunks(trunks.filter((c) => c.globalEndX >= c.globalStartX), 'right');

  return segments;

  function routeCeilingConnections(ceilingConns: Connection[]) {
    const byParent = new Map<string, Connection[]>();
    for (const c of ceilingConns) {
      byParent.set(c.parent.id, [...(byParent.get(c.parent.id) || []), c]);
    }
    const { length: L, width: W } = room;

    for (const group of byParent.values()) {
      const parent = group[0].parent;
      const along = (p: Point) => {
        switch (parent.surface) {
          case 'north':
          case 'ceiling':
            return p.x;
          case 'south':
            return L - p.x;
          case 'west':
            return p.y;
          case 'east':
            return W - p.y;
        }
      };
      const depth = (p: Point) => {
        switch (parent.surface) {
          case 'north':
            return W - p.y;
          case 'south':
          case 'ceiling':
            return p.y;
          case 'west':
            return p.x;
          case 'east':
            return L - p.x;
        }
      };
      group.sort((a, b) => {
        const dirA = along(a.target) < parent.x - 0.04 ? -1 : 1;
        const dirB = along(b.target) < parent.x - 0.04 ? -1 : 1;
        if (dirA !== dirB) return dirA - dirB;
        return dirA === -1
          ? depth(a.target) - depth(b.target)
          : depth(b.target) - depth(a.target);
      });

      group.forEach((c, idx) => {
        const offset = (idx - (group.length - 1) / 2) * TRACK_SPACING;
        const riseX = round3(Math.max(0.08, parent.x + offset));
        const t: Point = c.target;

        if (parent.surface === 'ceiling') {
          add(
            c,
            '',
            'ceiling',
            [parent, { x: riseX, y: parent.y }, { x: riseX, y: t.y }, t],
            BOX_SLACK_METERS,
            `${parent.label} → ${c.target.label}`
          );
          return;
        }

        const wall = parent.surface;
        add(
          c,
          '-wall',
          wall,
          [parent, { x: riseX, y: parent.y }, { x: riseX, y: room.height }],
          0.15,
          `${parent.label} → Strop (${c.target.label})`
        );
        const entry = wallPointOnCeilingEdge(wall, riseX, room);
        const corner: Point =
          wall === 'north' || wall === 'south'
            ? { x: entry.x, y: t.y }
            : { x: t.x, y: entry.y };
        add(
          c,
          '-ceiling',
          'ceiling',
          [entry, corner, t],
          BOX_SLACK_METERS,
          `Stropna trasa → ${c.target.label} (${c.spec.description})`
        );
      });
    }
  }

  function routeDirectDrops(direct: Connection[]) {
    const byParent = new Map<string, Connection[]>();
    for (const c of direct) {
      byParent.set(c.parent.id, [...(byParent.get(c.parent.id) || []), c]);
    }
    for (const group of byParent.values()) {
      group.sort((a, b) => b.target.y - a.target.y);
      group.forEach((c, idx) => {
        const offset = (idx - (group.length - 1) / 2) * TRACK_SPACING;
        const dropX = round3(c.startX + offset);
        add(
          c,
          '',
          c.target.surface,
          [
            { x: c.startX, y: c.startY },
            { x: dropX, y: c.startY },
            { x: dropX, y: c.target.y },
            c.target,
          ],
          BOX_SLACK_METERS,
          c.spec.description
        );
      });
    }
  }

  function routeTrunks(conns: Connection[], direction: 'left' | 'right') {
    if (conns.length === 0) return;
    const distance = (c: Connection) => Math.abs(c.globalEndX - c.globalStartX);
    conns.sort((a, b) => {
      const endDiff =
        direction === 'right'
          ? a.globalEndX - b.globalEndX
          : b.globalEndX - a.globalEndX;
      if (Math.abs(endDiff) > 0.02) return endDiff;
      if (Math.abs(distance(a) - distance(b)) > 0.02) return distance(a) - distance(b);
      return b.target.y - a.target.y;
    });

    const byParent = new Map<string, Connection[]>();
    const byDropX = new Map<string, Connection[]>();
    const dropKey = (c: Connection) =>
      `${c.target.surface}:${Math.round(c.target.x * 20)}`;
    for (const c of conns) {
      byParent.set(c.parent.id, [...(byParent.get(c.parent.id) || []), c]);
      byDropX.set(dropKey(c), [...(byDropX.get(dropKey(c)) || []), c]);
    }

    const step = direction === 'right' ? 1 : -1;
    conns.forEach((c, rank) => {
      const trackY = round3(
        Math.min(
          room.height - 0.06,
          Math.max(minTrackY, baseTrackY + (rank - (conns.length - 1) / 2) * TRACK_SPACING)
        )
      );

      const siblings = byParent.get(c.parent.id) || [c];
      const rising = c.startY <= trackY;
      const riserSign = direction === 'right' ? (rising ? -1 : 1) : rising ? 1 : -1;
      const riserOffset =
        siblings.length > 1
          ? (siblings.indexOf(c) - (siblings.length - 1) / 2) *
            (TRACK_SPACING * 0.85) *
            riserSign
          : 0;
      const riserX = round3(Math.max(0.08, c.startX + riserOffset));

      const dropSiblings = byDropX.get(dropKey(c)) || [c];
      const dropOffset =
        dropSiblings.length > 1
          ? (dropSiblings.indexOf(c) - (dropSiblings.length - 1) / 2) *
            TRACK_SPACING *
            step
          : 0;
      const dropX = round3(c.target.x + dropOffset);
      const start: Point = { x: c.startX, y: c.startY };
      const end: Point = c.target;

      if (c.startIdx === c.endIdx) {
        const wall = wallOrder[c.startIdx];
        add(
          c,
          '',
          wall,
          [
            start,
            ...wallDropPath(wall, riserX, c.startY, dropX, end.y, trackY, openings),
            end,
          ],
          BOX_SLACK_METERS,
          c.spec.description
        );
        return;
      }

      let idx = c.startIdx;
      let hop = 1;
      while (true) {
        const wall = wallOrder[idx];
        const wallWidth = getSurfaceSize(wall, room).width;
        const entryX = direction === 'right' ? 0 : wallWidth;
        const exitX = direction === 'right' ? wallWidth : 0;

        if (idx === c.startIdx) {
          add(
            c,
            `-w${hop}`,
            wall,
            [start, { x: riserX, y: c.startY }, { x: riserX, y: trackY }, { x: exitX, y: trackY }],
            0.08,
            `${c.parent.label} → prijelaz u ${WALL_META[wallOrder[idx + step]].name}`
          );
        } else if (idx !== c.endIdx) {
          add(
            c,
            `-w${hop}`,
            wall,
            [{ x: entryX, y: trackY }, { x: exitX, y: trackY }],
            0,
            `Prolaz kroz ${WALL_META[wall].name} → ${c.target.label}`
          );
        } else {
          add(
            c,
            `-w${hop}`,
            wall,
            [...wallDropPath(wall, entryX, trackY, dropX, end.y, trackY, openings), end],
            BOX_SLACK_METERS,
            c.spec.description
          );
          break;
        }
        idx += step;
        hop++;
      }
    });
  }
}
