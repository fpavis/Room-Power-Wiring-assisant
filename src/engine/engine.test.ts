import { describe, expect, it } from 'vitest';
import {
  APPLIANCE_CATALOG_TEMPLATES,
  INITIAL_CIRCUITS,
  INITIAL_NODES,
  INITIAL_OPENINGS,
  INITIAL_ROOM,
} from '../data/presets';
import { ElectricalNode, FurnitureItem, ProjectData, WallId } from '../types/electrical';
import { analyzeProject, cablePurchaseMeters, getCableAndConduitSpec } from './electricalEngine';
import {
  addFurniture,
  computeFurnitureDrag,
  FURNITURE_CATALOG,
  FURNITURE_ROOMS,
  furnitureConflict,
} from './furniture';
import { computeOpeningDrag } from './openingDrag';
import { checkInstallationRules, circuitVoltageDropPercent, directFeedGroups } from './rules';
import {
  ceilingToView,
  ELEMENT_FOOTPRINT,
  formatMeters,
  getCeilingViewSize,
  getSurfaceSize,
  isNodeOutsideSurface,
  parseDecimal,
  pickPrintScale,
  placeLabels,
  viewToCeiling,
  wallPointOnCeilingEdge,
} from './geometry';
import {
  addApplianceFromTemplate,
  addCircuit,
  addNode,
  addOpening,
  autoAdaptNetwork,
  canPlaceOn,
  createEmptyProject,
  createExampleProject,
  deleteCircuit,
  deleteNode,
  getOutsideNodes,
  moveNodeInside,
} from './projectOps';
import { computeRoutedSegments } from './routing';
import { validateOpening, validateRoomField } from './validation';

const WALLS: WallId[] = ['north', 'east', 'south', 'west'];
const room = { length: 2.9, width: 5.9, height: 2.6 };

const routeOf = (d: ProjectData) =>
  computeRoutedSegments(d.room, d.nodes, d.circuits, d.openings);

