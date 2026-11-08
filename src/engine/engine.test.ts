import { describe, expect, it } from 'vitest';
import {
  APPLIANCE_CATALOG_TEMPLATES,
  INITIAL_CIRCUITS,
  INITIAL_NODES,
  INITIAL_OPENINGS,
  INITIAL_ROOM,
} from '../data/presets';
import { ElectricalNode, ProjectData, WallId } from '../types/electrical';
import { analyzeProject, cablePurchaseMeters } from './electricalEngine';
import {
  ceilingToView,
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
      { room, openings: [], nodes, circuits: [circuit], appliances: [] },
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
