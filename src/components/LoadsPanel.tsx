import React, { useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { APPLIANCE_CATALOG_TEMPLATES, WALL_META } from '../data/presets';
import { formatNumber, parseDecimal } from '../engine/geometry';
import {
  addApplianceFromTemplate,
  addCircuit,
  addCustomAppliance,
  assignAppliance,
  autoAdaptNetwork,
  deleteAppliance,
  deleteCircuit,
  updateCircuit,
} from '../engine/projectOps';
import {
  CircuitAnalysis,
  ElectricalCircuit,
  ProjectData,
  SocketBalanceSummary,
} from '../types/electrical';

type Apply = (update: (data: ProjectData) => ProjectData) => void;

export function LoadsPanel({
  data,
  apply,
  circuitAnalyses,
  socketBalance,
  notify,
}: {
  data: ProjectData;
  apply: Apply;
  circuitAnalyses: CircuitAnalysis[];
  socketBalance: SocketBalanceSummary;
  notify: (message: string) => void;
}) {
  const { appliances, circuits, nodes } = data;
  const [name, setName] = useState('');
  const [watts, setWatts] = useState('1500');
  const [wattsError, setWattsError] = useState<string | null>(null);
  const sockets = nodes.filter((n) => n.category.startsWith('socket_'));
  const outlets =
    socketBalance.totalAvailableOutlets1P + socketBalance.totalAvailableOutlets3P;

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

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Utičnice i trošila</h3>
          <span className="font-semibold tabular-nums">
            {appliances.length} / {outlets}
          </span>
        </div>
        {!socketBalance.isBalanced && (
          <p className="text-[12px] font-semibold text-err">
            Nedostaje utičnica: {socketBalance.missingOutlets1P + socketBalance.missingOutlets3P}.
          </p>
        )}
        <button
          className="btn w-full"
          onClick={() =>
            apply((d) => {
              const result = autoAdaptNetwork(d);
              if (result.unplaced > 0) {
                notify(`Nema slobodnog mjesta za ${result.unplaced} utičnica.`);
              }
              return result.data;
            })
          }
        >
          <Wand2 className="w-4 h-4" /> Automatski prilagodi mrežu
        </button>
      </section>

      <section className="space-y-1.5 pt-3 border-t border-line">
        <h3 className="section-title">Dodaj uređaj</h3>
        <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
          {APPLIANCE_CATALOG_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-paper border border-line rounded text-left hover:border-ink"
              onClick={() => apply((d) => addApplianceFromTemplate(d, tpl))}
            >
              <span className="truncate">{tpl.name}</span>
              <span className="tabular-nums text-muted shrink-0">{tpl.powerWatts} W</span>
            </button>
          ))}
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
      </section>

      <section className="space-y-1.5 pt-3 border-t border-line">
        <h3 className="section-title">Trošila ({appliances.length})</h3>
        {appliances.length === 0 && (
          <p className="text-[12px] text-muted">Još nema trošila.</p>
        )}
        {appliances.map((app) => (
          <div key={app.id} className="bg-paper border border-line rounded p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate font-semibold">{app.name}</span>
              <span className="tabular-nums text-muted">{app.powerWatts} W</span>
              <button
                className="icon-btn"
                aria-label={`Obriši ${app.name}`}
                onClick={() => apply((d) => deleteAppliance(d, app.id))}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <select
              className="field"
              aria-label={`Utičnica za ${app.name}`}
              value={app.assignedNodeId ?? ''}
              onChange={(e) =>
                apply((d) => assignAppliance(d, app.id, e.target.value || undefined))
              }
            >
              <option value="">Nije vezano uz utičnicu</option>
              {sockets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.surface === 'ceiling' ? 'Strop' : WALL_META[s.surface].short}
                </option>
              ))}
            </select>
          </div>
        ))}
      </section>

      <section className="space-y-1.5 pt-3 border-t border-line">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Strujni krugovi</h3>
          <button className="btn" onClick={() => apply(addCircuit)}>
            <Plus className="w-4 h-4" /> Novi krug
          </button>
        </div>
        {circuitAnalyses.map((ca) => (
          <CircuitRow
            key={ca.circuit.id}
            analysis={ca}
            canDelete={circuits.length > 1}
            onChange={(patch) => apply((d) => updateCircuit(d, ca.circuit.id, patch))}
            onDelete={() => apply((d) => deleteCircuit(d, ca.circuit.id))}
          />
        ))}
      </section>
    </div>
  );
}

function CircuitRow({
  analysis,
  canDelete,
  onChange,
  onDelete,
}: {
  analysis: CircuitAnalysis;
  canDelete: boolean;
  onChange: (patch: Partial<ElectricalCircuit>) => void;
  onDelete: () => void;
}) {
  const { circuit, status, utilizationPercent, totalPowerWatts } = analysis;
  const barColor =
    status === 'overload' ? 'bg-err' : status === 'warning' ? 'bg-warn' : 'bg-ok';
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
    </div>
  );
}