describe('geometrija stropa', () => {
  it.each(WALLS)('prikaz i povratak daju istu točku za zid %s', (center) => {
    const p = { x: 1.2, y: 4.3 };
    const back = viewToCeiling(ceilingToView(p, room, center), room, center);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it.each(WALLS)('točka u prostoriji ostaje unutar prikaza za zid %s', (center) => {
    const size = getCeilingViewSize(room, center);
    const v = ceilingToView({ x: 2.9, y: 5.9 }, room, center);
    expect(v.x).toBeGreaterThanOrEqual(-1e-9);
    expect(v.x).toBeLessThanOrEqual(size.width + 1e-9);
    expect(v.y).toBeGreaterThanOrEqual(-1e-9);
    expect(v.y).toBeLessThanOrEqual(size.height + 1e-9);
  });

  it.each(WALLS)('rub šarke leži na y = 0 za zid %s', (center) => {
    const edge = wallPointOnCeilingEdge(center, 1, room);
    expect(ceilingToView(edge, room, center).y).toBeCloseTo(0, 6);
    expect(ceilingToView(edge, room, center).x).toBeCloseTo(1, 6);
  });

  it('veličina stropa ne ovisi o zidu', () => {
    expect(getSurfaceSize('ceiling', room)).toEqual({ width: 2.9, height: 5.9 });
  });

  it('primjer ima svjetiljku u sredini stropa', () => {
    const light = INITIAL_NODES.find((n) => n.category === 'light_ceiling')!;
    expect(light.x).toBeCloseTo(INITIAL_ROOM.length / 2, 2);
    expect(light.y).toBeCloseTo(INITIAL_ROOM.width / 2, 2);
    expect(isNodeOutsideSurface(light, INITIAL_ROOM)).toBe(false);
  });
});

describe('oblikovanje i unos', () => {
  it('prikazuje mjere kako su upisane', () => {
    expect(formatMeters(2.5)).toBe('2,50');
    expect(formatMeters(0.9)).toBe('0,90');
    expect(formatMeters(2.055)).toBe('2,055');
  });

  it('prihvaća zarez i točku, odbija ostalo', () => {
    expect(parseDecimal('2,05')).toBe(2.05);
    expect(parseDecimal('2.05')).toBe(2.05);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
});

describe('mjerilo ispisa', () => {
  const A4 = [277, 150] as const;

  it('zid od 5,90 m stane u 1:25', () => {
    expect(pickPrintScale(5.9, 2.6, ...A4)).toBe(25);
  });
  it('zid od 6,90 m još stane u 1:25, 7 m ne', () => {
    expect(pickPrintScale(6.9, 2.6, ...A4)).toBe(25);
    expect(pickPrintScale(7, 2.6, ...A4)).toBe(50);
  });
  it('pregled primjera je 1:100', () => {
    expect(pickPrintScale(17.6, 5.5, ...A4)).toBe(100);
  });
});

describe('trase', () => {
  const example = createExampleProject();

  it('svaka trasa počinje i završava točno u elementu', () => {
    const byId = new Map(example.nodes.map((n) => [n.id, n]));
    const segs = routeOf(example);
    const groups = new Map<string, typeof segs>();
    for (const s of segs) {
      const key = `${s.fromNodeId}>${s.toNodeId}`;
      groups.set(key, [...(groups.get(key) || []), s]);
    }
    expect(groups.size).toBeGreaterThan(0);
    for (const group of groups.values()) {
      const target = byId.get(group[0].toNodeId)!;
      const end = group.find((s) => s.surface === target.surface && s.points.some(
        (p) => Math.abs(p.x - target.x) < 0.0015 && Math.abs(p.y - target.y) < 0.0015
      ));
      expect(end, `trasa do ${target.label}`).toBeDefined();
    }
  });

  it('nijedna trasa ne prolazi kroz vrata ili prozor', () => {
    for (const s of routeOf(example)) {
      if (s.surface === 'ceiling') continue;
      for (const op of INITIAL_OPENINGS.filter((o) => o.wall === s.surface)) {
        for (let i = 1; i < s.points.length; i++) {
          const a = s.points[i - 1];
          const b = s.points[i];
          const crosses =
            Math.max(a.x, b.x) > op.offsetFromLeft &&
            Math.min(a.x, b.x) < op.offsetFromLeft + op.width &&
            Math.max(a.y, b.y) > op.sillHeight &&
            Math.min(a.y, b.y) < op.sillHeight + op.height;
          expect(crosses, `${s.id} kroz ${op.label}`).toBe(false);
        }
      }
    }
  });

  it('visoka vrata podižu horizontalne trase iznad nadvoja', () => {
    const circuit = { ...INITIAL_CIRCUITS[0], id: 'c', mainJunctionBoxId: 'ro' };
    const nodes: ElectricalNode[] = [
      { id: 'ro', surface: 'west', category: 'distribution_board', label: 'RO', x: 1, y: 1.6, circuitId: 'c' },
      { id: 'u', surface: 'north', category: 'socket_single', label: 'U', x: 2.5, y: 0.3, circuitId: 'c', parentBoxId: 'ro' },
    ];
    const data = addOpening(
      { room, openings: [], furniture: [], nodes, circuits: [circuit], appliances: [] },
      { wall: 'north', type: 'door', label: 'Visoka', offsetFromLeft: 0.3, width: 1.5, height: 2.45, sillHeight: 0 }
    );
    const onNorth = routeOf(data).filter((seg) => seg.surface === 'north');
    expect(onNorth.length).toBeGreaterThan(0);
    for (const s of onNorth) {
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1];
        const b = s.points[i];
        if (Math.abs(a.y - b.y) < 1e-6 && Math.max(a.x, b.x) > 0.3 && Math.min(a.x, b.x) < 1.8) {
          expect(a.y).toBeGreaterThan(2.45);
        }
      }
    }
  });

  it.each(WALLS)('trasa na strop kreće s ruba zida %s', (wall) => {
    const nodes: ElectricalNode[] = [
      { id: 'ro', surface: wall, category: 'distribution_board', label: 'RO', x: 1, y: 1.6, circuitId: 'c' },
      { id: 'l', surface: 'ceiling', category: 'light_ceiling', label: 'RS', x: 1.45, y: 2.95, circuitId: 'c', parentBoxId: 'ro' },
    ];
    const circuits = [{ ...INITIAL_CIRCUITS[0], id: 'c', mainJunctionBoxId: 'ro' }];
    const segs = computeRoutedSegments(room, nodes, circuits, []);
    const ceil = segs.find((s) => s.surface === 'ceiling')!;
    const entry = wallPointOnCeilingEdge(wall, 1, room);
    expect(ceil.points[0].x).toBeCloseTo(entry.x, 3);
    expect(ceil.points[0].y).toBeCloseTo(entry.y, 3);
    expect(ceil.points[ceil.points.length - 1]).toEqual({ x: 1.45, y: 2.95 });
    for (let i = 1; i < ceil.points.length; i++) {
      const a = ceil.points[i - 1];
      const b = ceil.points[i];
      expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true);
    }
  });

  it('razdvaja stvarnu trasu i duljinu s rezervom u kutiji', () => {
    const segs = routeOf(example);
    for (const s of segs) expect(s.lengthMeters).toBeGreaterThanOrEqual(s.routeLengthMeters);
    const { bom } = analyzeProject(example.nodes, example.appliances, example.circuits, segs);
    expect(bom.totalEstimatedLengthMeters).toBeGreaterThan(bom.totalRouteLengthMeters);
    expect(bom.totalPurchaseCableMeters).toBe(
      Object.values(bom.cablesBySpec).reduce((sum, m) => sum + cablePurchaseMeters(m), 0)
    );
    const conduitTotal = Object.values(bom.conduitsByDiameter).reduce((a, b) => a + b, 0);
    expect(conduitTotal).toBeCloseTo(bom.totalRouteLengthMeters, 1);
  });

  it('nacrt bez elemenata nema trasa ni grešaka', () => {
    const empty = createEmptyProject();
    expect(routeOf(empty)).toEqual([]);
    expect(() => analyzeProject(empty.nodes, empty.appliances, empty.circuits, [])).not.toThrow();
  });
});

describe('raspored vodova', () => {
  const example = createExampleProject();
  const segs = routeOf(example);

  type Seg = { a: { x: number; y: number }; b: { x: number; y: number }; from: string; to: string };
  const pieces = (surface: string): Seg[] =>
    segs
      .filter((s) => s.surface === surface)
      .flatMap((s) =>
        s.points.slice(1).map((b, i) => ({ a: s.points[i], b, from: s.fromNodeId, to: s.toNodeId }))
      );
  const nearBody = (p: { x: number; y: number }, surface: string) =>
    example.nodes.some((n) => {
      if (n.surface !== surface) return false;
      const f = ELEMENT_FOOTPRINT[n.category];
      return Math.abs(p.x - n.x) <= f.width / 2 + 0.03 && Math.abs(p.y - n.y) <= f.height / 2 + 0.03;
    });

  it.each(['north', 'east', 'south', 'west'])('nema križanja na zidu %s', (surface) => {
    const all = pieces(surface);
    const found: string[] = [];
    for (const s of all) {
      if (Math.abs(s.a.y - s.b.y) > 1e-6) continue;
      for (const v of all) {
        if (Math.abs(v.a.x - v.b.x) > 1e-6) continue;
        const px = v.a.x;
        const py = s.a.y;
        if (
          px > Math.min(s.a.x, s.b.x) + 1e-6 &&
          px < Math.max(s.a.x, s.b.x) - 1e-6 &&
          py > Math.min(v.a.y, v.b.y) + 1e-6 &&
          py < Math.max(v.a.y, v.b.y) - 1e-6 &&
          !nearBody({ x: px, y: py }, surface)
        ) {
          found.push(`${s.from}>${s.to} x ${v.from}>${v.to} @${px},${py}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('sve vodoravne dionice su u gornjoj zoni, 15 do 45 cm ispod stropa', () => {
    const H = example.room.height;
    for (const surface of WALLS) {
      for (const s of pieces(surface)) {
        if (Math.abs(s.a.y - s.b.y) < 1e-6 && Math.abs(s.a.x - s.b.x) > 0.4) {
          expect(s.a.y).toBeGreaterThanOrEqual(H - 0.45 - 1e-6);
          expect(s.a.y).toBeLessThanOrEqual(H - 0.15 + 1e-6);
        }
      }
    }
  });

  it('ulaz i izlaz razvodne kutije su u ravnini', () => {
    // RK-2: dovod slijeva, U-9 desno
    const feeder = segs.filter((s) => s.toNodeId === 'node-rk-north').pop()!;
    const branch = segs.find((s) => s.fromNodeId === 'node-rk-north' && s.toNodeId === 'node-u-sjever-2')!;
    expect(feeder.points[feeder.points.length - 2].y).toBeCloseTo(2.3, 3);
    expect(branch.points.some((p) => Math.abs(p.y - 2.3) < 1e-6 && p.x > 0.9)).toBe(true);
    const box = example.nodes.find((n) => n.id === 'node-rk-north')!;
    expect(feeder.points[feeder.points.length - 1]).toEqual({ x: box.x, y: box.y });
  });

  it('iz ormara lijevi vodovi izlaze lijevo, desni desno, stropni u sredini', () => {
    const ro = example.nodes.find((n) => n.id === 'node-ro-1')!;
    const fromRo = segs.filter((s) => s.fromNodeId === 'node-ro-1' && s.surface === 'west');
    const riser = (id: string) =>
      fromRo.find((s) => s.toNodeId === id && s.id.match(/(-w1|-wall|)$/))!.points[1].x;
    const ceilingRiser = fromRo.find((s) => s.toNodeId === 'node-light-main')!.points[1].x;
    expect(Math.abs(ceilingRiser - ro.x)).toBeLessThan(0.03);
    expect(riser('node-rk-south')).toBeLessThan(ceilingRiser);
    expect(riser('node-rk-north')).toBeGreaterThan(ceilingRiser);
  });

  it('dva voda ne dijele istu liniju', () => {
    for (const surface of WALLS) {
      const horizontal = pieces(surface).filter(
        (s) => Math.abs(s.a.y - s.b.y) < 1e-6 && Math.abs(s.a.x - s.b.x) > 0.3
      );
      for (let i = 0; i < horizontal.length; i++) {
        for (let j = i + 1; j < horizontal.length; j++) {
          const a = horizontal[i];
          const b = horizontal[j];
          if (Math.abs(a.a.y - b.a.y) > 1e-6) continue;
          const overlap =
            Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) -
            Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x));
          expect(overlap, `${a.from}>${a.to} i ${b.from}>${b.to} na ${surface}`).toBeLessThan(0.05);
        }
      }
    }
  });

  it('trasa ide kraćim smjerom oko sobe', () => {
    // Istok je od ormara na zapadu bliži preko juga
    const toEast = segs.filter((s) => s.toNodeId === 'node-rk-east');
    expect(toEast.map((s) => s.surface)).toEqual(['west', 'south', 'east']);
  });
});

describe('povlačenje otvora', () => {
  const data = createExampleProject();
  const door = data.openings.find((o) => o.type === 'door')!;
  const win = data.openings.find((o) => o.id === 'op-win-west')!;
  const free = { ...data, nodes: [] as ElectricalNode[], openings: [door, win] };
  const drag = (op: typeof door, wall: WallId, x: number, y: number, d = free) =>
    computeOpeningDrag(op, wall, x, y, d.room, d.openings, d.nodes);

  it('vrata ostaju na podu', () => {
    const r = drag(door, 'west', 4.2, 1.3);
    expect(r.sillHeight).toBe(0);
    expect(r.locks.some((l) => l.label === 'Vrata do poda')).toBe(true);
  });
  it('otvor ne može izaći izvan zida', () => {
    expect(drag(door, 'north', -3, 0).offsetFromLeft).toBe(0);
    expect(drag(door, 'north', 9, 0).offsetFromLeft).toBeCloseTo(2, 3);
    expect(drag(win, 'north', 0.5, 5).sillHeight).toBeCloseTo(1.6, 3);
  });
  it('zaključava se na sredini zida', () => {
    const r = drag(door, 'north', 1.03, 0);
    expect(r.offsetFromLeft).toBeCloseTo(1, 3);
    expect(r.locks.some((l) => l.label === 'Sredina zida')).toBe(true);
  });
  it('zaključava standardni parapet i poravnanje s vratima', () => {
    expect(drag(win, 'north', 0.5, 0.93).sillHeight).toBe(0.9);
    const r = drag(win, 'north', 0.5, 1.07);
    expect(r.locks.some((l) => l.axis === 'y')).toBe(true);
  });
  it('preklapanje s drugim otvorom nije dopušteno', () => {
    const r = drag(door, 'west', 1.5, 0);
    const lowWin = { ...win, sillHeight: 0.5 };
    const res = computeOpeningDrag(door, 'west', 1.5, 0, free.room, [door, lowWin], []);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Preklapa');
    expect(r.wall).toBe('west');
  });
  it('ne može preko postavljenog elementa', () => {
    const r = computeOpeningDrag(win, 'north', 0.4, 0.2, data.room, [win], data.nodes);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('U-8');
  });
});

describe('namještaj', () => {
  const base = { ...createExampleProject(), furniture: [] as FurnitureItem[] };
  const room2 = base.room;
  const block = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
    id: 'a', wall: 'north', name: 'Donji element', offsetFromLeft: 0, width: 0.6, height: 0.85, depth: 0.6, bottom: 0, ...over,
  });
  const openings = base.openings;

  it('spaja se bočno na susjeda', () => {
    const neighbour = block({ id: 'b', offsetFromLeft: 1 });
    const moving = block({ offsetFromLeft: 0 });
    const r = computeFurnitureDrag(moving, 'north', 0.36, 0.02, room2, [neighbour, moving], openings);
    expect(r.offsetFromLeft).toBeCloseTo(0.4, 3);
    expect(r.valid).toBe(true);
    expect(r.locks.some((l) => l.label === 'Uz element')).toBe(true);
  });

  it('viseći element se poravna iznad donjeg', () => {
    const lower = block({ id: 'b', offsetFromLeft: 1 });
    const hanging = block({ height: 0.7, bottom: 1.45 });
    const r = computeFurnitureDrag(hanging, 'north', 1.04, 1.45, room2, [lower, hanging], openings);
    expect(r.offsetFromLeft).toBeCloseTo(1, 3);
    expect(r.valid).toBe(true);
  });

  it('ne može se preklopiti s drugim elementom', () => {
    const lower = block({ id: 'b', offsetFromLeft: 1 });
    const moving = block();
    const r = computeFurnitureDrag(moving, 'north', 1.25, 0, room2, [lower, moving], openings);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('Preklapa');
  });

  it('ne može preko vrata ni prozora, ali može ispod prozora', () => {
    const moving = block({ wall: 'west' });
    const door = computeFurnitureDrag(moving, 'west', 2.7, 0, room2, [moving], openings);
    expect(door.valid).toBe(false);
    expect(door.reason).toContain('vrata');
    const tall = block({ wall: 'west', height: 1.85 });
    const window = computeFurnitureDrag(tall, 'west', 1.5, 0, room2, [tall], openings);
    expect(window.valid).toBe(false);
    expect(window.reason).toContain('prozor');
    expect(computeFurnitureDrag(moving, 'west', 1.5, 0, room2, [moving], openings).valid).toBe(true);
  });

  it('ostaje na zidu', () => {
    const moving = block();
    expect(computeFurnitureDrag(moving, 'north', -2, -1, room2, [moving], []).offsetFromLeft).toBe(0);
    const r = computeFurnitureDrag(moving, 'north', 9, 9, room2, [moving], []);
    expect(r.offsetFromLeft + moving.width).toBeCloseTo(room2.length, 3);
    expect(r.sillHeight + moving.height).toBeCloseTo(room2.height, 3);
  });

  it('katalog je ispravan i svaki element stane na zid od 2,60 m', () => {
    const names = FURNITURE_CATALOG.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(FURNITURE_CATALOG.length).toBeGreaterThan(60);
    for (const f of FURNITURE_CATALOG) {
      expect(f.width, f.name).toBeGreaterThan(0);
      expect(f.height, f.name).toBeGreaterThan(0);
      expect(f.depth, f.name).toBeGreaterThan(0);
      expect(f.bottom + f.height, f.name).toBeLessThanOrEqual(2.6);
      expect(FURNITURE_ROOMS, f.name).toContain(f.room);
    }
    const groups = new Set(FURNITURE_CATALOG.filter((f) => f.room === 'Kuhinja').map((f) => f.group));
    expect(groups.has('Viseći elementi')).toBe(true);
  });

  describe('treća dimenzija', () => {
    // Zid sjever: lijevo je zapad. Zid zapad: lijevo je jug, desno sjever.
    const atNorthWest = block({ id: 'n', wall: 'north', offsetFromLeft: 0 });
    const room3 = { length: 2.9, width: 5.9, height: 2.6 };

    it('elementi na susjednim zidovima sudare se u kutu', () => {
      const west = block({ id: 'w', wall: 'west', offsetFromLeft: 5.5, width: 0.4 });
      expect(furnitureConflict(west, room3, [atNorthWest], [], 'w')).toContain('Preklapa');
    });

    it('izvan dubine susjeda nema sudara', () => {
      const west = block({ id: 'w', wall: 'west', offsetFromLeft: 4.7, width: 0.6 });
      expect(furnitureConflict(west, room3, [atNorthWest], [], 'w')).toBeNull();
    });

    it('viseći element iznad donjeg u kutu nije sudar', () => {
      const hanging = block({ id: 'w', wall: 'west', offsetFromLeft: 5.5, width: 0.4, height: 0.7, bottom: 1.45 });
      expect(furnitureConflict(hanging, room3, [atNorthWest], [], 'w')).toBeNull();
    });

    it('nasuprotni elementi ne mogu zajedno prijeći širinu sobe', () => {
      const south = block({ id: 's', wall: 'south', depth: 3 });
      const north = block({ id: 'n', wall: 'north', offsetFromLeft: 2.3, depth: 3 });
      expect(furnitureConflict(south, room3, [north], [], 's')).toContain('Preklapa');
    });

    it('dubina ne može prijeći prostoriju', () => {
      expect(furnitureConflict(block({ depth: 7 }), room3, [], [], 'a')).toContain('Dubina');
    });

    it('povlačenje se u kutu priljubi uz element na susjednom zidu', () => {
      const moving = block({ id: 'w', wall: 'west', offsetFromLeft: 0 });
      const r = computeFurnitureDrag(moving, 'west', 4.72, 0, room3, [atNorthWest, moving], []);
      expect(r.offsetFromLeft).toBeCloseTo(4.7, 3);
      expect(r.valid).toBe(true);
    });

    it('novi element zaobilazi element u kutu', () => {
      const template = { name: 'Donji', width: 0.6, height: 0.85, depth: 0.6, bottom: 0 };
      const data = { ...base, furniture: [block({ id: 'w', wall: 'west', width: 2 })] };
      const next = addFurniture(data, template, 'south')!;
      // Zid jug: lijevo je istok, zapadni element zauzima desni kraj
      expect(next.furniture[1].offsetFromLeft).toBe(0);
      const moreFromEast = addFurniture(
        { ...data, furniture: [block({ id: 'e', wall: 'east', offsetFromLeft: 3.5, width: 2.4 })] },
        template,
        'south'
      )!;
      expect(moreFromEast.furniture[1].offsetFromLeft).toBeCloseTo(0.6, 3);
    });

    it('ormar uz susjedni zid blokira vrata u kutu', () => {
      const door = base.openings.find((o) => o.type === 'door')!;
      const wardrobe = block({ id: 'b', wall: 'north', offsetFromLeft: 0, width: 1, height: 2.1 });
      const r = computeOpeningDrag(door, 'west', 5, 0, room3, [door], [], [wardrobe]);
      expect(r.valid).toBe(false);
      expect(r.reason).toContain('namještaj');
    });
  });

  it('novi element dolazi na prvo slobodno mjesto, uz prethodni', () => {
    const template = FURNITURE_CATALOG.find((f) => f.name === 'Donji element 60')!;
    const first = addFurniture(base, template, 'north')!;
    const second = addFurniture(first, template, 'north')!;
    expect(second.furniture[1].offsetFromLeft).toBeCloseTo(0.6, 3);
  });

  it('kad nema mjesta, ne dodaje', () => {
    const big = { name: 'Veliko', width: 2.9, height: 2.6, depth: 0.6, bottom: 0 };
    const full = addFurniture(base, big, 'north')!;
    expect(addFurniture(full, FURNITURE_CATALOG[0], 'north')).toBeNull();
  });

  it('namještaj ne mijenja trase ni troškovnik', () => {
    const withFurniture = createExampleProject();
    const without = { ...withFurniture, furniture: [] };
    expect(withFurniture.furniture.length).toBeGreaterThan(0);
    expect(routeOf(withFurniture)).toEqual(routeOf(without));
  });

  it('primjer nema preklapanja ni namještaja preko otvora', () => {
    const data = createExampleProject();
    for (const item of data.furniture) {
      expect(furnitureConflict(item, data.room, data.furniture, data.openings, item.id), item.name).toBeNull();
    }
  });

  it('otvor ne može preko namještaja', () => {
    const door = base.openings.find((o) => o.type === 'door')!;
    const piece = block({ id: 'b', offsetFromLeft: 0.5 });
    const r = computeOpeningDrag(door, 'north', 0.4, 0, base.room, [door], [], [piece]);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('namještaj');
    expect(validateOpening({ ...door, wall: 'north', offsetFromLeft: 0.4 }, base.room, [piece]).offsetFromLeft).toBeDefined();
  });
});

describe('pravila struke', () => {
  const example = createExampleProject();
  const segs = routeOf(example);

  it('pad napona raste s duljinom i snagom, pada s presjekom', () => {
    const a = circuitVoltageDropPercent('cir-1', 3000, example, segs);
    const b = circuitVoltageDropPercent('cir-1', 1500, example, segs);
    expect(a).toBeCloseTo(b * 2, 6);
  });
  it('dugi vod male sekcije javlja upozorenje', () => {
    const data = { ...example, circuits: example.circuits.map((c) => ({ ...c, cableCrossSection: 1.5 as const })) };
    const hints = checkInstallationRules(data, segs, new Map([['cir-3', 3200]]));
    expect(hints.some((h) => h.id === 'drop-cir-3') || circuitVoltageDropPercent('cir-3', 3200, data, segs) <= 5).toBe(true);
  });
  it('kutija izvan gornje zone daje napomenu', () => {
    const data = { ...example, nodes: example.nodes.map((n) => (n.id === 'node-rk-north' ? { ...n, y: 1.5 } : n)) };
    expect(checkInstallationRules(data, segs, new Map()).some((h) => h.id === 'zone-node-rk-north')).toBe(true);
  });
  it('troškovnik sadrži FID sklopku', () => {
    const { bom } = analyzeProject(example.nodes, example.appliances, example.circuits, segs);
    expect(Object.keys(bom.breakersBySpec).some((k) => k.startsWith('FID sklopka'))).toBe(true);
  });
  it('izmjenični prekidač koristi 4 žile, a križni 5', () => {
    const c = example.circuits[0];
    const node = { ...example.nodes[0] };
    expect(getCableAndConduitSpec({ ...node, category: 'switch_two_way' }, c).conductors).toHaveLength(4);
    expect(getCableAndConduitSpec({ ...node, category: 'switch_double' }, c).conductors).toHaveLength(4);
    expect(getCableAndConduitSpec({ ...node, category: 'switch_cross' }, c).conductors).toHaveLength(5);
    expect(getCableAndConduitSpec({ ...node, category: 'switch_two_way' }, c).conductors).not.toContain('N');
  });
});

describe('validacija', () => {
  it('prostorija izvan raspona vraća poruku', () => {
    expect(validateRoomField('length', 0.5)).toContain('od 1,00 do 30,00');
    expect(validateRoomField('length', 4)).toBeNull();
    expect(validateRoomField('height', 12)).not.toBeNull();
  });

  const base = { wall: 'north' as const, type: 'window' as const, offsetFromLeft: 0.5, width: 1, height: 1, sillHeight: 0.9 };

  it('ispravan otvor nema grešaka', () => {
    expect(validateOpening(base, room)).toEqual({});
  });
  it('otvor preko ruba zida javlja najveću udaljenost', () => {
    expect(validateOpening({ ...base, offsetFromLeft: 2.5 }, room).offsetFromLeft).toContain('1,90');
  });
  it('otvor kroz strop javlja grešku visine', () => {
    expect(validateOpening({ ...base, sillHeight: 2 }, room).height).toBeDefined();
  });
  it('vrata moraju počinjati od poda', () => {
    expect(validateOpening({ ...base, type: 'door', sillHeight: 0.2 }, room).sillHeight).toBeDefined();
  });
});

describe('operacije nad projektom', () => {
  it('odbija element na krivoj plohi', () => {
    expect(canPlaceOn('light_ceiling', 'north')).toBe(false);
    expect(canPlaceOn('socket_single', 'ceiling')).toBe(false);
    expect(canPlaceOn('junction_box', 'ceiling')).toBe(true);
    expect(addNode(createEmptyProject(), 'socket_single', 'ceiling')).toBeNull();
  });

  it('oznaka nakon brisanja ne stvara duplikat', () => {
    let data = createEmptyProject();
    const a = addNode(data, 'socket_single', 'north')!;
    const b = addNode(a.data, 'socket_single', 'north')!;
    data = deleteNode(b.data, a.nodeId);
    const c = addNode(data, 'socket_single', 'north')!;
    const labels = c.data.nodes.map((n) => n.label.split(' ')[0]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('brisanje kutije čisti sve veze', () => {
    const data = createExampleProject();
    const removed = deleteNode(data, 'node-rk-north');
    expect(removed.nodes.some((n) => n.parentBoxId === 'node-rk-north')).toBe(false);
    expect(removed.circuits.some((c) => c.mainJunctionBoxId === 'node-rk-north')).toBe(false);
    expect(() => routeOf(removed)).not.toThrow();
  });

  it('element izvan zida ostaje na mjestu dok se ne premjesti', () => {
    const data = { ...createExampleProject(), room: { length: 2.9, width: 3, height: 2.6 } };
    const outside = getOutsideNodes(data);
    expect(outside.map((n) => n.id)).toContain('node-u-zapad-2');
    expect(data.nodes.find((n) => n.id === 'node-u-zapad-2')!.x).toBe(4.85);
    const fixed = moveNodeInside(data, 'node-u-zapad-2');
    expect(fixed.nodes.find((n) => n.id === 'node-u-zapad-2')!.x).toBe(2.95);
    expect(isNodeOutsideSurface(fixed.nodes.find((n) => n.id === 'node-u-zapad-2')!, data.room)).toBe(false);
  });

  it('brisanje kruga premješta elemente, a zadnji krug ostaje', () => {
    const data = createExampleProject();
    const after = deleteCircuit(data, 'cir-1');
    expect(after.nodes.some((n) => n.circuitId === 'cir-1')).toBe(false);
    let single = createEmptyProject();
    single = deleteCircuit(single, single.circuits[0].id);
    expect(deleteCircuit(single, single.circuits[0].id).circuits).toHaveLength(1);
  });

  it('novi krug dobiva slobodnu oznaku', () => {
    const data = addCircuit(createEmptyProject());
    expect(data.circuits[2].code).toBe('SK-3');
  });
});

describe('automatska prilagodba mreže', () => {
  const heavy = APPLIANCE_CATALOG_TEMPLATES.find((t) => t.name === 'Ugradbena pećnica')!;
  const small = APPLIANCE_CATALOG_TEMPLATES.find((t) => t.name === 'Usisavač ili pomoćno trošilo')!;

  const setup = () => {
    let data = createExampleProject();
    data = { ...data, appliances: [] };
    for (let i = 0; i < 20; i++) data = addApplianceFromTemplate(data, small);
    data = addApplianceFromTemplate(data, heavy);
    return data;
  };

  it('ne mijenja ulazni projekt', () => {
    const data = setup();
    const snapshot = structuredClone(data);
    autoAdaptNetwork(data);
    expect(data).toEqual(snapshot);
  });

  it('nove utičnice ne stavlja preko otvora ni izvan zida', () => {
    const result = autoAdaptNetwork(setup());
    const before = new Set(createExampleProject().nodes.map((n) => n.id));
    const added = result.data.nodes.filter((n) => !before.has(n.id));
    expect(added.length).toBeGreaterThan(0);
    for (const n of added) {
      expect(isNodeOutsideSurface(n, result.data.room)).toBe(false);
      const hit = result.data.openings.some(
        (o) =>
          o.wall === n.surface &&
          n.x > o.offsetFromLeft &&
          n.x < o.offsetFromLeft + o.width &&
          n.y > o.sillHeight &&
          n.y < o.sillHeight + o.height
      );
      expect(hit, n.label).toBe(false);
    }
  });

  it('zatvara manjak utičnica', () => {
    const result = autoAdaptNetwork(setup());
    const segs = routeOf(result.data);
    const { socketBalance } = analyzeProject(result.data.nodes, result.data.appliances, result.data.circuits, segs);
    expect(socketBalance.missingOutlets1P).toBe(0);
  });
});

describe('automatska prilagodba: potpuna logika', () => {
  const stats = (data: ProjectData) => analyzeProject(data.nodes, data.appliances, data.circuits, routeOf(data));
  const template = (name: string) => APPLIANCE_CATALOG_TEMPLATES.find((t) => t.name === name)!;

  it('jedno trošilo blizu granice ostaje upozorenje i nudi rješenje', () => {
    const sk3 = stats(createExampleProject()).circuitAnalyses.find((c) => c.circuit.id === 'cir-3')!;
    expect(sk3.status).toBe('warning');
    expect(sk3.warnings[0]).toContain('13,91 A od 16 A');
    expect(sk3.warnings[0]).toContain('Rješenje');
  });

  it('pećnica: fiksni priključak 20 A stvarno rješava obavijest', () => {
    const result = autoAdaptNetwork(createExampleProject());
    expect(result.changes.some((c) => c.startsWith('SK-3') && c.includes('fiksni priključak'))).toBe(true);
    expect(result.data.circuits.find((c) => c.id === 'cir-3')).toMatchObject({ breakerAmps: 20, cableCrossSection: 4 });
    const oven = result.data.nodes.find((n) => n.id === 'node-u-pecnica')!;
    expect(oven.category).toBe('socket_fixed_1p');
    const sk3 = stats(result.data).circuitAnalyses.find((c) => c.circuit.id === 'cir-3')!;
    expect(sk3.status).toBe('nominal');
    expect(sk3.warnings).toEqual([]);
    expect(stats(result.data).socketBalance.isBalanced).toBe(true);
  });

  it('nakon primjene nema više što mijenjati', () => {
    const once = autoAdaptNetwork(createExampleProject());
    expect(autoAdaptNetwork(once.data).changes).toEqual([]);
  });

  it('Šuko utičnica nikad ne dobiva osigurač iznad 16 A', () => {
    const base = createExampleProject();
    const data = { ...base, circuits: base.circuits.map((c) => (c.id === 'cir-1' ? { ...c, breakerAmps: 20 as const, cableCrossSection: 4 as const } : c)) };
    expect(checkInstallationRules(data, routeOf(data), new Map()).some((h) => h.id === 'schuko-cir-1')).toBe(true);
    const result = autoAdaptNetwork(data);
    expect(result.data.circuits.find((c) => c.id === 'cir-1')!.breakerAmps).toBe(16);
    for (const c of result.data.circuits) {
      if (c.breakerAmps > 16) {
        expect(result.data.nodes.some((n) => n.circuitId === c.id && (n.category === 'socket_single' || n.category === 'socket_double'))).toBe(false);
      }
    }
  });

  it('previše trošila na utičnici: višak dobiva novu utičnicu', () => {
    const base = createExampleProject();
    const data = {
      ...base,
      appliances: ['a', 'b'].map((id) => ({ id, name: id, category: 'ostalo' as const, powerWatts: 100, requiresDedicatedCircuit: false, circuitId: 'cir-1', assignedNodeId: 'node-u-sjever-1' })),
    };
    const result = autoAdaptNetwork(data);
    const onSocket = result.data.appliances.filter((a) => a.assignedNodeId === 'node-u-sjever-1');
    expect(onSocket).toHaveLength(1);
  });

  it('rasvjeta i utičnice na istom krugu se razdvajaju', () => {
    const base = createExampleProject();
    const data = { ...base, nodes: base.nodes.map((n) => (n.id === 'node-light-main' ? { ...n, circuitId: 'cir-1' } : n)) };
    expect(checkInstallationRules(data, routeOf(data), new Map()).some((h) => h.id === 'mixed-cir-1')).toBe(true);
    const result = autoAdaptNetwork(data);
    expect(result.data.nodes.find((n) => n.id === 'node-light-main')!.circuitId).not.toBe('cir-1');
    expect(checkInstallationRules(result.data, routeOf(result.data), new Map()).some((h) => h.id.startsWith('mixed'))).toBe(false);
  });

  it('kutija izvan zone vraća se u gornju zonu', () => {
    const base = createExampleProject();
    const data = { ...base, nodes: base.nodes.map((n) => (n.id === 'node-rk-north' ? { ...n, y: 1.4 } : n)) };
    expect(autoAdaptNetwork(data).data.nodes.find((n) => n.id === 'node-rk-north')!.y).toBeCloseTo(2.3, 3);
  });

  it('nedostaje li ormar, dodaje ga', () => {
    const base = createExampleProject();
    const data = deleteNode(base, 'node-ro-1');
    const result = autoAdaptNetwork(data);
    expect(result.data.nodes.some((n) => n.category === 'distribution_board')).toBe(true);
  });

  it('tri elementa izravno iz ormara dobivaju razvodnu kutiju', () => {
    const empty = createEmptyProject();
    let data = addNode(empty, 'distribution_board', 'west')!.data;
    for (const x of [0.5, 1.5, 2.5]) {
      data = addNode(data, 'socket_single', 'north', { x, y: 0.3 }, data.circuits[0].id)!.data;
    }
    const result = autoAdaptNetwork(data);
    const box = result.data.nodes.find((n) => n.category === 'junction_box')!;
    expect(box.surface).toBe('north');
    expect(result.data.nodes.filter((n) => n.parentBoxId === box.id)).toHaveLength(3);
    expect(directFeedGroups(result.data)).toEqual([]);
  });

  it('velik pad napona povećava presjek', () => {
    const empty = createEmptyProject();
    let data: ProjectData = { ...empty, room: { length: 30, width: 30, height: 2.6 } };
    data = addNode(data, 'distribution_board', 'west', { x: 0.5, y: 1.6 })!.data;
    const socket = addNode(data, 'socket_double', 'north', { x: 25, y: 0.3 }, data.circuits[0].id)!;
    const load = (id: string, powerWatts: number) => ({
      id,
      name: id,
      category: 'ostalo' as const,
      powerWatts,
      requiresDedicatedCircuit: false,
      circuitId: socket.data.circuits[0].id,
      assignedNodeId: socket.nodeId,
    });
    data = { ...socket.data, appliances: [load('a', 1500), load('b', 1400)] };
    const circuitId = data.circuits[0].id;
    expect(circuitVoltageDropPercent(circuitId, 2900, data, routeOf(data))).toBeGreaterThan(5);
    const result = autoAdaptNetwork(data);
    expect(result.changes.some((c) => c.includes('pada napona'))).toBe(true);
    expect(result.data.circuits[0].cableCrossSection).toBe(4);
    expect(circuitVoltageDropPercent(circuitId, 2900, result.data, routeOf(result.data))).toBeLessThanOrEqual(5);
  });

  it('dijeljeni krug pod velikim opterećenjem i dalje upozorava', () => {
    const example = createExampleProject();
    const data = {
      ...example,
      appliances: example.appliances.map((a) =>
        a.circuitId === 'cir-1' ? { ...a, powerWatts: 1700 } : a
      ).concat([{ id: 'x', name: 'Grijalica', category: 'ostalo', powerWatts: 1700, requiresDedicatedCircuit: false, circuitId: 'cir-1' }]),
    };
    expect(stats(data).circuitAnalyses.find((c) => c.circuit.id === 'cir-1')!.status).not.toBe('nominal');
  });

  it('razdvaja jaka trošila dok krug ne padne ispod 80 %', () => {
    const base = createExampleProject();
    const data = {
      ...base,
      appliances: [
        { id: 'a', name: 'Grijalica', category: 'ostalo' as const, powerWatts: 1800, requiresDedicatedCircuit: false, circuitId: 'cir-1' },
        { id: 'b', name: 'Kuhalo', category: 'ostalo' as const, powerWatts: 1500, requiresDedicatedCircuit: false, circuitId: 'cir-1' },
        { id: 'c', name: 'Glačalo', category: 'ostalo' as const, powerWatts: 900, requiresDedicatedCircuit: false, circuitId: 'cir-1' },
      ],
    };
    const result = autoAdaptNetwork(data);
    expect(result.changes.some((c) => c.includes('Grijalica'))).toBe(true);
    for (const circuit of stats(result.data).circuitAnalyses) expect(circuit.status).toBe('nominal');
  });

  it('utičnica premještena na novi krug napaja se iz ormara, ne iz kutije drugog kruga', () => {
    const base = createExampleProject();
    const data = {
      ...base,
      appliances: [
        { id: 'p', name: 'Pećnica', category: 'kuhinja' as const, powerWatts: 3000, requiresDedicatedCircuit: true, circuitId: 'cir-1', assignedNodeId: 'node-u-sjever-1' },
        { id: 't', name: 'TV', category: 'multimedija' as const, powerWatts: 100, requiresDedicatedCircuit: false, circuitId: 'cir-1', assignedNodeId: 'node-u-sjever-2' },
      ],
    };
    const moved = autoAdaptNetwork(data).data.nodes.find((n) => n.id === 'node-u-sjever-1')!;
    expect(moved.parentBoxId).toBe('node-ro-1');
    expect(moved.circuitId).not.toBe('cir-1');
  });

  it('dva trošila na istoj utičnici: jače dobiva vlastitu utičnicu', () => {
    const base = createExampleProject();
    const data = {
      ...base,
      appliances: [
        { id: 'p', name: 'Pećnica', category: 'kuhinja' as const, powerWatts: 3000, requiresDedicatedCircuit: true, circuitId: 'cir-1', assignedNodeId: 'node-u-sjever-2' },
        { id: 't', name: 'TV', category: 'multimedija' as const, powerWatts: 100, requiresDedicatedCircuit: false, circuitId: 'cir-1', assignedNodeId: 'node-u-sjever-2' },
      ],
    };
    const result = autoAdaptNetwork(data);
    expect(result.data.appliances.find((a) => a.id === 'p')!.assignedNodeId).not.toBe('node-u-sjever-2');
    expect(result.data.appliances.find((a) => a.id === 't')!.assignedNodeId).toBe('node-u-sjever-2');
  });

  it('prejako jednofazno trošilo: do 4600 W fiksni priključak, iznad javlja problem', () => {
    const empty = createEmptyProject();
    const socket = addNode(empty, 'socket_single', 'north')!;
    const withLoad = (watts: number) => ({
      ...socket.data,
      appliances: [{ id: 'a', name: 'Stroj', category: 'ostalo' as const, powerWatts: watts, requiresDedicatedCircuit: false, circuitId: socket.data.circuits[0].id, assignedNodeId: socket.nodeId }],
    });
    const fixed = autoAdaptNetwork(withLoad(4200));
    expect(fixed.data.circuits[0].breakerAmps).toBe(20);
    expect(fixed.data.circuits[0].cableCrossSection).toBe(4);
    expect(fixed.data.nodes[0].category).toBe('socket_fixed_1p');
    const tooMuch = autoAdaptNetwork(withLoad(6000));
    expect(tooMuch.unresolved[0]).toContain('trofazni');
    expect(tooMuch.data.circuits[0].breakerAmps).toBe(16);
  });

  it('nove utičnice ne stavlja iza namještaja', () => {
    const empty = createEmptyProject();
    const wide = (id: string, wall: WallId, width: number): FurnitureItem => ({
      id, wall, name: 'Blok', offsetFromLeft: 0, width, height: 1, depth: 0.5, bottom: 0,
    });
    let data: ProjectData = { ...empty, furniture: [wide('n', 'north', 4)] };
    data = addApplianceFromTemplate(data, template('Usisavač ili pomoćno trošilo'));
    const result = autoAdaptNetwork(data);
    expect(result.data.nodes).toHaveLength(1);
    expect(result.data.nodes[0].surface).not.toBe('north');
  });

  it('ne mijenja ulazne podatke ni kad razdvaja krugove', () => {
    const base = createExampleProject();
    const data = {
      ...base,
      appliances: [
        { id: 'a', name: 'A', category: 'ostalo' as const, powerWatts: 2000, requiresDedicatedCircuit: false, circuitId: 'cir-1' },
        { id: 'b', name: 'B', category: 'ostalo' as const, powerWatts: 2000, requiresDedicatedCircuit: false, circuitId: 'cir-1' },
      ],
    };
    const snapshot = structuredClone(data);
    autoAdaptNetwork(data);
    expect(data).toEqual(snapshot);
  });
});

describe('oznake na nacrtu', () => {
  it('ne preklapaju se', () => {
    const bounds = { x: 0, y: 0, width: 400, height: 200 };
    const requests = [10, 26, 42, 58, 74].map((x, i) => ({
      id: `n${i}`, x, y: 100, anchorWidth: 4, anchorHeight: 4, labelWidth: 30, labelHeight: 14, gap: 5, bounds,
    }));
    const placed = [...placeLabels(requests, []).values()];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const overlap = Math.abs(placed[i].x - placed[j].x) < 30 && Math.abs(placed[i].y - placed[j].y) < 14;
        expect(overlap).toBe(false);
      }
    }
  });
});
