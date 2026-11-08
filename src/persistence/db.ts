import { ProjectData } from '../types/electrical';
import { randomId } from '../engine/ids';
import { SCHEMA_VERSION } from './projectFile';

export interface StoredProject {
  id: string;
  name: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  data: ProjectData;
}

export type ProjectSummary = Omit<StoredProject, 'data'>;

const DB_NAME = 'elektroplan';
const PROJECTS = 'projects';
const META = 'meta';
const LAST_PROJECT_KEY = 'lastProjectId';

let connection: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (connection) return Promise.resolve(connection);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECTS, { keyPath: 'id' });
      request.result.createObjectStore(META);
    };
    request.onsuccess = () => {
      connection = request.result;
      connection.onclose = () => {
        connection = null;
      };
      resolve(connection);
    };
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

const pendingKey = (id: string) => `elektroplan:pending:${id}`;

/**
 * Browsers may abort IndexedDB writes while a page closes, so the latest state
 * also goes to synchronous storage and is recovered on the next open.
 */
export function writePendingProject(project: StoredProject): void {
  localStorage.setItem(pendingKey(project.id), JSON.stringify(project));
}

export async function loadProject(id: string): Promise<StoredProject | undefined> {
  const stored = await getProject(id);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(pendingKey(id));
    localStorage.removeItem(pendingKey(id));
  } catch {
    return stored;
  }
  if (!raw || !stored) return stored;
  const pending = JSON.parse(raw) as StoredProject;
  if (pending.updatedAt <= stored.updatedAt) return stored;
  await putProject(pending);
  return pending;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await withStore<StoredProject[]>(PROJECTS, 'readonly', (s) => s.getAll());
  return all
    .map(({ data: _data, ...summary }) => summary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getProject = (id: string): Promise<StoredProject | undefined> =>
  withStore<StoredProject | undefined>(PROJECTS, 'readonly', (s) => s.get(id));

export const putProject = (project: StoredProject): Promise<IDBValidKey> =>
  withStore<IDBValidKey>(PROJECTS, 'readwrite', (s) => s.put(project));

export const deleteProject = (id: string): Promise<undefined> =>
  withStore<undefined>(PROJECTS, 'readwrite', (s) => s.delete(id));

export async function createProject(
  name: string,
  data: ProjectData
): Promise<StoredProject> {
  const now = new Date().toISOString();
  const project: StoredProject = {
    id: randomId(),
    name,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    data,
  };
  await putProject(project);
  return project;
}

export async function saveProjectData(
  id: string,
  data: ProjectData
): Promise<void> {
  const existing = await getProject(id);
  if (!existing) throw new Error('Projekt ne postoji.');
  await putProject({ ...existing, data, updatedAt: new Date().toISOString() });
}

export async function renameProject(id: string, name: string): Promise<void> {
  const existing = await getProject(id);
  if (!existing) throw new Error('Projekt ne postoji.');
  await putProject({ ...existing, name, updatedAt: new Date().toISOString() });
}

export const getLastProjectId = (): Promise<string | undefined> =>
  withStore<string | undefined>(META, 'readonly', (s) => s.get(LAST_PROJECT_KEY));

export const setLastProjectId = (id: string): Promise<IDBValidKey> =>
  withStore<IDBValidKey>(META, 'readwrite', (s) => s.put(id, LAST_PROJECT_KEY));

export type StoragePersistence = 'persistent' | 'best-effort' | 'unknown';

export async function requestPersistentStorage(): Promise<StoragePersistence> {
  if (!navigator.storage?.persist) return 'unknown';
  try {
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}
