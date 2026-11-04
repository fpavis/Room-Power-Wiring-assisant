import React from 'react';
import { X, Printer, Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ELEMENT_CATALOG, WALL_META } from '../data/presets';
import {
  ApplianceItem,
  BomSummary,
  CircuitAnalysis,
  ElectricalNode,
  ElementCategory,
  RoomDimensions,
  SocketBalanceSummary,
} from '../types/electrical';

interface BomAndPrintModalProps {
  room: RoomDimensions;
  nodes: ElectricalNode[];
  appliances: ApplianceItem[];
  circuitAnalyses: CircuitAnalysis[];
  socketBalance: SocketBalanceSummary;
  bom: BomSummary;
  onClose: () => void;
  onExportJson: () => void;
}

export const BomAndPrintModal: React.FC<BomAndPrintModalProps> = ({
  room,
  nodes,
  appliances,
  circuitAnalyses,
  socketBalance,
  bom,
  onClose,
  onExportJson,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-6xl bg-[#0F172A] border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#111827] border-b border-slate-800 no-print">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-sky-400" />
              Tehnička dokumentacija, Kote instalacija i Troškovnik materijala (BOM)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Prostorija: {room.length.toFixed(2)} m × {room.width.toFixed(2)} m × Visina{' '}
              {room.height.toFixed(2)} m (Površina:{' '}
              {(room.length * room.width).toFixed(2)} m²)
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onExportJson}
              className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              Izvezi JSON nacrt
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Ispis / PDF za majstore
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-200">
          {/* Top Engineering Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Dimenzije prostorije</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-1">
                {room.length.toFixed(2)} × {room.width.toFixed(2)} × {room.height.toFixed(2)} m
              </div>
              <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                Tlocrt: {(room.length * room.width).toFixed(2)} m² · Opseg:{' '}
                {(2 * (room.length + room.width)).toFixed(2)} m
              </div>
            </div>

            <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Ukupna dužina kabela i bužira</div>
              <div className="text-lg font-bold font-mono tabular-nums text-sky-400 mt-1">
                {bom.totalEstimatedLengthMeters.toFixed(2)} m
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Uključena rezerva +0.25m po kutiji
              </div>
            </div>

            <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Bilanca trošila i utičnica</div>
              <div className="flex items-center gap-2 mt-1">
                {socketBalance.isBalanced ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="text-lg font-bold font-mono tabular-nums text-slate-100">
                  {appliances.length} trošila / {socketBalance.totalAvailableOutlets1P + socketBalance.totalAvailableOutlets3P} mjesta
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {socketBalance.isBalanced
                  ? `Slobodno još ${socketBalance.freeOutlets1P} utičničnih mjesta`
                  : `Nedostaje ${socketBalance.missingOutlets1P} (1P) / ${socketBalance.missingOutlets3P} (3P) utičnica`}
              </div>
            </div>

            <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
              <div className="text-xs text-slate-400">Ukupna instalirana snaga</div>
              <div className="text-lg font-bold font-mono tabular-nums text-amber-400 mt-1">
                {(
                  circuitAnalyses.reduce((s, c) => s + c.totalPowerWatts, 0) / 1000
                ).toFixed(2)}{' '}
                kW
              </div>
              <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                {circuitAnalyses.length} strujnih krugova
              </div>
            </div>
          </div>

          {/* 1. Troškovnik Kabela, Bužira i Elemenata */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Kabeli */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-bold text-slate-200 pb-3 border-b border-slate-800">
                1. Instalacijski kabeli (po tipu i presjeku)
              </h3>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800/80">
                    <th className="text-left py-2 font-medium">Tip kabela</th>
                    <th className="text-right py-2 font-medium">Izračun</th>
                    <th className="text-right py-2 font-medium">+10% Rez.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                  {Object.entries(bom.cablesBySpec).map(([spec, meters]) => (
                    <tr key={spec}>
                      <td className="py-2 text-slate-200">{spec}</td>
                      <td className="py-2 text-right text-slate-300">
                        {meters.toFixed(2)} m
                      </td>
                      <td className="py-2 text-right font-bold text-sky-400">
                        {Math.ceil(meters * 1.1)} m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bužiri */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-bold text-slate-200 pb-3 border-b border-slate-800">
                2. Rebraste elektroinstalacijske cijevi (Bužiri)
              </h3>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800/80">
                    <th className="text-left py-2 font-medium">Promjer bužira</th>
                    <th className="text-right py-2 font-medium">Neto trasa</th>
                    <th className="text-right py-2 font-medium">Za nabavu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                  {Object.entries(bom.conduitsByDiameter)
                    .filter(([, m]) => m > 0)
                    .map(([diam, meters]) => (
                      <tr key={diam}>
                        <td className="py-2 text-slate-200">
                          Bužir Ø{diam} mm (CS)
                        </td>
                        <td className="py-2 text-right text-slate-300">
                          {meters.toFixed(2)} m
                        </td>
                        <td className="py-2 text-right font-bold text-emerald-400">
                          {Math.ceil(meters * 1.08)} m
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Utičnice, Prekidači, Kutije i Osigurači */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-bold text-slate-200 pb-3 border-b border-slate-800">
                3. Ugradbeni elementi, kutije i osigurači
              </h3>
              <div className="space-y-1.5 mt-2 text-xs font-mono tabular-nums">
                {(Object.keys(bom.countsByCategory) as ElementCategory[])
                  .filter((cat) => bom.countsByCategory[cat] > 0)
                  .map((cat) => (
                    <div
                      key={cat}
                      className="flex items-center justify-between py-1 border-b border-slate-800/60"
                    >
                      <span className="font-sans text-slate-300">
                        {ELEMENT_CATALOG[cat].name}
                      </span>
                      <span className="font-bold text-slate-100">
                        {bom.countsByCategory[cat]} kom
                      </span>
                    </div>
                  ))}
                {Object.entries(bom.breakersBySpec).map(([spec, cnt]) => (
                  <div
                    key={spec}
                    className="flex items-center justify-between py-1 border-b border-slate-800/60"
                  >
                    <span className="font-sans text-amber-300">{spec}</span>
                    <span className="font-bold text-amber-300">{cnt} kom</span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1">
                  <span className="font-sans text-slate-400">
                    WAGO 221 spojnice (3-polne / 5-polne)
                  </span>
                  <span className="font-bold text-slate-200">
                    ~{bom.wagoConnectorsCount} kom
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Tablica opterećenja po strujnim krugovima */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-200 pb-3 border-b border-slate-800">
              4. Pregled strujnih krugova, osigurača, bužira i priključenih trošila
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-left py-2.5 px-2">Oznaka i naziv kruga</th>
                    <th className="text-left py-2.5 px-2">Zaštita & Kabel</th>
                    <th className="text-right py-2.5 px-2">Snaga P (W)</th>
                    <th className="text-right py-2.5 px-2">Struja I (A)</th>
                    <th className="text-right py-2.5 px-2">Opterećenje</th>
                    <th className="text-right py-2.5 px-2">Dužina kabela</th>
                    <th className="text-left py-2.5 px-2">Trošila na krugu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {circuitAnalyses.map((ca) => (
                    <tr key={ca.circuit.id}>
                      <td className="py-2.5 px-2 font-sans">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: ca.circuit.color }}
                          />
                          <span className="font-bold text-slate-100">
                            {ca.circuit.code}
                          </span>
                          <span className="text-slate-300">{ca.circuit.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-300">
                        {ca.circuit.breakerCurve}
                        {ca.circuit.breakerAmps}A · {ca.circuit.cableCrossSection.toFixed(1)} mm²
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-slate-200">
                        {ca.totalPowerWatts} W
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-200">
                        {ca.currentAmps.toFixed(2)} A
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span
                          className={
                            ca.status === 'overload'
                              ? 'text-rose-400 font-bold'
                              : ca.status === 'warning'
                              ? 'text-amber-400 font-semibold'
                              : 'text-emerald-400'
                          }
                        >
                          {ca.utilizationPercent}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-sky-400 font-semibold">
                        {ca.totalCableLengthMeters.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-2 font-sans text-slate-400">
                        {ca.assignedAppliances.length > 0
                          ? ca.assignedAppliances.map((a) => a.name).join(', ')
                          : ca.lightsCount > 0
                          ? `${ca.lightsCount} rasvjetnih mjesta`
                          : 'Rezervne utičnice'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Tablica svih ugradbenih točaka s točnim kotama od poda, stropa i kuta */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-200 pb-3 border-b border-slate-800">
              5. Kote ugradnje elemenata za izvedbu na gradilištu (Zid / Strop, Kote od poda i stropa)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-left py-2 px-2">Oznaka</th>
                    <th className="text-left py-2 px-2">Tip elementa</th>
                    <th className="text-left py-2 px-2">Ploha (Zid / Strop)</th>
                    <th className="text-right py-2 px-2">↔ Od lijevog kuta</th>
                    <th className="text-right py-2 px-2">↕ Kota od poda</th>
                    <th className="text-right py-2 px-2">↕ Kota od stropa</th>
                    <th className="text-left py-2 px-2">Dodijeljeno trošilo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                  {nodes.map((n) => {
                    const kotaPoda = n.surface === 'ceiling' ? room.height : n.y;
                    const kotaStropa =
                      n.surface === 'ceiling'
                        ? 0
                        : Number((room.height - n.y).toFixed(2));
                    const apps = appliances.filter((a) => a.assignedNodeId === n.id);
                    return (
                      <tr key={n.id}>
                        <td className="py-2 px-2 font-bold text-slate-100 font-sans">
                          {n.label}
                        </td>
                        <td className="py-2 px-2 font-sans text-slate-300">
                          {ELEMENT_CATALOG[n.category]?.name}
                        </td>
                        <td className="py-2 px-2 font-sans text-sky-400">
                          {n.surface === 'ceiling'
                            ? 'Strop'
                            : WALL_META[n.surface].name}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-200">
                          {n.x.toFixed(2)} m
                        </td>
                        <td className="py-2 px-2 text-right text-emerald-400 font-semibold">
                          {kotaPoda.toFixed(2)} m
                        </td>
                        <td className="py-2 px-2 text-right text-cyan-400">
                          {kotaStropa.toFixed(2)} m
                        </td>
                        <td className="py-2 px-2 font-sans text-slate-300">
                          {apps.length > 0
                            ? apps.map((a) => `${a.name} (${a.powerWatts}W)`).join(', ')
                            : '— (Slobodno / Opća namjena)'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
