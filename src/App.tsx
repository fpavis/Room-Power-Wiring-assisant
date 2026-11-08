import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Editor } from './components/Editor';
import { ProjectsScreen } from './components/ProjectsScreen';
import { createExampleProject } from './engine/projectOps';
import {
  createProject,
  getLastProjectId,
  getProject,
  listProjects,
  loadProject,
  requestPersistentStorage,
  setLastProjectId,
  StoragePersistence,
  StoredProject,
} from './persistence/db';

type Screen =
  | { kind: 'loading' }
  | { kind: 'projects'; message: string | null }
  | { kind: 'editor'; project: StoredProject };

function acquireProjectLock(id: string): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    void navigator.locks.request(
      `elektroplan:${id}`,
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          resolve(null);
          return undefined;
        }
        return new Promise<void>((release) => resolve(release));
      }
    );
  });
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [storage, setStorage] = useState<StoragePersistence>('unknown');
  const releaseLock = useRef<(() => void) | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const open = useCallback(async (id: string) => {
    releaseLock.current?.();
    releaseLock.current = null;
    const project = await loadProject(id);
    if (!project) {
      setScreen({ kind: 'projects', message: 'Projekt više ne postoji.' });
      return;
    }
    const release = await acquireProjectLock(id);
    if (!release) {
      setScreen({
        kind: 'projects',
        message: `Projekt "${project.name}" već je otvoren u drugoj kartici.`,
      });
      return;
    }
    releaseLock.current = release;
    await setLastProjectId(id);
    setScreen({ kind: 'editor', project });
  }, []);

  useEffect(() => {
    void requestPersistentStorage().then(setStorage);
    (async () => {
      try {
        const lastId = await getLastProjectId();
        if (lastId && (await getProject(lastId))) {
          await open(lastId);
          return;
        }
        const existing = await listProjects();
        if (existing.length > 0) {
          setScreen({ kind: 'projects', message: null });
          return;
        }
        const created = await createProject('Primjer: stan', createExampleProject());
        await open(created.id);
      } catch {
        setScreen({
          kind: 'projects',
          message:
            'Pohrana u pregledniku nije dostupna. Provjeri da nisi u privatnom načinu rada.',
        });
      }
    })();
  }, [open]);

  return (
    <div className="h-full flex flex-col">
      {needRefresh && (
        <div className="flex items-center justify-center gap-3 px-3 py-1.5 bg-ink text-paper shrink-0 no-print" role="status">
          Dostupna je nova verzija.
          <button className="btn" onClick={() => updateServiceWorker(true)}>
            Osvježi
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {screen.kind === 'loading' && (
          <p className="p-6 text-muted">Učitavanje…</p>
        )}
        {screen.kind === 'projects' && (
          <ProjectsScreen message={screen.message} onOpen={open} />
        )}
        {screen.kind === 'editor' && (
          <Editor
            key={screen.project.id}
            project={screen.project}
            storage={storage}
            onExit={() => {
              releaseLock.current?.();
              releaseLock.current = null;
              setScreen({ kind: 'projects', message: null });
            }}
          />
        )}
      </div>
    </div>
  );
}
