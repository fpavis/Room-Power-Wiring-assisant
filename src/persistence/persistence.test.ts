import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, createExampleProject } from '../engine/projectOps';
import { commit, createHistory, HISTORY_LIMIT, redo, undo } from '../state/history';
import {
  createProject,
  deleteProject,
  getLastProjectId,
  getProject,
  listProjects,
  renameProject,
  saveProjectData,
  setLastProjectId,
} from './db';
import { parseProjectFile, ProjectFileError, serializeProject } from './projectFile';

beforeEach(async () => {
  for (const p of await listProjects()) await deleteProject(p.id);
});

describe('pohrana projekata', () => {
  it('sprema i vraća cijeli projekt', async () => {
    const data = createExampleProject();
    const created = await createProject('Stan', data);
    const loaded = await getProject(created.id);
    expect(loaded?.name).toBe('Stan');
    expect(loaded?.data).toEqual(data);
  });

  it('automatsko spremanje mijenja podatke i vrijeme', async () => {
    const created = await createProject('Stan', createEmptyProject());
    await new Promise((r) => setTimeout(r, 5));
    const next = { ...created.data, room: { ...created.data.room, length: 7.25 } };
    await saveProjectData(created.id, next);
    const loaded = await getProject(created.id);
    expect(loaded?.data.room.length).toBe(7.25);
    expect(loaded!.updatedAt > created.updatedAt).toBe(true);
  });

  it('popis je složen od zadnje promjene', async () => {
    const a = await createProject('A', createEmptyProject());
    await new Promise((r) => setTimeout(r, 5));
    await createProject('B', createEmptyProject());
    await new Promise((r) => setTimeout(r, 5));
    await renameProject(a.id, 'A2');
    expect((await listProjects()).map((p) => p.name)).toEqual(['A2', 'B']);
  });

  it('pamti zadnji otvoreni projekt', async () => {
    await setLastProjectId('abc');
    expect(await getLastProjectId()).toBe('abc');
  });

  it('brisanje uklanja projekt', async () => {
    const p = await createProject('X', createEmptyProject());
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeUndefined();
  });
});

describe('datoteka projekta', () => {
  it('izvoz i uvoz vraćaju iste podatke', () => {
    const data = createExampleProject();
    const parsed = parseProjectFile(serializeProject('Moj stan', data));
    expect(parsed.name).toBe('Moj stan');
    expect(parsed.data).toEqual(data);
  });

  it.each([
    ['nije JSON', 'blabla'],
    ['tuđi JSON', '{"a":1}'],
    ['stari izvoz', '{"project":"ElektroPlan 3D/2D Blueprint","room":{}}'],
    ['bez podataka', '{"format":"elektroplan","schemaVersion":1}'],
    ['krivi tip elementa', JSON.stringify({ format: 'elektroplan', schemaVersion: 1, data: { ...createEmptyProject(), nodes: [{ id: 'a', label: 'a', surface: 'north', category: 'nuklearka', x: 1, y: 1, circuitId: 'x' }] } })],
  ])('odbija: %s', (_name, text) => {
    expect(() => parseProjectFile(text)).toThrow(ProjectFileError);
  });

  it('stariji projekt bez namještaja otvara se s praznim slojem', () => {
    const { furniture: _none, ...old } = createEmptyProject();
    const text = JSON.stringify({ format: 'elektroplan', schemaVersion: 1, name: 'Stari', data: old });
    expect(parseProjectFile(text).data.furniture).toEqual([]);
  });

  it('stariji namještaj bez dubine dobiva dubinu iz kataloga', () => {
    const data = {
      ...createEmptyProject(),
      furniture: [
        { id: 'a', wall: 'north', name: 'Viseći ormarić', offsetFromLeft: 0, width: 0.6, height: 0.7, bottom: 1.45 },
        { id: 'b', wall: 'north', name: 'Nešto nepoznato', offsetFromLeft: 1, width: 0.6, height: 0.7, bottom: 0 },
      ],
    };
    const text = JSON.stringify({ format: 'elektroplan', schemaVersion: 1, data });
    const parsed = parseProjectFile(text).data.furniture;
    expect(parsed[0].depth).toBeCloseTo(0.35, 3);
    expect(parsed[1].depth).toBeCloseTo(0.6, 3);
  });

  it('element na nepostojećem krugu se odbija', () => {
    const data = createExampleProject();
    data.nodes[0].circuitId = 'nema';
    expect(() => parseProjectFile(serializeProject('X', data))).toThrow(ProjectFileError);
  });

  it('novija verzija formata dobiva jasnu poruku', () => {
    const text = JSON.stringify({ format: 'elektroplan', schemaVersion: 99, data: createEmptyProject() });
    expect(() => parseProjectFile(text)).toThrow(/novijoj verziji/);
  });
});

describe('poništavanje', () => {
  it('poništi i ponovi vraćaju stanja', () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
  });

  it('nova promjena briše ponavljanje', () => {
    let h = commit(createHistory(1), 2);
    h = undo(h);
    h = commit(h, 5);
    expect(redo(h).present).toBe(5);
  });

  it('jedno povlačenje je jedan korak', () => {
    let h = createHistory(0);
    h = commit(h, 1, 'drag-1');
    h = commit(h, 2, 'drag-1');
    h = commit(h, 3, 'drag-1');
    expect(h.past).toEqual([0]);
    expect(undo(h).present).toBe(0);
  });

  it('dva povlačenja su dva koraka', () => {
    let h = createHistory(0);
    h = commit(h, 1, 'drag-1');
    h = commit(h, 2, 'drag-2');
    expect(undo(h).present).toBe(1);
  });

  it('pamti najviše 50 koraka', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
