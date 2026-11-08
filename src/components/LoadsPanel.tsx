import React, { useState } from 'react';
import { GripVertical, Plus, Trash2, Wand2, X } from 'lucide-react';
import { APPLIANCE_CATALOG_TEMPLATES, ELEMENT_CATALOG, WALL_META } from '../data/presets';
import { formatNumber, parseDecimal } from '../engine/geometry';
import {
  addApplianceFromTemplate,
  addCircuit,
  addCustomAppliance,
  assignAppliance,
  deleteAppliance,
  deleteCircuit,
  updateCircuit,
} from '../engine/projectOps';
import {
  ApplianceItem,
  CircuitAnalysis,
  ElectricalCircuit,
  ElectricalNode,
  ProjectData,
  SocketBalanceSummary,
} from '../types/electrical';
import { applianceIcon } from './applianceIcons';
import { CollapsibleSection } from './ui';

type Apply = (update: (data: ProjectData) => ProjectData) => void;

export function socketSlots(node: ElectricalNode, appliances: ApplianceItem[]) {
  const total = ELEMENT_CATALOG[node.category]?.outletsProvided ?? 0;
  const used = appliances.filter((a) => a.assignedNodeId === node.id).length;
  return { total, used, free: total - used };
}

const sockedLabel = (s: ElectricalNode) =>
  `${s.label.split(' ')[0]} · ${s.surface === 'ceiling' ? 'Strop' : WALL_META[s.surface].short}`;

function SocketSelect({
  app,
  sockets,
  appliances,
  onAssign,
}: {
  app: ApplianceItem;
  sockets: ElectricalNode[];
  appliances: ApplianceItem[];
  onAssign: (socketId: string | undefined) => void;
}) {
  return (
    <select
      className="field"
      aria-label={`Utičnica za ${app.name}`}
      value={app.assignedNodeId ?? ''}
      onChange={(e) => onAssign(e.target.value || undefined)}
    >
      <option value="">Odaberi utičnicu…</option>
      {sockets.map((s) => {
        const { free, total, used } = socketSlots(s, appliances);
        const isCurrent = s.id === app.assignedNodeId;
        return (
          <option key={s.id} value={s.id} disabled={free <= 0 && !isCurrent}>
            {sockedLabel(s)} ({used}/{total})
          </option>
        );
      })}
    </select>
  );
}

