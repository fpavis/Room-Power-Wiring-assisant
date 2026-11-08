import React, { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { WALL_META } from '../data/presets';
import { formatMeters } from '../engine/geometry';
import { addOpening, deleteOpening, getOutsideNodes, updateOpening } from '../engine/projectOps';
import { OpeningErrors, validateOpening, validateRoomField } from '../engine/validation';
import { OpeningType, ProjectData, RoomDimensions, WallId, WallOpening } from '../types/electrical';
import { NumberField } from './ui';

type Apply = (update: (data: ProjectData) => ProjectData) => void;

const WALLS: WallId[] = ['north', 'east', 'south', 'west'];
const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sillHeight: number }> = {
  door: { width: 0.9, height: 2.05, sillHeight: 0 },
  window: { width: 1.2, height: 1.3, sillHeight: 0.9 },
};

const nameOf = (type: OpeningType) => (type === 'door' ? 'Vrata' : 'Prozor');

function OpeningFields({
  value,
  room,
  errors,
  onChange,
}: {
  value: Pick<WallOpening, 'wall' | 'type' | 'offsetFromLeft' | 'width' | 'height' | 'sillHeight'>;
  room: RoomDimensions;
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

export function RoomPanel({ data, apply }: { data: ProjectData; apply: Apply }) {
  const { room, openings } = data;
  const [draft, setDraft] = useState<Omit<WallOpening, 'id' | 'label'>>({
    wall: 'north',
    type: 'window',
    offsetFromLeft: 0.5,
    ...OPENING_DEFAULTS.window,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const draftErrors = validateOpening(draft, room);
  const canAdd = Object.keys(draftErrors).length === 0;
  const outside = getOutsideNodes(data);

  const field = (key: keyof RoomDimensions, label: string) => (
    <NumberField
      label={label}
      value={room[key]}
      validate={(v) => validateRoomField(key, v)}
      onCommit={(v) => apply((d) => ({ ...d, room: { ...d.room, [key]: v } }))}
    />
  );

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="section-title">Dimenzije prostorije</h3>
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
      </section>

      <section className="space-y-2 pt-3 border-t border-line">
        <h3 className="section-title">Dodaj vrata ili prozor</h3>
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
          room={room}
          errors={draftErrors}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
        />
        <button
          className="btn w-full"
          disabled={!canAdd}
          onClick={() =>
            apply((d) => addOpening(d, { ...draft, label: nameOf(draft.type) }))
          }
        >
          <Plus className="w-4 h-4" /> Dodaj na zid
        </button>
      </section>

      <section className="space-y-1.5 pt-3 border-t border-line">
        <h3 className="section-title">Otvori ({openings.length})</h3>
        {openings.length === 0 && (
          <p className="text-[12px] text-muted">Još nema vrata ni prozora.</p>
        )}
        {openings.map((op) => {
          const errors = validateOpening(op, room);
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
                  room={room}
                  errors={errors}
                  onChange={(patch) => apply((d) => updateOpening(d, op.id, patch))}
                />
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
