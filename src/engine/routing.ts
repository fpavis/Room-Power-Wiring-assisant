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
  ELEMENT_FOOTPRINT,
  getSurfaceSize,
  Point,
  wallPointOnCeilingEdge,
} from './geometry';

/** Distance between neighbouring horizontal conduits. */
const TRACK_STEP = 0.03;
/** Distance between conduits leaving the same box. */
const PORT_STEP = 0.03;
const BOX_SLACK_METERS = 0.25;
/** Extra room before a box so a cable can line up with its side entry. */
const ENTRY_RUN = 0.1;
const EPS = 1e-6;

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

interface Connection {
  parent: ElectricalNode;
  target: ElectricalNode;
  circuit: ElectricalCircuit;
  spec: ReturnType<typeof getCableAndConduitSpec>;
  isMainFeeder: boolean;
  fedDevicesCount: number;
  startWall: WallId;
  endWall: WallId;
  /** Where the run starts on its wall; a ceiling parent starts at the hinge. */
  startX: number;
  startY: number;
}

interface Run {
  c: Connection;
  /** +1 towards the right of the strip, -1 towards the left. */
  dir: 1 | -1;
  startStripX: number;
  /** Target position along the strip; may lie past its ends when wrapping a corner. */
  endStripX: number;
  distance: number;
  trackY: number;
  portX: number;
}

interface WallSegment {
  wall: number;
  a: Point;
  b: Point;
  parentId: string;
  targetId: string;
}

/**
 * Routes every cable as orthogonal runs on the walls and ceiling.
 *
 * Runs stay in the upper installation zone (15 to 45 cm below the ceiling) and take the
 * shorter way around the room. At a box, cables heading left leave on its left, cables
 * heading right on its right, and cables to the ceiling through the middle. A cable that
 * passes straight through a box stays on one line.
 */
