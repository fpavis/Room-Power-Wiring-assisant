import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { WALL_META } from '../data/presets';
import { deleteFurniture, furnitureConflict, updateFurniture } from '../engine/furniture';
import { formatMeters } from '../engine/geometry';
import { addOpening, deleteOpening, getOutsideNodes, updateOpening } from '../engine/projectOps';
import { OpeningErrors, validateOpening, validateRoomField } from '../engine/validation';
import {
  FurnitureItem,
  OpeningType,
  ProjectData,
  RoomDimensions,
  SurfaceId,
  WallId,
  WallOpening,
} from '../types/electrical';
import { FurnitureAddMenu } from './FurnitureAddMenu';
import { CollapsibleSection, NumberField } from './ui';

type Apply = (update: (data: ProjectData) => ProjectData) => void;

const WALLS: WallId[] = ['north', 'east', 'south', 'west'];
const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sillHeight: number }> = {
  door: { width: 0.9, height: 2.05, sillHeight: 0 },
  window: { width: 1.2, height: 1.3, sillHeight: 0.9 },
};

const nameOf = (type: OpeningType) => (type === 'door' ? 'Vrata' : 'Prozor');

function OpeningFields({
  value,
  errors,
  onChange,
}: {
  value: Pick<WallOpening, 'wall' | 'type' | 'offsetFromLeft' | 'width' | 'height' | 'sillHeight'>;
  errors: OpeningErrors;
  onChange: (patch: Partial<WallOpening>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="Od lijevog kuta (m)"
        value={value.offsetFromLeft}
        error={errors.offsetFromLeft}
        onCommit={(offsetFromLeft) => onChange({ offsetFromLeft })}
      />
      <NumberField
        label="Širina (m)"
        value={value.width}
        error={errors.width}
        onCommit={(width) => onChange({ width })}
      />
      <NumberField
        label="Visina (m)"
        value={value.height}
        error={errors.height}
        onCommit={(height) => onChange({ height })}
      />
      {value.type === 'window' && (
        <NumberField
          label="Parapet od poda (m)"
          value={value.sillHeight}
          error={errors.sillHeight}
          onCommit={(sillHeight) => onChange({ sillHeight })}
        />
      )}
    </div>
  );
}

function AddOpeningMenu({
  data,
  apply,
  defaultWall,
}: {
  data: ProjectData;
  apply: Apply;
  defaultWall: WallId;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<WallOpening, 'id' | 'label'>>({
    wall: defaultWall,
    type: 'window',
    offsetFromLeft: 0.5,
    ...OPENING_DEFAULTS.window,
  });
  const errors = validateOpening(draft, data.room, data.furniture, data.nodes);

  if (!open) {
    return (
      <button
        className="btn w-full"
        onClick={() => {
          setDraft((d) => ({ ...d, wall: defaultWall }));
          setOpen(true);
        }}
      >
        <Plus className="w-4 h-4" /> Dodaj
      </button>
    );
  }

  return (
    <div className="p-2 bg-paper border border-ink rounded space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="nov-zid">Zid</label>
          <select
            id="nov-zid"
            className="field"
            value={draft.wall}
            onChange={(e) => setDraft({ ...draft, wall: e.target.value as WallId })}
          >
            {WALLS.map((w) => (
              <option key={w} value={w}>
                {WALL_META[w].name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="nov-tip">Vrsta</label>
          <select
            id="nov-tip"
            className="field"
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as OpeningType;
              setDraft({ ...draft, type, ...OPENING_DEFAULTS[type] });
            }}
          >
            <option value="window">Prozor</option>
            <option value="door">Vrata</option>
          </select>
        </div>
      </div>
      <OpeningFields
        value={draft}
        errors={errors}
        onChange={(patch) => setDraft({ ...draft, ...patch })}
      />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={() => setOpen(false)}>
          Odustani
        </button>
        <button
          className="btn btn-primary"
          disabled={Object.keys(errors).length > 0}
          onClick={() => {
            apply((d) => addOpening(d, { ...draft, label: nameOf(draft.type) }));
            setOpen(false);
          }}
        >
          Dodaj na zid
        </button>
      </div>
    </div>
  );
}

function FurnitureRow({ item, data, apply }: { item: FurnitureItem; data: ProjectData; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const check = (patch: Partial<FurnitureItem>) =>
    furnitureConflict({ ...item, ...patch }, data.room, data.furniture, data.openings, item.id);
  const invalid = check({}) !== null;
  const field = (key: 'offsetFromLeft' | 'bottom' | 'width' | 'height' | 'depth', label: string) => (
    <NumberField
      label={label}
      value={item[key]}
      validate={(value) => check({ [key]: value })}
      onCommit={(value) => apply((d) => updateFurniture(d, item.id, { [key]: value }))}
    />
  );
  return (
    <div className="bg-paper border border-line rounded p-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">
            {item.name} · {WALL_META[item.wall].short}
          </div>
          <div className={`text-[12px] tabular-nums ${invalid ? 'text-err font-semibold' : 'text-muted'}`}>
            {formatMeters(item.width)} × {formatMeters(item.height)} × {formatMeters(item.depth)} m
            {invalid ? ' · ne stane' : ''}
          </div>
        </div>
        <button className="icon-btn" aria-label={`Uredi ${item.name}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Pencil className="w-4 h-4" />
        </button>
        <button className="icon-btn" aria-label={`Obriši ${item.name}`} onClick={() => apply((d) => deleteFurniture(d, item.id))}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-2">
          {field('width', 'Širina elementa (m)')}
          {field('height', 'Visina elementa (m)')}
          {field('depth', 'Dubina elementa (m)')}
          {field('offsetFromLeft', 'Element od kuta (m)')}
          {field('bottom', 'Element od poda (m)')}
        </div>
      )}
    </div>
  );
}

export function RoomPanel({
  data,
  apply,
  activeSurface,
}: {
  data: ProjectData;
  apply: Apply;
  activeSurface: SurfaceId;
}) {
  const { room, openings, furniture } = data;
  const [editingId, setEditingId] = useState<string | null>(null);
  const outside = getOutsideNodes(data);
  const defaultWall: WallId = activeSurface === 'ceiling' ? 'north' : activeSurface;

  const field = (key: keyof RoomDimensions, label: string) => (
    <NumberField
      label={label}
      value={room[key]}
      validate={(v) => validateRoomField(key, v)}
      onCommit={(v) => apply((d) => ({ ...d, room: { ...d.room, [key]: v } }))}
    />
  );

  return (
    <div className="space-y-2">
      <CollapsibleSection
        id="prostorija-dimenzije"
        title="Dimenzije"
        summary={`${formatMeters(room.length)} × ${formatMeters(room.width)} × ${formatMeters(room.height)} m`}
      >
        <div className="grid grid-cols-3 gap-2">
          {field('length', 'Dužina (m)')}
          {field('width', 'Širina (m)')}
          {field('height', 'Visina (m)')}
        </div>
        <p className="text-[12px] text-muted">
          Dužina je zid sjever–jug, širina zid istok–zapad.
        </p>
        {outside.length > 0 && (
          <p role="status" className="text-[12px] font-semibold text-err">
            {outside.length} {outside.length === 1 ? 'element je' : 'elemenata je'} izvan zida.
            Riješi u koraku Provjera i ispis.
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="prostorija-otvori"
        title="Vrata i prozori"
        summary={String(openings.length)}
      >
        <AddOpeningMenu data={data} apply={apply} defaultWall={defaultWall} />
        {openings.length > 0 && (
          <p className="text-[12px] text-muted">
            Povuci vrata ili prozor na nacrtu. Otvor se sam zaključa na dobroj poziciji.
          </p>
        )}
        {openings.map((op) => {
          const errors = validateOpening(op, room, furniture, data.nodes);
          const invalid = Object.keys(errors).length > 0;
          const isEditing = editingId === op.id;
          return (
            <div key={op.id} className="bg-paper border border-line rounded p-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {nameOf(op.type)} · {WALL_META[op.wall].short}
                  </div>
                  <div className={`text-[12px] tabular-nums ${invalid ? 'text-err font-semibold' : 'text-muted'}`}>
                    {formatMeters(op.width)} × {formatMeters(op.height)} m
                    {invalid ? ' · ne stane na zid' : ''}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Uredi ${nameOf(op.type)} ${WALL_META[op.wall].short}`}
                  aria-expanded={isEditing}
                  onClick={() => setEditingId(isEditing ? null : op.id)}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Obriši ${nameOf(op.type)} ${WALL_META[op.wall].short}`}
                  onClick={() => apply((d) => deleteOpening(d, op.id))}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {isEditing && (
                <OpeningFields
                  value={op}
                  errors={errors}
                  onChange={(patch) => apply((d) => updateOpening(d, op.id, patch))}
                />
              )}
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection
        id="prostorija-namjestaj"
        title="Namještaj"
        summary={String(furniture.length)}
      >
        <FurnitureAddMenu data={data} apply={apply} defaultWall={defaultWall} />
        {furniture.length > 0 && (
          <p className="text-[12px] text-muted">
            Samo za orijentaciju pri planiranju utičnica. Povuci na nacrtu, elementi se sami spajaju.
          </p>
        )}
        {furniture.map((item) => (
          <FurnitureRow key={item.id} item={item} data={data} apply={apply} />
        ))}
      </CollapsibleSection>
    </div>
  );
}
