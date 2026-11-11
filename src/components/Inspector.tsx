import React from 'react';
import { Plus, Server, Trash2, X, Zap } from 'lucide-react';
import { ELEMENT_CATALOG, WALL_META } from '../data/presets';
import {
  getSurfaceSize,
  isPointInsideOpening,
  resolveNodeParentBox,
} from '../engine/electricalEngine';
import { formatMeters, isNodeOutsideSurface } from '../engine/geometry';
import {
  deleteNode,
  groupDevicesUnderNewBox,
  moveNode,
  moveNodeInside,
  updateNode,
} from '../engine/projectOps';
import { CircuitAnalysis, ElectricalNode, ProjectData } from '../types/electrical';
import { APPLIANCE_CATALOG_TEMPLATES } from '../data/presets';
import { addApplianceFromTemplate, assignAppliance } from '../engine/projectOps';
import { applianceIcon } from './applianceIcons';
import { socketSlots } from './LoadsPanel';
import { NumberField, PanelHeader } from './ui';

type Apply = (update: (data: ProjectData) => ProjectData) => void;

export function Inspector({
  node,
  data,
  apply,
  circuitAnalyses,
  onClose,
  onSelect,
  onShowWiring,
  onShowBoard,
}: {
  node: ElectricalNode;
  data: ProjectData;
  apply: Apply;
  circuitAnalyses: CircuitAnalysis[];
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onShowWiring: () => void;
  onShowBoard: () => void;
}) {
  const { room, openings, nodes, circuits } = data;
  const size = getSurfaceSize(node.surface, room);
  const isBoard = node.category === 'distribution_board';
  const isBox = node.category === 'junction_box';
  const parent = resolveNodeParentBox(node, nodes, circuits);
  const outside = isNodeOutsideSurface(node, room);

  const position = (x: number, y: number) =>
    apply((d) => moveNode(d, node.id, node.surface, x, y));

  const limit = (max: number) => (v: number) =>
    v < 0 || v > max ? `Upiši vrijednost od 0,00 do ${formatMeters(max)} m.` : null;
  const clear = (x: number, y: number) => {
    const opening = isPointInsideOpening(node.surface, x, y, openings, 0.05);
    return opening ? `Položaj je preko otvora: ${opening.label}.` : null;
  };
  const check = (max: number, toPoint: (v: number) => [number, number]) => (v: number) =>
    limit(max)(v) ?? clear(...toPoint(v));

  return (
    <div className="space-y-3">
      <div>
        <PanelHeader title="Odabrano" onClose={onClose} />
        <input
          className="field mt-1 font-semibold"
          aria-label="Naziv elementa"
          value={node.label}
          onChange={(e) => apply((d) => updateNode(d, node.id, { label: e.target.value }))}
        />
        <p className="mt-1 text-[12px] text-muted">
          {ELEMENT_CATALOG[node.category].name} ·{' '}
          {node.surface === 'ceiling' ? 'Strop' : WALL_META[node.surface].name}
        </p>
      </div>

      {outside && (
        <div className="p-2 border border-err rounded space-y-2">
          <p role="status" className="text-[12px] font-semibold text-err">
            Element je izvan plohe.
          </p>
          <button className="btn w-full" onClick={() => apply((d) => moveNodeInside(d, node.id))}>
            Premjesti unutar plohe
          </button>
        </div>
      )}

      {node.surface === 'ceiling' ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Od zapada (m)"
            value={node.x}
            validate={limit(size.width)}
            onCommit={(x) => position(x, node.y)}
          />
          <NumberField
            label="Od juga (m)"
            value={node.y}
            validate={limit(size.height)}
            onCommit={(y) => position(node.x, y)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Od poda (m)"
            value={node.y}
            validate={check(size.height, (v) => [node.x, v])}
            onCommit={(y) => position(node.x, y)}
          />
          <NumberField
            label="Od stropa (m)"
            value={Number((room.height - node.y).toFixed(3))}
            validate={check(size.height, (v) => [node.x, room.height - v])}
            onCommit={(v) => position(node.x, room.height - v)}
          />
          <NumberField
            label="Od kuta (m)"
            value={node.x}
            validate={check(size.width, (v) => [v, node.y])}
            onCommit={(x) => position(x, node.y)}
          />
        </div>
      )}

      {!isBoard && (
        <div>
          <label className="label" htmlFor="krug-elementa">Strujni krug</label>
          <select
            id="krug-elementa"
            className="field"
            value={node.circuitId}
            onChange={(e) =>
              apply((d) => {
                const box = d.nodes.find((n) => n.id === node.parentBoxId);
                const keepsBox = box?.category !== 'junction_box' || box.circuitId === e.target.value;
                return updateNode(d, node.id, {
                  circuitId: e.target.value,
                  parentBoxId: keepsBox ? node.parentBoxId : d.nodes.find((n) => n.category === 'distribution_board')?.id,
                });
              })
            }
          >
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name} ({c.breakerCurve}{c.breakerAmps})
              </option>
            ))}
          </select>
        </div>
      )}

      {node.category.startsWith('socket_') && (() => {
        const { total, used, free } = socketSlots(node, data.appliances);
        const onSocket = data.appliances.filter((a) => a.assignedNodeId === node.id);
        const unassigned = data.appliances.filter(
          (a) => !a.assignedNodeId || !nodes.some((n) => n.id === a.assignedNodeId)
        );
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="section-title">Trošila</span>
              <b className="tabular-nums">
                {used}/{total}
              </b>
            </div>
            {onSocket.map((app) => {
              const Icon = applianceIcon(app);
              return (
                <div key={app.id} className="flex items-center gap-1.5 p-1.5 bg-paper border border-line rounded">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{app.name}</span>
                  <button
                    aria-label={`Odvoji ${app.name}`}
                    className="text-muted hover:text-ink shrink-0"
                    onClick={() => apply((d) => assignAppliance(d, app.id, undefined))}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {free > 0 && (
              <select
                className="field"
                aria-label="Dodaj trošilo na utičnicu"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.startsWith('tpl:')) {
                    const template = APPLIANCE_CATALOG_TEMPLATES[Number(value.slice(4))];
                    apply((d) => {
                      const next = addApplianceFromTemplate(d, template);
                      return assignAppliance(next, next.appliances[next.appliances.length - 1].id, node.id);
                    });
                  } else if (value) {
                    apply((d) => assignAppliance(d, value, node.id));
                  }
                }}
              >
                <option value="">Dodaj trošilo…</option>
                {unassigned.length > 0 && (
                  <optgroup label="Nedodijeljena">
                    {unassigned.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.powerWatts} W)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Iz kataloga">
                  {APPLIANCE_CATALOG_TEMPLATES.map((t, i) => (
                    <option key={t.name} value={`tpl:${i}`}>
                      {t.name} ({t.powerWatts} W)
                    </option>
                  ))}
                </optgroup>
              </select>
            )}
          </div>
        );
      })()}

      {isBoard && (
        <div className="space-y-1">
          <div className="section-title">Osigurači u ormaru ({circuits.length})</div>
          {circuitAnalyses.map((ca) => (
            <div key={ca.circuit.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate">
                {ca.circuit.code} · {ca.circuit.breakerCurve}{ca.circuit.breakerAmps}
              </span>
              <span className="tabular-nums text-muted shrink-0">{ca.totalPowerWatts} W</span>
            </div>
          ))}
        </div>
      )}

      {isBox && (
        <div className="space-y-1">
          <div className="section-title">Uređaji iz ove kutije</div>
          {nodes
            .filter(
              (n) =>
                n.category !== 'distribution_board' &&
                n.category !== 'junction_box' &&
                n.circuitId === node.circuitId
            )
            .map((device) => {
              const attached = resolveNodeParentBox(device, nodes, circuits)?.id === node.id;
              const mainRo = nodes.find((n) => n.category === 'distribution_board');
              return (
                <label key={device.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attached}
                    onChange={(e) =>
                      apply((d) =>
                        updateNode(d, device.id, {
                          parentBoxId: e.target.checked ? node.id : mainRo?.id,
                        })
                      )
                    }
                  />
                  <span className="truncate">{device.label}</span>
                </label>
              );
            })}
        </div>
      )}

      {!isBoard && !isBox && (
        <div className="space-y-2">
          <div>
            <label className="label" htmlFor="izvor-elementa">Napajanje</label>
            <select
              id="izvor-elementa"
              className="field"
              value={parent?.id ?? ''}
              onChange={(e) => {
                const box = nodes.find((n) => n.id === e.target.value);
                apply((d) =>
                  updateNode(d, node.id, {
                    parentBoxId: e.target.value || undefined,
                    circuitId:
                      box?.category === 'junction_box' ? box.circuitId : node.circuitId,
                  })
                );
              }}
            >
              {nodes
                .filter((n) => n.category === 'distribution_board' || n.category === 'junction_box')
                .map((box) => (
                  <option key={box.id} value={box.id}>
                    {box.category === 'distribution_board' ? 'Direktno iz' : 'Preko'}{' '}
                    {box.label.split(' ')[0]}
                  </option>
                ))}
            </select>
          </div>
          <button
            className="btn w-full"
            onClick={() =>
              apply((d) => {
                const result = groupDevicesUnderNewBox(d, node.circuitId, node.surface);
                return result?.data ?? d;
              })
            }
          >
            <Plus className="w-4 h-4" /> Dodaj razvodnu kutiju
          </button>
        </div>
      )}

      {isBoard ? (
        <button className="btn btn-primary w-full" onClick={onShowBoard}>
          <Server className="w-4 h-4" /> Prikaži razvodni ormar
        </button>
      ) : (
        <button className="btn btn-primary w-full" onClick={onShowWiring}>
          <Zap className="w-4 h-4" /> Spajanje L, N, PE
        </button>
      )}
      <button
        className="btn btn-danger w-full"
        onClick={() => {
          apply((d) => deleteNode(d, node.id));
          onSelect(null);
        }}
      >
        <Trash2 className="w-4 h-4" /> Obriši element
      </button>
    </div>
  );
}