export function computeRoutedSegments(
  room: RoomDimensions,
  nodes: ElectricalNode[],
  circuits: ElectricalCircuit[],
  openings: WallOpening[]
): RoutedSegment[] {
  const segments: RoutedSegment[] = [];
  const H = room.height;
  const centerWall = getPrimaryJunctionBoxWall(nodes);
  const wallOrder = getOrderedWallsAroundCenter(centerWall);
  const wallStart = {} as Record<WallId, number>;
  const widths = {} as Record<WallId, number>;
  let perimeter = 0;
  for (const wall of wallOrder) {
    wallStart[wall] = perimeter;
    widths[wall] = getSurfaceSize(wall, room).width;
    perimeter += widths[wall];
  }

  const halfSize = (n: ElectricalNode) =>
    n.surface === 'ceiling'
      ? { w: 0, h: 0 }
      : {
          w: ELEMENT_FOOTPRINT[n.category].width / 2,
          h: ELEMENT_FOOTPRINT[n.category].height / 2,
        };

  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.category === 'distribution_board' || n.category === 'junction_box') continue;
    const p = resolveNodeParentBox(n, nodes, circuits);
    if (p) childCount.set(p.id, (childCount.get(p.id) || 0) + 1);
  }

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

    const onCeiling = parent.surface === 'ceiling';
    connections.push({
      parent,
      target,
      circuit,
      spec,
      isMainFeeder,
      fedDevicesCount,
      startWall: parent.surface === 'ceiling' ? centerWall : parent.surface,
      endWall: target.surface === 'ceiling' ? centerWall : target.surface,
      startX: onCeiling ? ceilingToView(parent, room, centerWall).x : parent.x,
      startY: onCeiling ? H : parent.y,
    });
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

  // --- Strip helpers: walls form a closed loop of length `perimeter`.
  const wallIndexAt = (stripX: number) => {
    const x = ((stripX % perimeter) + perimeter) % perimeter;
    for (let i = wallOrder.length - 1; i >= 0; i--) {
      if (x >= wallStart[wallOrder[i]] - EPS) return i;
    }
    return 0;
  };

  /** Cuts a polyline in strip coordinates into per-wall pieces with local x. */
  function toWallPieces(poly: Point[]): { wall: number; points: Point[] }[] {
    const expanded: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      expanded.push(poly[i]);
      if (i === poly.length - 1) break;
      const a = poly[i];
      const b = poly[i + 1];
      if (Math.abs(a.y - b.y) > EPS) continue;
      const low = Math.min(a.x, b.x);
      const high = Math.max(a.x, b.x);
      const cuts: number[] = [];
      for (let k = Math.floor(low / perimeter) - 1; k <= Math.ceil(high / perimeter) + 1; k++) {
        for (const wall of wallOrder) {
          const cut = wallStart[wall] + k * perimeter;
          if (cut > low + EPS && cut < high - EPS) cuts.push(cut);
        }
      }
      cuts.sort((m, n) => (a.x <= b.x ? m - n : n - m));
      for (const x of cuts) expanded.push({ x, y: a.y });
    }

    const pieces: { wall: number; points: Point[] }[] = [];
    for (let i = 1; i < expanded.length; i++) {
      const a = expanded[i - 1];
      const b = expanded[i];
      const wall = wallIndexAt((a.x + b.x) / 2);
      const local = (p: Point): Point => {
        const name = wallOrder[wall];
        let x = (((p.x - wallStart[name]) % perimeter) + perimeter) % perimeter;
        if (x > widths[name] + EPS) x -= perimeter;
        return { x, y: p.y };
      };
      const last = pieces[pieces.length - 1];
      if (last && last.wall === wall) {
        last.points.push(local(b));
      } else {
        pieces.push({ wall, points: [local(a), local(b)] });
      }
    }
    return pieces;
  }

  const placed: WallSegment[] = [];
  const remember = (pieces: { wall: number; points: Point[] }[], c: Connection) => {
    for (const piece of pieces) {
      for (let i = 1; i < piece.points.length; i++) {
        placed.push({
          wall: piece.wall,
          a: piece.points[i - 1],
          b: piece.points[i],
          parentId: c.parent.id,
          targetId: c.target.id,
        });
      }
    }
  };

  const insideBody = (p: Point, wall: number, node: ElectricalNode) => {
    if (node.surface !== wallOrder[wall]) return false;
    const size = halfSize(node);
    return (
      Math.abs(p.x - node.x) <= size.w + 0.03 && Math.abs(p.y - node.y) <= size.h + 0.03
    );
  };

  /** Number of crossings and parallel overlaps of a candidate against placed cables. */
  function conflicts(candidate: WallSegment[], c: Connection) {
    let crossings = 0;
    let overlaps = 0;
    // Ports at a shared box are assigned afterwards, so the area right at it doesn't count.
    const parentHalf = halfSize(c.parent).w + 0.2;
    const inPortArea = (wall: number, o: WallSegment, lowX: number, highX: number) =>
      o.parentId === c.parent.id &&
      c.parent.surface === wallOrder[wall] &&
      lowX >= c.parent.x - parentHalf &&
      highX <= c.parent.x + parentHalf;
    const nodeById = (id: string) => nodes.find((n) => n.id === id)!;
    for (const s of candidate) {
      const sHorizontal = Math.abs(s.a.y - s.b.y) < EPS;
      for (const o of placed) {
        if (o.wall !== s.wall) continue;
        const oHorizontal = Math.abs(o.a.y - o.b.y) < EPS;
        if (sHorizontal === oHorizontal) {
          const fixedDistance = sHorizontal
            ? Math.abs(s.a.y - o.a.y)
            : Math.abs(s.a.x - o.a.x);
          if (fixedDistance >= TRACK_STEP - 0.002) continue;
          const key = sHorizontal ? 'x' : 'y';
          const overlap =
            Math.min(Math.max(s.a[key], s.b[key]), Math.max(o.a[key], o.b[key])) -
            Math.max(Math.min(s.a[key], s.b[key]), Math.min(o.a[key], o.b[key]));
          if (overlap > 0.02) {
            const low = sHorizontal
              ? Math.max(Math.min(s.a.x, s.b.x), Math.min(o.a.x, o.b.x))
              : s.a.x;
            const high = sHorizontal
              ? Math.min(Math.max(s.a.x, s.b.x), Math.max(o.a.x, o.b.x))
              : s.a.x;
            if (!inPortArea(s.wall, o, low, high)) overlaps++;
          }
          continue;
        }
        const h = sHorizontal ? s : o;
        const v = sHorizontal ? o : s;
        const px = v.a.x;
        const py = h.a.y;
        const within =
          px > Math.min(h.a.x, h.b.x) + EPS &&
          px < Math.max(h.a.x, h.b.x) - EPS &&
          py > Math.min(v.a.y, v.b.y) + EPS &&
          py < Math.max(v.a.y, v.b.y) - EPS;
        if (!within) continue;
        const point = { x: px, y: py };
        const atOwnBox = [c.parent.id, c.target.id, o.parentId, o.targetId].some((id) =>
          insideBody(point, s.wall, nodeById(id))
        );
        if (!atOwnBox && !inPortArea(s.wall, o, px, px)) crossings++;
      }
    }
    return { crossings, overlaps };
  }

  /** Openings a cable would go through, and other elements it would run across. */
  function obstaclesHit(pieces: WallSegment[], c: Connection) {
    let openingsHit = 0;
    let elementsHit = 0;
    for (const s of pieces) {
      const wall = wallOrder[s.wall];
      const minX = Math.min(s.a.x, s.b.x);
      const maxX = Math.max(s.a.x, s.b.x);
      const minY = Math.min(s.a.y, s.b.y);
      const maxY = Math.max(s.a.y, s.b.y);
      for (const op of openings.filter((o) => o.wall === wall)) {
        if (
          maxX > op.offsetFromLeft - 0.02 &&
          minX < op.offsetFromLeft + op.width + 0.02 &&
          maxY > op.sillHeight - 0.02 &&
          minY < op.sillHeight + op.height + 0.02
        ) {
          openingsHit++;
        }
      }
      for (const n of nodes) {
        if (n.surface !== wall || n.id === c.parent.id || n.id === c.target.id) continue;
        const size = halfSize(n);
        if (
          maxX > n.x - size.w - 0.015 &&
          minX < n.x + size.w + 0.015 &&
          maxY > n.y - size.h - 0.015 &&
          minY < n.y + size.h + 0.015
        ) {
          elementsHit++;
        }
      }
    }
    return { openingsHit, elementsHit };
  }

  // --- Ceiling cables leave through the middle of the box.
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
        const offset = (idx - (group.length - 1) / 2) * PORT_STEP;
        let riseX = round3(Math.max(0.03, parent.x + offset));
        const t: Point = c.target;
        if (parent.surface !== 'ceiling') {
          // A riser under an opening goes up beside it.
          const wallId = parent.surface;
          const blocking = columnOpening(wallId, riseX, parent.y, H);
          if (blocking) {
            const sides = [
              round3(blocking.offsetFromLeft - 0.1 + offset),
              round3(blocking.offsetFromLeft + blocking.width + 0.1 + offset),
            ]
              .filter((x) => x >= 0.03 && x <= widths[wallId] - 0.03)
              .sort((a, b) => Math.abs(a - riseX) - Math.abs(b - riseX));
            riseX = sides.find((x) => !columnOpening(wallId, x, parent.y, H)) ?? riseX;
          }
        }

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
        const risePoints = [parent, { x: riseX, y: parent.y }, { x: riseX, y: H }];
        add(c, '-wall', wall, risePoints, 0.15, `${parent.label} → Strop (${c.target.label})`);
        remember([{ wall: wallOrder.indexOf(wall), points: risePoints }], c);
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
        const offset = (idx - (group.length - 1) / 2) * PORT_STEP;
        const dropX = round3(c.startX + offset);
        const points = [
          { x: c.startX, y: c.startY },
          { x: dropX, y: c.startY },
          { x: dropX, y: c.target.y },
          c.target,
        ];
        add(c, '', c.endWall, points, BOX_SLACK_METERS, c.spec.description);
        remember([{ wall: wallOrder.indexOf(c.endWall), points }], c);
      });
    }
  }

  const columnOpening = (wall: WallId, x: number, y0: number, y1: number) => {
    const low = Math.min(y0, y1);
    const high = Math.max(y0, y1);
    return openings.find(
      (op) =>
        op.wall === wall &&
        x > op.offsetFromLeft - 0.03 &&
        x < op.offsetFromLeft + op.width + 0.03 &&
        high > op.sillHeight - 0.02 &&
        low < op.sillHeight + op.height + 0.02
    );
  };

  const rowBlocked = (wall: WallId, y: number, x0: number, x1: number) =>
    openings.some(
      (op) =>
        op.wall === wall &&
        y > op.sillHeight - 0.02 &&
        y < op.sillHeight + op.height + 0.02 &&
        Math.max(x0, x1) > op.offsetFromLeft - 0.02 &&
        Math.min(x0, x1) < op.offsetFromLeft + op.width + 0.02
    );

  // --- Horizontal runs in the installation zone.
  const zoneTop = H - 0.15;
  const zoneBottom = H - 0.45;
  const candidateYs = (run: Run): number[] => {
    const ys = new Set<number>();
    const start = Math.max(0.35, H - 0.6);
    for (let k = 0; ; k++) {
      const y = round3(H - 0.3 + (k - Math.ceil((H - 0.3 - start) / TRACK_STEP)) * TRACK_STEP);
      if (y > H - 0.05) break;
      ys.add(y);
    }
    // The lower installation zone is the fallback when openings close off the upper one.
    for (const y of [0.18, 0.24, 0.3, 0.36, 0.42]) ys.add(y);
    if (run.c.target.category === 'junction_box') ys.add(round3(run.c.target.y));
    if (run.c.parent.surface !== 'ceiling') ys.add(round3(run.c.parent.y));
    return [...ys].sort((a, b) => a - b);
  };

  /** Boxes in the zone that a run has to pass above on its way. */
  const boxesPassed = (run: Run) =>
    nodes.filter((n) => {
      if (
        n.id === run.c.parent.id ||
        n.id === run.c.target.id ||
        n.surface === 'ceiling' ||
        (n.category !== 'junction_box' && n.category !== 'distribution_board') ||
        Math.abs(n.y - (H - 0.3)) > 0.3
      ) {
        return false;
      }
      const low = Math.min(run.startStripX, run.endStripX);
      const high = Math.max(run.startStripX, run.endStripX);
      return [-1, 0, 1].some((k) => {
        const x = wallStart[n.surface as WallId] + n.x + k * perimeter;
        return x > low && x < high;
      });
    });

  let allRuns: Run[] = [];
  const preferredY = (run: Run) => {
    const passed = boxesPassed(run);
    if (passed.length > 0) {
      // Above the boxes, leaving room underneath for nearer runs passing the same way.
      const clearance = Math.max(
        ...passed.map((n) => n.y + halfSize(n).h + 0.015)
      );
      const nearer = allRuns.filter(
        (r) => r !== run && r.dir === run.dir && r.distance < run.distance && boxesPassed(r).length > 0
      ).length;
      const gridBase = H - 0.3 + Math.ceil((clearance - (H - 0.3)) / TRACK_STEP - EPS) * TRACK_STEP;
      return gridBase + nearer * TRACK_STEP;
    }
    if (run.c.target.category === 'junction_box') return run.c.target.y;
    if (run.c.parent.category === 'junction_box') return run.c.parent.y;
    return H - 0.3;
  };

  /** Picks the nearest column from which the target is reachable without crossing an opening. */
  function dropLocalX(run: Run, trackY: number, dropOffset: number): number {
    const target = run.c.target;
    const wall = run.c.endWall;
    const width = widths[wall];
    const preferred = round3(target.x + dropOffset);
    const candidates = [
      preferred,
      ...openings
        .filter((op) => op.wall === wall)
        .flatMap((op) => [
          round3(op.offsetFromLeft - 0.12),
          round3(op.offsetFromLeft + op.width + 0.12),
        ]),
    ]
      .filter((x) => x >= 0.03 && x <= width - 0.03)
      .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
    return (
      candidates.find(
        (x) =>
          !columnOpening(wall, x, trackY, target.y) && !rowBlocked(wall, target.y, x, target.x)
      ) ?? preferred
    );
  }

  function buildPolyline(run: Run, trackY: number, portX: number, dropOffset: number): Point[] {
    const { c, dir, startStripX, endStripX } = run;
    const size = halfSize(c.parent);
    const points: Point[] = [{ x: startStripX, y: c.startY }];
    if (c.parent.surface === 'ceiling') {
      points.push({ x: startStripX, y: trackY });
    } else if (Math.abs(trackY - c.startY) <= size.h + EPS) {
      points.push({ x: startStripX, y: trackY });
    } else {
      // A riser that would run through an opening goes up beside it instead.
      let riser = c.startX + portX;
      const blocking = columnOpening(c.startWall, riser, c.startY, trackY);
      if (blocking) {
        const sides = [blocking.offsetFromLeft - 0.1, blocking.offsetFromLeft + blocking.width + 0.1]
          .filter((x) => x >= 0.03 && x <= widths[c.startWall] - 0.03)
          .sort((a, b) => Math.abs(a - riser) - Math.abs(b - riser));
        riser = sides.find((x) => !columnOpening(c.startWall, x, c.startY, trackY)) ?? riser;
      }
      const riserStrip = startStripX + (riser - c.startX);
      points.push({ x: riserStrip, y: c.startY }, { x: riserStrip, y: trackY });
    }

    const target = c.target;
    const targetSize = halfSize(target);
    if (target.category === 'junction_box' || target.category === 'distribution_board') {
      if (Math.abs(trackY - target.y) > EPS) {
        // Enter from the side, or straight from above when an opening stands beside the box.
        const offset = targetSize.w + ENTRY_RUN;
        const entries = [-dir * offset, 0, dir * offset];
        const entry =
          entries.find(
            (e) =>
              target.x + e >= 0.03 &&
              target.x + e <= widths[c.endWall] - 0.03 &&
              !columnOpening(c.endWall, target.x + e, trackY, target.y)
          ) ?? entries[0];
        points.push({ x: endStripX + entry, y: trackY }, { x: endStripX + entry, y: target.y });
      }
      points.push({ x: endStripX, y: target.y });
    } else {
      const dropLocal = dropLocalX(run, trackY, dropOffset);
      const dropStrip = endStripX + (dropLocal - target.x);
      points.push(
        { x: dropStrip, y: trackY },
        { x: dropStrip, y: target.y },
        { x: endStripX, y: target.y }
      );
    }
    return points;
  }

  const asWallSegments = (poly: Point[], c: Connection): WallSegment[] =>
    toWallPieces(deduplicatePoints(poly)).flatMap((piece) =>
      piece.points.slice(1).map((b, i) => ({
        wall: piece.wall,
        a: piece.points[i],
        b,
        parentId: c.parent.id,
        targetId: c.target.id,
      }))
    );

  function routeWallRuns(wallConns: Connection[]) {
    const runs: Run[] = wallConns.map((c) => {
      const startStripX = wallStart[c.startWall] + c.startX;
      const targetStripX = wallStart[c.endWall] + c.target.x;
      if (c.startWall === c.endWall) {
        const dir = targetStripX >= startStripX ? 1 : -1;
        return {
          c,
          dir,
          startStripX,
          endStripX: targetStripX,
          distance: Math.abs(targetStripX - startStripX),
          trackY: 0,
          portX: 0,
        };
      }
      const right = (((targetStripX - startStripX) % perimeter) + perimeter) % perimeter;
      const left = perimeter - right;
      const dir: 1 | -1 = right <= left ? 1 : -1;
      return {
        c,
        dir,
        startStripX,
        endStripX: startStripX + dir * Math.min(right, left),
        distance: Math.min(right, left),
        trackY: 0,
        portX: 0,
      };
    });

    allRuns = runs;
    // Farther runs claim their track first, so nearer ones nest underneath and drop freely.
    runs.sort(
      (a, b) =>
        Number(b.c.isMainFeeder) - Number(a.c.isMainFeeder) || b.distance - a.distance
    );

    const dropGroups = new Map<string, Run[]>();
    const dropKey = (r: Run) => `${r.c.target.surface}:${Math.round(r.c.target.x * 20)}`;
    for (const r of runs) dropGroups.set(dropKey(r), [...(dropGroups.get(dropKey(r)) || []), r]);
    const dropOffsetOf = (r: Run) => {
      const group = dropGroups.get(dropKey(r)) || [r];
      return group.length > 1
        ? (group.indexOf(r) - (group.length - 1) / 2) * TRACK_STEP * r.dir
        : 0;
    };

    const ceilingCount = (parentId: string) =>
      connections.filter((c) => c.parent.id === parentId && c.target.surface === 'ceiling').length;
    const dropCount = (parentId: string) =>
      connections.filter(
        (c) =>
          c.parent.id === parentId &&
          c.target.surface !== 'ceiling' &&
          c.startWall === c.endWall &&
          Math.abs(c.target.x - c.startX) <= 0.06
      ).length;
    const portBase = (parentId: string) =>
      (Math.max(ceilingCount(parentId), dropCount(parentId)) * PORT_STEP) / 2 + PORT_STEP;

    for (const run of runs) {
      const port = run.dir * portBase(run.c.parent.id);
      let best: { y: number; score: number } | null = null;
      for (const y of candidateYs(run)) {
        const poly = buildPolyline(run, y, port, dropOffsetOf(run));
        const pieces = asWallSegments(poly, run.c);
        const { openingsHit, elementsHit } = obstaclesHit(pieces, run.c);
        const { crossings, overlaps } = conflicts(pieces, run.c);
        const outsideZone = y > zoneTop + EPS || y < zoneBottom - EPS;
        const score =
          openingsHit * 1e8 +
          elementsHit * 1e6 +
          crossings * 1e4 +
          overlaps * 5e3 +
          (outsideZone ? 40 : 0) +
          Math.abs(y - preferredY(run)) * 100 +
          y * 0.01;
        if (!best || score < best.score) best = { y, score };
      }
      run.trackY = best!.y;
      remember(
        toWallPieces(deduplicatePoints(buildPolyline(run, run.trackY, port, dropOffsetOf(run)))),
        run.c
      );
    }

    // Final ports: cables further from the box centre line leave closest to its middle.
    const byParentAndDir = new Map<string, Run[]>();
    for (const r of runs) {
      const key = `${r.c.parent.id}:${r.dir}`;
      byParentAndDir.set(key, [...(byParentAndDir.get(key) || []), r]);
    }
    for (const group of byParentAndDir.values()) {
      const parent = group[0].c.parent;
      const size = halfSize(parent);
      const base = portBase(parent.id);
      const above = group
        .filter((r) => r.trackY > r.c.startY + size.h + EPS)
        .sort((a, b) => b.trackY - a.trackY);
      const below = group
        .filter((r) => r.trackY < r.c.startY - size.h - EPS)
        .sort((a, b) => a.trackY - b.trackY);
      for (const list of [above, below]) {
        list.forEach((r, i) => {
          r.portX = r.dir * (base + i * PORT_STEP);
        });
      }
    }

    for (const run of runs) {
      const { c } = run;
      const poly = deduplicatePoints(
        buildPolyline(run, run.trackY, run.portX, dropOffsetOf(run))
      );
      const pieces = toWallPieces(poly);
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
      pieces.forEach((piece, i) => {
        const isOnly = pieces.length === 1;
        const isLast = i === pieces.length - 1;
        add(
          c,
          isOnly ? '' : `-w${i + 1}`,
          wallOrder[piece.wall],
          piece.points,
          isLast ? BOX_SLACK_METERS : i === 0 ? 0.08 : 0,
          isLast ? c.spec.description : `${c.parent.label} → ${c.target.label}`
        );
      });
    }
  }

  routeCeilingConnections(connections.filter((c) => c.target.surface === 'ceiling'));
  const wallConnections = connections.filter((c) => c.target.surface !== 'ceiling');
  const isDirect = (c: Connection) =>
    c.startWall === c.endWall &&
    Math.abs(c.target.x - c.startX) <= 0.06 &&
    !columnOpening(c.endWall, c.startX, c.startY, c.target.y);
  routeDirectDrops(wallConnections.filter(isDirect));
  routeWallRuns(wallConnections.filter((c) => !isDirect(c)));

  return segments;
}
