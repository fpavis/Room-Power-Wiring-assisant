import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { BoardRealistic } from '../components/BoardRealistic';
import { APPLIANCE_CATALOG_TEMPLATES } from '../data/presets';
import {
  ElectricalCircuit,
  ElementCategory,
  ProjectData,
  SurfaceId,
  WallId,
} from '../types/electrical';
import { layoutBoardRails } from './boardLayout';
import { analyzeProject, getSurfaceSize, isPointInsideOpening } from './electricalEngine';
import { addFurniture, FURNITURE_CATALOG } from './furniture';
import { isNodeOutsideSurface } from './geometry';
import {
  addApplianceFromTemplate,
  addNode,
  addOpening,
  assignAppliance,
  autoAdaptNetwork,
  createEmptyProject,
} from './projectOps';
import { computeRoutedSegments } from './routing';
import { validateOpening } from './validation';

const PROJECTS = Number(process.env.ELEKTRO_PROJECTS ?? 250);
const WALLS: WallId[] = ['north', 'east', 'south', 'west'];
const CATEGORIES: ElementCategory[] = [
  'socket_single',
  'socket_double',
  'socket_shuko_3p',
  'socket_fixed_1p',
  'switch_single',
  'switch_double',
  'switch_two_way',
  'switch_cross',
  'light_ceiling',
  'light_wall',
  'junction_box',
];

function randomSource(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    between: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T,>(items: T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}

function generateProject(seed: number): ProjectData {
  const r = randomSource(seed);
  let data: ProjectData = {
    ...createEmptyProject(),
    room: {
      length: Number(r.between(2, 8).toFixed(2)),
      width: Number(r.between(2, 8).toFixed(2)),
      height: Number(r.between(2.4, 3.2).toFixed(2)),
    },
  };

  const circuitCount = r.int(1, 9);
  const circuits: ElectricalCircuit[] = Array.from({ length: circuitCount }, (_, i) => ({
    id: `c${i}`,
    code: `SK-${i + 1}`,
    name: `Krug ${i + 1}`,
    breakerAmps: r.pick([10, 16, 16, 16, 20]) as ElectricalCircuit['breakerAmps'],
    breakerCurve: r.pick(['B', 'C']) as 'B' | 'C',
    phaseType: r.chance(0.2) ? '3P' : '1P',
    cableCrossSection: r.pick([1.5, 2.5, 2.5, 4]) as ElectricalCircuit['cableCrossSection'],
    color: '#0A5FC4',
    mainJunctionBoxId: '',
  }));
  data = { ...data, circuits };

  for (let i = r.int(0, 4); i > 0; i--) {
    const type = r.pick(['door', 'window'] as const);
    const wall = r.pick(WALLS);
    const opening = {
      wall,
      type,
      label: type === 'door' ? 'Vrata' : 'Prozor',
      offsetFromLeft: Number(r.between(0.2, 3).toFixed(2)),
      width: type === 'door' ? 0.9 : Number(r.between(0.6, 1.6).toFixed(2)),
      height: type === 'door' ? 2.05 : Number(r.between(0.6, 1.3).toFixed(2)),
      sillHeight: type === 'door' ? 0 : Number(r.between(0.5, 1).toFixed(2)),
    };
    const overlaps = data.openings.some(
      (o) =>
        o.wall === wall &&
        opening.offsetFromLeft < o.offsetFromLeft + o.width + 0.3 &&
        opening.offsetFromLeft + opening.width > o.offsetFromLeft - 0.3
    );
    if (!overlaps && Object.keys(validateOpening(opening, data.room)).length === 0) {
      data = addOpening(data, opening);
    }
  }

  const place = (category: ElementCategory, surface: SurfaceId, y?: number) => {
    const size = getSurfaceSize(surface, data.room);
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Number(r.between(0.15, size.width - 0.15).toFixed(2));
      const py = y ?? Number(r.between(0.2, size.height - 0.2).toFixed(2));
      if (!isPointInsideOpening(surface, x, py, data.openings, 0.15)) {
        const result = addNode(data, category, surface, { x, y: py }, r.pick(data.circuits).id);
        if (result) {
          data = result.data;
          return result.nodeId;
        }
      }
    }
    return null;
  };

  if (r.chance(0.92)) place('distribution_board', r.pick(WALLS), 1.65);
  if (r.chance(0.08)) place('distribution_board', r.pick(WALLS), 1.65);
  for (let i = r.int(0, 28); i > 0; i--) {
    const category = r.pick(CATEGORIES);
    const surface: SurfaceId =
      category === 'light_ceiling' || (category === 'junction_box' && r.chance(0.15))
        ? 'ceiling'
        : r.pick(WALLS);
    place(category, surface);
  }

  const sockets = () => data.nodes.filter((n) => n.category.startsWith('socket_'));
  for (let i = r.int(0, 14); i > 0; i--) {
    data = addApplianceFromTemplate(data, r.pick(APPLIANCE_CATALOG_TEMPLATES));
    const list = sockets();
    if (list.length > 0 && r.chance(0.7)) {
      data = assignAppliance(data, data.appliances[data.appliances.length - 1].id, r.pick(list).id);
    }
  }

  for (let i = r.int(0, 8); i > 0; i--) {
    data = addFurniture(data, r.pick(FURNITURE_CATALOG), r.pick(WALLS)) ?? data;
  }
  return data;
}

