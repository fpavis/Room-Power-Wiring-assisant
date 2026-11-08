import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { WALL_META } from '../data/presets';
import {
  addFurniture,
  CatalogFurniture,
  FURNITURE_CATALOG,
  FURNITURE_ROOMS,
} from '../engine/furniture';
import { ProjectData, WallId } from '../types/electrical';
import { CollapsibleSection, NumberField } from './ui';

type Apply = (update: (data: ProjectData) => ProjectData) => void;

const WALLS: WallId[] = ['north', 'east', 'south', 'west'];
const positive = (value: number) => (value > 0 ? null : 'Upiši vrijednost veću od 0.');
const notNegative = (value: number) => (value >= 0 ? null : 'Ne može biti negativno.');
const cm = (meters: number) => Math.round(meters * 100);

/** Add flow: choose from the catalog, adjust, confirm. */
export function FurnitureAddMenu({
  data,
  apply,
  defaultWall,
}: {
  data: ProjectData;
  apply: Apply;
  defaultWall: WallId;
}) {
  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState<string>(FURNITURE_ROOMS[0]);
  const [wall, setWall] = useState<WallId>(defaultWall);
  const [selected, setSelected] = useState<CatalogFurniture | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        className="btn w-full"
        onClick={() => {
          setWall(defaultWall);
          setSelected(null);
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" /> Dodaj novi element
      </button>
    );
  }

  const confirm = (keepOpen: boolean) => {
    if (!selected) return;
    const next = addFurniture(data, selected, wall);
    if (!next) {
      setError(`Na zidu ${WALL_META[wall].short} nema mjesta za ovaj element.`);
      return;
    }
    apply(() => next);
    setError(null);
    setSelected(null);
    if (!keepOpen) setOpen(false);
  };

  if (selected) {
    const patch = (change: Partial<CatalogFurniture>) => {
      setError(null);
      setSelected({ ...selected, ...change });
    };
    return (
      <div className="p-2 bg-paper border border-ink rounded space-y-2">
        <div className="flex items-center justify-between gap-2">
          <b className="truncate">{selected.name}</b>
          <button className="text-[12px] font-semibold underline shrink-0" onClick={() => setSelected(null)}>
            Promijeni
          </button>
        </div>
        <div>
          <label className="label" htmlFor="namjestaj-zid">Zid elementa</label>
          <select
            id="namjestaj-zid"
            className="field"
            value={wall}
            onChange={(e) => {
              setError(null);
              setWall(e.target.value as WallId);
            }}
          >
            {WALLS.map((w) => (
              <option key={w} value={w}>
                {WALL_META[w].name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Širina" value={selected.width} validate={positive} onCommit={(width) => patch({ width })} />
          <NumberField label="Visina" value={selected.height} validate={positive} onCommit={(height) => patch({ height })} />
          <NumberField label="Dubina" value={selected.depth} validate={positive} onCommit={(depth) => patch({ depth })} />
          <NumberField label="Od poda" value={selected.bottom} validate={notNegative} onCommit={(bottom) => patch({ bottom })} />
        </div>
        {error && (
          <p role="alert" className="text-[12px] font-medium text-err">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" onClick={() => setOpen(false)}>
            Odustani
          </button>
          <button className="btn btn-primary" onClick={() => confirm(false)}>
            Dodaj element
          </button>
        </div>
        <button className="btn w-full" onClick={() => confirm(true)}>
          Dodaj i nastavi
        </button>
      </div>
    );
  }

  const inRoom = FURNITURE_CATALOG.filter((item) => item.room === room);
  const groups = [...new Set(inRoom.map((item) => item.group))];

  return (
    <div className="p-2 bg-paper border border-ink rounded space-y-2">
      <div className="flex gap-1">
        {FURNITURE_ROOMS.map((name) => (
          <button
            key={name}
            aria-pressed={room === name}
            className={`flex-1 px-1 py-1.5 rounded-sm text-[12px] font-semibold ${
              room === name ? 'bg-ink text-paper' : 'bg-panel text-ink border border-line'
            }`}
            onClick={() => setRoom(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
        {groups.map((group) => {
          const items = inRoom.filter((item) => item.group === group);
          return (
            <CollapsibleSection
              key={group}
              id={`katalog-${group}`}
              title={group}
              summary={String(items.length)}
            >
              <div className="space-y-1">
                {items.map((item) => (
                  <button
                    key={item.name}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-paper border border-line rounded text-left hover:border-ink"
                    onClick={() => setSelected(item)}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="tabular-nums text-[12px] text-muted shrink-0">
                      {cm(item.width)} × {cm(item.height)} × {cm(item.depth)}
                    </span>
                  </button>
                ))}
              </div>
            </CollapsibleSection>
          );
        })}
      </div>
      <button className="btn w-full" onClick={() => setOpen(false)}>
        Odustani
      </button>
    </div>
  );
}
