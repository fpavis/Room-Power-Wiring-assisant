import React, { useEffect, useRef, useState } from 'react';
import { Copy, Download, FolderOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { createEmptyProject, createExampleProject } from '../engine/projectOps';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  ProjectSummary,
  renameProject,
} from '../persistence/db';
import {
  FILE_EXTENSION,
  parseProjectFile,
  ProjectFileError,
  serializeProject,
} from '../persistence/projectFile';
import { Dialog } from './ui';

const dateFormat = new Intl.DateTimeFormat('hr-HR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function ProjectsScreen({
  message,
  onOpen,
}: {
  message: string | null;
  onOpen: (id: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(message);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = () => listProjects().then(setProjects);
  useEffect(() => {
    void refresh();
  }, []);

  const createAndOpen = async (name: string, example: boolean) => {
    const project = await createProject(
      name,
      example ? createExampleProject() : createEmptyProject()
    );
    onOpen(project.id);
  };

  const importFile = async (file: File) => {
    try {
      const { name, data } = parseProjectFile(await file.text());
      const project = await createProject(name, data);
      onOpen(project.id);
    } catch (e) {
      setError(
        e instanceof ProjectFileError ? e.message : 'Datoteku nije moguće uvesti.'
      );
    }
  };

  const duplicate = async (summary: ProjectSummary) => {
    const source = await getProject(summary.id);
    if (!source) return;
    await createProject(`${summary.name} (kopija)`, source.data);
    await refresh();
  };

  const exportFile = async (summary: ProjectSummary) => {
    const source = await getProject(summary.id);
    if (!source) return;
    const url = URL.createObjectURL(
      new Blob([serializeProject(source.name, source.data)], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${source.name.replace(/[\\/:*?"<>|]/g, '-')}${FILE_EXTENSION}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto bg-panel">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
        <h1 className="text-[22px] font-bold">Moji projekti</h1>

        {error && (
          <p role="alert" className="p-2.5 border border-err rounded font-semibold text-err bg-paper">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => createAndOpen('Novi projekt', false)}>
            <Plus className="w-4 h-4" /> Novi projekt
          </button>
          <button className="btn" onClick={() => createAndOpen('Primjer: stan', true)}>
            <FolderOpen className="w-4 h-4" /> Otvori primjer
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Upload className="w-4 h-4" /> Uvezi datoteku
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Datoteka projekta"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>

        {projects?.length === 0 && (
          <p className="text-muted">Još nema projekata. Napravi novi ili otvori primjer.</p>
        )}

        <ul className="space-y-2">
          {projects?.map((project) => (
            <li key={project.id} className="flex items-center gap-2 p-2.5 bg-paper border border-line rounded">
              <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(project.id)}>
                <div className="font-bold truncate text-[14px]">{project.name}</div>
                <div className="text-[12px] text-muted">
                  Promijenjeno {dateFormat.format(new Date(project.updatedAt))}
                </div>
              </button>
              <button className="icon-btn" aria-label={`Preimenuj ${project.name}`} onClick={() => setRenaming(project)}>
                <Pencil className="w-4 h-4" />
              </button>
              <button className="icon-btn" aria-label={`Kopiraj ${project.name}`} onClick={() => duplicate(project)}>
                <Copy className="w-4 h-4" />
              </button>
              <button className="icon-btn" aria-label={`Izvezi ${project.name}`} onClick={() => exportFile(project)}>
                <Download className="w-4 h-4" />
              </button>
              <button className="icon-btn" aria-label={`Obriši ${project.name}`} onClick={() => setDeleting(project)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {deleting && (
        <Dialog title="Obrisati projekt?" onClose={() => setDeleting(null)}>
          <div className="space-y-3">
            <p>
              Projekt <b>{deleting.name}</b> bit će trajno obrisan. Ovo se ne može poništiti.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setDeleting(null)}>
                Odustani
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await deleteProject(deleting.id);
                  setDeleting(null);
                  await refresh();
                }}
              >
                Obriši
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {renaming && (
        <Dialog title="Preimenuj projekt" onClose={() => setRenaming(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get('name') ?? '').trim();
              if (value) {
                await renameProject(renaming.id, value);
                setRenaming(null);
                await refresh();
              }
            }}
          >
            <input name="name" className="field" aria-label="Novi naziv" defaultValue={renaming.name} autoFocus />
            <button className="btn btn-primary w-full" type="submit">
              Spremi
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