const projects = Array.from({ length: PROJECTS }, (_, seed) => ({
  seed: seed + 1,
  data: generateProject(seed + 1),
}));
const routeOf = (d: ProjectData) => computeRoutedSegments(d.room, d.nodes, d.circuits, d.openings);
const analysisOf = (d: ProjectData) => analyzeProject(d.nodes, d.appliances, d.circuits, routeOf(d));

describe('nasumični projekti: trase', () => {
  it('sve koordinate su valjane, a dionice pod pravim kutom i unutar plohe', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      for (const s of routeOf(data)) {
        const size = getSurfaceSize(s.surface, data.room);
        s.points.forEach((p, i) => {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad.push(`${seed} NaN ${s.id}`);
          if (p.x < -1e-3 || p.x > size.width + 1e-3 || p.y < -1e-3 || p.y > size.height + 1e-3) {
            bad.push(`${seed} izvan ${s.id} ${p.x},${p.y}`);
          }
          if (i > 0) {
            const a = s.points[i - 1];
            if (Math.abs(a.x - p.x) > 1e-6 && Math.abs(a.y - p.y) > 1e-6) bad.push(`${seed} kosa ${s.id}`);
          }
        });
        if (!(s.routeLengthMeters >= 0) || s.lengthMeters < s.routeLengthMeters) bad.push(`${seed} duljina ${s.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('svaka trasa završava točno u svom elementu', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const segs = routeOf(data);
      for (const toId of new Set(segs.map((s) => s.toNodeId))) {
        const node = data.nodes.find((n) => n.id === toId)!;
        const reaches = segs.some(
          (s) =>
            s.toNodeId === toId &&
            s.surface === node.surface &&
            s.points.some((p) => Math.abs(p.x - node.x) < 0.002 && Math.abs(p.y - node.y) < 0.002)
        );
        if (!reaches) bad.push(`${seed} ${node.label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nijedna trasa ne prolazi kroz otvor', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      for (const s of routeOf(data)) {
        if (s.surface === 'ceiling') continue;
        for (const op of data.openings.filter((o) => o.wall === s.surface)) {
          for (let i = 1; i < s.points.length; i++) {
            const a = s.points[i - 1];
            const b = s.points[i];
            if (
              Math.max(a.x, b.x) > op.offsetFromLeft + 1e-6 &&
              Math.min(a.x, b.x) < op.offsetFromLeft + op.width - 1e-6 &&
              Math.max(a.y, b.y) > op.sillHeight + 1e-6 &&
              Math.min(a.y, b.y) < op.sillHeight + op.height - 1e-6
            ) {
              bad.push(`${seed} ${s.id} ${JSON.stringify(s.points)} kroz ${op.label} ${op.offsetFromLeft}+${op.width} ${op.sillHeight}+${op.height}; H ${data.room.height}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('nasumični projekti: proračun', () => {
  it('troškovnik se poklapa s trasama, a snaga s trošilima', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const segs = routeOf(data);
      const { bom, circuitAnalyses } = analyzeProject(data.nodes, data.appliances, data.circuits, segs);
      const route = segs.reduce((sum, s) => sum + s.routeLengthMeters, 0);
      if (Math.abs(route - bom.totalRouteLengthMeters) > 0.02) bad.push(`${seed} duljina`);
      const counted = Object.values(bom.countsByCategory).reduce((a, b) => a + b, 0);
      if (counted !== data.nodes.length) bad.push(`${seed} elementi`);
      for (const ca of circuitAnalyses) {
        const capacity = ca.circuit.breakerAmps * 230 * (ca.circuit.phaseType === '3P' ? 3 : 1);
        if (Math.abs(ca.maxCapacityWatts - capacity) > 1e-6) bad.push(`${seed} kapacitet`);
      }
      const assignedPower = circuitAnalyses.reduce(
        (sum, ca) => sum + ca.assignedAppliances.reduce((n, a) => n + a.powerWatts, 0),
        0
      );
      const allPower = data.appliances.reduce((sum, a) => sum + a.powerWatts, 0);
      if (assignedPower !== allPower) bad.push(`${seed} snaga ${assignedPower} ${allPower}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('nasumični projekti: razvodni ormar', () => {
  it('ormar prikazuje točno vodove s nacrta i svaki krug jednom', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const segs = routeOf(data);
      const { board } = analyzeProject(data.nodes, data.appliances, data.circuits, segs);
      const boardIds = new Set(
        data.nodes.filter((n) => n.category === 'distribution_board').map((n) => n.id)
      );
      const fromDrawing = new Set(segs.filter((s) => boardIds.has(s.fromNodeId)).map((s) => s.toNodeId));
      const items = board.groups.flatMap((g) => g.circuits);
      const shown = items.flatMap((c) => c.cables.map((cable) => cable.nodeId));
      if (shown.length !== fromDrawing.size || shown.some((id) => !fromDrawing.has(id))) {
        bad.push(`${seed} vodovi ${shown.length}/${fromDrawing.size}`);
      }
      if (items.length !== data.circuits.length) bad.push(`${seed} krugovi`);
      if (board.supplyPhases === 1 && items.some((c) => c.phases.length !== 1)) bad.push(`${seed} faze`);
    }
    expect(bad).toEqual([]);
  });

  it('sve stane u ormar navedene veličine, bez preklapanja', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const { board } = analysisOf(data);
      const layout = layoutBoardRails(board);
      if (layout.rows.length * layout.perRow > board.modules.enclosure) {
        bad.push(`${seed} ${layout.rows.length}x${layout.perRow} > ${board.modules.enclosure}`);
      }
      for (const row of layout.rows) {
        let end = 0;
        for (const item of row) {
          if (item.start < end) bad.push(`${seed} preklapanje`);
          end = item.start + item.modules;
        }
        if (end > layout.perRow) bad.push(`${seed} red ${end}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('u prikazu ormara svaki vod je spojen i pod pravim kutom', () => {
    const bad: string[] = [];
    const num = (tag: string, name: string) => Number(tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);
    for (const { seed, data } of projects) {
      const html = renderToStaticMarkup(<BoardRealistic plan={analysisOf(data).board} />);
      const wires = [...html.matchAll(/data-wire=""[^>]*>\s*<path[^>]*\bd="([^"]+)"/g)].map((m) =>
        m[1]
          .split(/(?=[ML])/)
          .map((part) => part.slice(1).trim().split(' ').map(Number) as [number, number])
      );
      const screws = [...html.matchAll(/<circle[^>]*data-screw=""[^>]*>/g)].map((m) => [num(m[0], 'cx'), num(m[0], 'cy')]);
      const rects = [...html.matchAll(/<rect[^>]*data-bar=""[^>]*>/g)].map((m) => [
        num(m[0], 'x'),
        num(m[0], 'y'),
        num(m[0], 'width'),
        num(m[0], 'height'),
      ]);
      const cableEnds = [...html.matchAll(/data-cable-end="([^"]+)"/g)].map((m) => m[1].split(',').map(Number));
      const within = (p: number[], a: number[], b: number[]) =>
        p[0] >= Math.min(a[0], b[0]) - 0.6 &&
        p[0] <= Math.max(a[0], b[0]) + 0.6 &&
        p[1] >= Math.min(a[1], b[1]) - 0.6 &&
        p[1] <= Math.max(a[1], b[1]) + 0.6;
      wires.forEach((wire, index) => {
        if (wire.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) bad.push(`${seed} NaN`);
        wire.slice(1).forEach((p, i) => {
          if (Math.abs(p[0] - wire[i][0]) > 0.01 && Math.abs(p[1] - wire[i][1]) > 0.01) bad.push(`${seed} kosi ${index}`);
        });
        for (const end of [wire[0], wire[wire.length - 1]]) {
          const touches =
            screws.some((s) => Math.hypot(s[0] - end[0], s[1] - end[1]) <= 1) ||
            rects.some((b) => end[0] >= b[0] - 1 && end[0] <= b[0] + b[2] + 1 && end[1] >= b[1] - 1 && end[1] <= b[1] + b[3] + 1) ||
            cableEnds.some((c) => Math.hypot(c[0] - end[0], c[1] - end[1]) <= 8) ||
            wires.some((other, o) => o !== index && other.slice(1).some((p, i) => within(end, other[i], p)));
          if (!touches) bad.push(`${seed} slobodan kraj ${end.join(',')}`);
        }
      });
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });
});

describe('nasumični projekti: automatska prilagodba', () => {
  it('ne mijenja ulaz i ne stvara neispravne veze', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const snapshot = structuredClone(data);
      const result = autoAdaptNetwork(data);
      expect(data).toEqual(snapshot);
      const after = result.data;
      const circuitIds = new Set(after.circuits.map((c) => c.id));
      const nodeIds = new Set(after.nodes.map((n) => n.id));
      for (const n of after.nodes) {
        if (!circuitIds.has(n.circuitId)) bad.push(`${seed} krug ${n.label}`);
        if (n.parentBoxId && !nodeIds.has(n.parentBoxId)) bad.push(`${seed} roditelj ${n.label}`);
        if (isNodeOutsideSurface(n, after.room)) bad.push(`${seed} izvan ${n.label}`);
      }
      for (const a of after.appliances) {
        if (a.assignedNodeId && !nodeIds.has(a.assignedNodeId)) bad.push(`${seed} trošilo ${a.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nakon primjene vrijede pravila: Šuko do 16 A, trofazno na trofaznom, krug i kutija se slažu', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const after = autoAdaptNetwork(data).data;
      const circuitOf = (id: string) => after.circuits.find((c) => c.id === id)!;
      for (const n of after.nodes) {
        const circuit = circuitOf(n.circuitId);
        if ((n.category === 'socket_single' || n.category === 'socket_double') && circuit.breakerAmps > 16) {
          bad.push(`${seed} Šuko ${circuit.breakerAmps} A`);
        }
        const parent = after.nodes.find((p) => p.id === n.parentBoxId);
        if (parent?.category === 'junction_box' && parent.circuitId !== n.circuitId) {
          bad.push(`${seed} kutija drugog kruga ${n.label}`);
        }
        if (n.category === 'socket_shuko_3p' && circuit.phaseType !== '3P') bad.push(`${seed} 3P na 1P`);
        if (
          circuit.phaseType === '3P' &&
          n.category !== 'socket_shuko_3p' &&
          n.category !== 'junction_box' &&
          n.category !== 'distribution_board'
        ) {
          bad.push(`${seed} 1P na 3P ${n.category}`);
        }
      }
      for (const a of after.appliances.filter((item) => item.threePhase && item.assignedNodeId)) {
        const socket = after.nodes.find((n) => n.id === a.assignedNodeId)!;
        if (socket.category !== 'socket_shuko_3p') bad.push(`${seed} trofazno na ${socket.category}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('riješi preopterećenje i manjak utičnica, ili jasno kaže da ne može', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const result = autoAdaptNetwork(data);
      const { circuitAnalyses, socketBalance } = analysisOf(result.data);
      if (result.unresolved.length > 0) continue;
      if (circuitAnalyses.some((c) => c.status === 'overload')) bad.push(`${seed} preopterećenje`);
      if (socketBalance.missingOutlets1P > 0) bad.push(`${seed} manjak`);
    }
    expect(bad).toEqual([]);
  });

  it('drugi prolaz nema više što mijenjati', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const once = autoAdaptNetwork(data);
      const twice = autoAdaptNetwork(once.data);
      if (twice.changes.length > 0) bad.push(`${seed}: ${twice.changes[0]} || PRVI: ${once.changes.join(' ; ')} || NERIJESENO: ${once.unresolved.join(' ; ')}`);
    }
    expect(bad.slice(0, 15)).toEqual([]);
  });

  it('nove utičnice nisu preko otvora ni iza namještaja', () => {
    const bad: string[] = [];
    for (const { seed, data } of projects) {
      const before = new Set(data.nodes.map((n) => n.id));
      const after = autoAdaptNetwork(data).data;
      for (const n of after.nodes.filter((item) => !before.has(item.id) && item.category.startsWith('socket_'))) {
        if (isPointInsideOpening(n.surface, n.x, n.y, after.openings, 0)) bad.push(`${seed} otvor`);
        if (
          after.furniture.some(
            (f) =>
              f.wall === n.surface &&
              n.x > f.offsetFromLeft &&
              n.x < f.offsetFromLeft + f.width &&
              n.y > f.bottom &&
              n.y < f.bottom + f.height
          )
        ) {
          bad.push(`${seed} namještaj`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