export function LoadsPanel({
  data,
  apply,
  circuitAnalyses,
  socketBalance,
  onStartApplianceDrag,
  onAutoAdapt,
}: {
  data: ProjectData;
  apply: Apply;
  circuitAnalyses: CircuitAnalysis[];
  socketBalance: SocketBalanceSummary;
  onStartApplianceDrag: (app: ApplianceItem, e: React.PointerEvent) => void;
  onAutoAdapt: () => void;
}) {
  const { appliances, circuits, nodes } = data;
  const [name, setName] = useState('');
  const [watts, setWatts] = useState('1500');
  const [wattsError, setWattsError] = useState<string | null>(null);
  const sockets = nodes.filter((n) => n.category.startsWith('socket_'));
  const outlets =
    socketBalance.totalAvailableOutlets1P + socketBalance.totalAvailableOutlets3P;
  const nodeExists = (id?: string) => Boolean(id && nodes.some((n) => n.id === id));
  const unassigned = appliances.filter((a) => !nodeExists(a.assignedNodeId));

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseDecimal(watts);
    if (value === null || value <= 0) {
      setWattsError('Upiši snagu u vatima.');
      return;
    }
    if (!name.trim()) return;
    setWattsError(null);
    apply((d) => addCustomAppliance(d, name.trim(), value));
    setName('');
  };

  const assign = (applianceId: string, socketId: string | undefined) =>
    apply((d) => assignAppliance(d, applianceId, socketId));

  return (
    <div className="space-y-2">
      <CollapsibleSection
        id="trosila-bilanca"
        title="Utičnice i trošila"
        summary={`${appliances.length} / ${outlets}`}
      >
        {!socketBalance.isBalanced && (
          <p className="text-[12px] font-semibold text-err">
            Nedostaje utičnica: {socketBalance.missingOutlets1P + socketBalance.missingOutlets3P}.
          </p>
        )}
        <button className="btn w-full" onClick={onAutoAdapt}>
          <Wand2 className="w-4 h-4" /> Automatski prilagodi mrežu
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        id="trosila-nedodijeljena"
        title="Nedodijeljena trošila"
        summary={String(unassigned.length)}
      >
        {unassigned.length === 0 ? (
          <p className="text-[12px] text-muted">Sva trošila imaju utičnicu.</p>
        ) : (
          <p className="text-[12px] text-muted">Povuci trošilo na utičnicu na nacrtu ili je odaberi.</p>
        )}
        {unassigned.map((app) => {
          const Icon = applianceIcon(app);
          return (
            <div key={app.id} className="bg-paper border border-line rounded p-2 space-y-1.5">
              <div
                className="flex items-center gap-1.5 cursor-grab select-none"
                style={{ touchAction: 'pan-y' }}
                data-testid={`trosilo-${app.name}`}
                onPointerDown={(e) => onStartApplianceDrag(app, e)}
              >
                <GripVertical className="w-3.5 h-3.5 text-muted shrink-0" />
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 min-w-0 truncate font-semibold">{app.name}</span>
                <span className="tabular-nums text-muted">{app.powerWatts} W</span>
                <button
                  className="icon-btn"
                  aria-label={`Obriši ${app.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => apply((d) => deleteAppliance(d, app.id))}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <SocketSelect
                app={app}
                sockets={sockets}
                appliances={appliances}
                onAssign={(socketId) => assign(app.id, socketId)}
              />
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection id="trosila-dodaj" title="Dodaj uređaj">
        <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
          {APPLIANCE_CATALOG_TEMPLATES.map((tpl) => {
            const Icon = applianceIcon(tpl);
            return (
              <button
                key={tpl.name}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-paper border border-line rounded text-left hover:border-ink"
                onClick={() => apply((d) => addApplianceFromTemplate(d, tpl))}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 min-w-0 truncate">{tpl.name}</span>
                <span className="tabular-nums text-muted shrink-0">{tpl.powerWatts} W</span>
              </button>
            );
          })}
        </div>
        <form onSubmit={submitCustom} className="flex gap-1.5 pt-1">
          <input
            className="field flex-1 min-w-0"
            placeholder="Vlastiti uređaj"
            aria-label="Naziv vlastitog uređaja"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field tabular-nums"
            style={{ width: 72 }}
            aria-label="Snaga u vatima"
            inputMode="numeric"
            value={watts}
            aria-invalid={wattsError ? true : undefined}
            onChange={(e) => setWatts(e.target.value)}
          />
          <button className="btn" type="submit" aria-label="Dodaj vlastiti uređaj">
            <Plus className="w-4 h-4" />
          </button>
        </form>
        {wattsError && <p role="alert" className="text-[12px] font-medium text-err">{wattsError}</p>}
      </CollapsibleSection>

      <CollapsibleSection
        id="trosila-krugovi"
        title="Strujni krugovi"
        summary={String(circuitAnalyses.length)}
        action={
          <button className="btn" aria-label="Novi krug" onClick={() => apply(addCircuit)}>
            <Plus className="w-4 h-4" />
          </button>
        }
      >
        {circuitAnalyses.map((ca) => (
          <CircuitCard
            key={ca.circuit.id}
            analysis={ca}
            canDelete={circuits.length > 1}
            nodes={nodes}
            onChange={(patch) => apply((d) => updateCircuit(d, ca.circuit.id, patch))}
            onDelete={() => apply((d) => deleteCircuit(d, ca.circuit.id))}
            onUnassign={(id) => assign(id, undefined)}
          />
        ))}
      </CollapsibleSection>
    </div>
  );
}

function CircuitCard({
  analysis,
  canDelete,
  nodes,
  onChange,
  onDelete,
  onUnassign,
}: {
  analysis: CircuitAnalysis;
  canDelete: boolean;
  nodes: ElectricalNode[];
  onChange: (patch: Partial<ElectricalCircuit>) => void;
  onDelete: () => void;
  onUnassign: (applianceId: string) => void;
}) {
  const { circuit, status, utilizationPercent, totalPowerWatts, assignedAppliances } = analysis;
  const barColor =
    status === 'overload' ? 'bg-err' : status === 'warning' ? 'bg-warn' : 'bg-ok';
  const placed = assignedAppliances.filter((a) => nodes.some((n) => n.id === a.assignedNodeId));
  return (
    <div className="bg-paper border border-line rounded p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className="px-1.5 py-0.5 rounded text-[12px] font-bold text-white"
          style={{ backgroundColor: circuit.color }}
        >
          {circuit.code}
        </span>
        <input
          className="field flex-1 min-w-0"
          aria-label={`Naziv kruga ${circuit.code}`}
          value={circuit.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button
          className="icon-btn"
          aria-label={`Obriši krug ${circuit.code}`}
          disabled={!canDelete}
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <select
          className="field"
          aria-label={`Karakteristika osigurača ${circuit.code}`}
          value={circuit.breakerCurve}
          onChange={(e) => onChange({ breakerCurve: e.target.value as 'B' | 'C' })}
        >
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <select
          className="field"
          aria-label={`Osigurač ${circuit.code}`}
          value={circuit.breakerAmps}
          onChange={(e) =>
            onChange({ breakerAmps: Number(e.target.value) as ElectricalCircuit['breakerAmps'] })
          }
        >
          {[10, 16, 20].map((a) => (
            <option key={a} value={a}>
              {a} A
            </option>
          ))}
        </select>
        <select
          className="field"
          aria-label={`Presjek ${circuit.code}`}
          value={circuit.cableCrossSection}
          onChange={(e) =>
            onChange({
              cableCrossSection: Number(e.target.value) as ElectricalCircuit['cableCrossSection'],
            })
          }
        >
          {[1.5, 2.5, 4].map((s) => (
            <option key={s} value={s}>
              {formatNumber(s, 1)} mm²
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between text-[12px] tabular-nums">
        <span>{totalPowerWatts} W</span>
        <span className="font-semibold">{formatNumber(utilizationPercent, 0)} %</span>
      </div>
      <div className="w-full h-2 bg-desk rounded-sm overflow-hidden">
        <div
          className={`h-full ${barColor}`}
          style={{ width: `${Math.min(100, utilizationPercent)}%` }}
        />
      </div>
      {placed.map((app) => {
        const Icon = applianceIcon(app);
        const socket = nodes.find((n) => n.id === app.assignedNodeId)!;
        return (
          <div key={app.id} className="flex items-center gap-1.5 text-[12px]">
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 min-w-0 truncate">{app.name}</span>
            <b className="shrink-0">{socket.label.split(' ')[0]}</b>
            <button
              aria-label={`Odvoji ${app.name}`}
              className="shrink-0 text-muted hover:text-ink"
              onClick={() => onUnassign(app.id)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
