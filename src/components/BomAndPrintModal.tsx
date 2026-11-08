import React from 'react';
import { ELEMENT_CATALOG, WALL_META } from '../data/presets';
import { cablePurchaseMeters, conduitPurchaseMeters } from '../engine/electricalEngine';
import { formatMeters, formatNumber } from '../engine/geometry';
import {
  ApplianceItem,
  BomSummary,
  CircuitAnalysis,
  ElectricalNode,
  ElementCategory,
  RoomDimensions,
} from '../types/electrical';

interface BomProps {
  room: RoomDimensions;
  nodes: ElectricalNode[];
  appliances: ApplianceItem[];
  circuitAnalyses: CircuitAnalysis[];
  bom: BomSummary;
}

const th = 'text-left py-1.5 px-1.5 font-semibold border-b border-ink';
const thRight = 'text-right py-1.5 px-1.5 font-semibold border-b border-ink';
const td = 'py-1.5 px-1.5 border-b border-line';
const tdRight = `${td} text-right tabular-nums`;

/** Bill of materials and circuit tables, shared by the dialog and the printed pages. */
export function BomContent({ room, nodes, appliances, circuitAnalyses, bom }: BomProps) {
  const totalKw = circuitAnalyses.reduce((sum, c) => sum + c.totalPowerWatts, 0) / 1000;
  return (
    <div className="space-y-5 text-[12.5px]">
      <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-3">
        <Stat label="Prostorija" value={`${formatMeters(room.length)} × ${formatMeters(room.width)} × ${formatMeters(room.height)} m`} />
        <Stat label="Kabeli, stvarna trasa" value={`${formatNumber(bom.totalRouteLengthMeters, 1)} m`} />
        <Stat label="Kabeli, za nabavu" value={`${bom.totalPurchaseCableMeters} m`} />
        <Stat label="Instalirana snaga" value={`${formatNumber(totalKw, 2)} kW`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 print:grid-cols-3 gap-5">
        <div>
          <h3 className="section-title mb-1">Kabeli</h3>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Tip</th>
                <th className={thRight}>S obradom</th>
                <th className={thRight}>Za nabavu</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bom.cablesBySpec).map(([spec, meters]) => (
                <tr key={spec}>
                  <td className={td}>{spec}</td>
                  <td className={tdRight}>{formatNumber(meters, 2)} m</td>
                  <td className={`${tdRight} font-bold`}>{cablePurchaseMeters(meters)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[12px] text-muted">
            Obrada: 25 cm po kutiji. Nabava: dodatnih 10 %.
          </p>
        </div>

        <div>
          <h3 className="section-title mb-1">Bužiri</h3>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Promjer</th>
                <th className={thRight}>Trasa</th>
                <th className={thRight}>Za nabavu</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bom.conduitsByDiameter)
                .filter(([, meters]) => meters > 0)
                .map(([diameter, meters]) => (
                  <tr key={diameter}>
                    <td className={td}>Ø{diameter} mm</td>
                    <td className={tdRight}>{formatNumber(meters, 2)} m</td>
                    <td className={`${tdRight} font-bold`}>{conduitPurchaseMeters(meters)} m</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-1 text-[12px] text-muted">Nabava: dodatnih 8 %.</p>
        </div>

        <div>
          <h3 className="section-title mb-1">Elementi i osigurači</h3>
          <table className="w-full">
            <tbody>
              {(Object.keys(bom.countsByCategory) as ElementCategory[])
                .filter((category) => bom.countsByCategory[category] > 0)
                .map((category) => (
                  <tr key={category}>
                    <td className={td}>{ELEMENT_CATALOG[category].name}</td>
                    <td className={`${tdRight} font-bold`}>{bom.countsByCategory[category]} kom</td>
                  </tr>
                ))}
              {Object.entries(bom.breakersBySpec).map(([spec, count]) => (
                <tr key={spec}>
                  <td className={td}>{spec}</td>
                  <td className={`${tdRight} font-bold`}>{count} kom</td>
                </tr>
              ))}
              <tr>
                <td className={td}>WAGO spojnice (procjena)</td>
                <td className={`${tdRight} font-bold`}>{bom.wagoConnectorsCount} kom</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-x-auto">
        <h3 className="section-title mb-1">Strujni krugovi</h3>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Krug</th>
              <th className={th}>Zaštita i kabel</th>
              <th className={thRight}>Snaga</th>
              <th className={thRight}>Struja</th>
              <th className={thRight}>Opterećenje</th>
              <th className={thRight}>Kabel</th>
              <th className={th}>Trošila</th>
            </tr>
          </thead>
          <tbody>
            {circuitAnalyses.map((ca) => (
              <tr key={ca.circuit.id}>
                <td className={td}>
                  <b>{ca.circuit.code}</b> {ca.circuit.name}
                </td>
                <td className={td}>
                  {ca.circuit.breakerCurve}{ca.circuit.breakerAmps} A ·{' '}
                  {formatNumber(ca.circuit.cableCrossSection, 1)} mm²
                </td>
                <td className={tdRight}>{ca.totalPowerWatts} W</td>
                <td className={tdRight}>{formatNumber(ca.currentAmps, 2)} A</td>
                <td className={`${tdRight} font-bold ${ca.status === 'overload' ? 'text-err' : ''}`}>
                  {formatNumber(ca.utilizationPercent, 1)} %
                </td>
                <td className={tdRight}>{formatNumber(ca.totalCableLengthMeters, 2)} m</td>
                <td className={td}>
                  {ca.assignedAppliances.length > 0
                    ? ca.assignedAppliances.map((a) => a.name).join(', ')
                    : ca.lightsCount > 0
                    ? `Rasvjetnih mjesta: ${ca.lightsCount}`
                    : 'Bez trošila'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <h3 className="section-title mb-1">Kote ugradnje</h3>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Oznaka</th>
              <th className={th}>Element</th>
              <th className={th}>Ploha</th>
              <th className={thRight}>Od kuta / zapada</th>
              <th className={thRight}>Od poda / juga</th>
              <th className={thRight}>Od stropa</th>
              <th className={th}>Trošilo</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => {
              const onCeiling = n.surface === 'ceiling';
              const assigned = appliances.filter((a) => a.assignedNodeId === n.id);
              return (
                <tr key={n.id}>
                  <td className={td}>
                    <b>{n.label.split(' ')[0]}</b>
                  </td>
                  <td className={td}>{ELEMENT_CATALOG[n.category]?.name}</td>
                  <td className={td}>{n.surface === 'ceiling' ? 'Strop' : WALL_META[n.surface].name}</td>
                  <td className={tdRight}>{formatMeters(n.x)} m</td>
                  <td className={tdRight}>{formatMeters(n.y)} m</td>
                  <td className={tdRight}>{onCeiling ? '–' : `${formatMeters(room.height - n.y)} m`}</td>
                  <td className={td}>
                    {assigned.length > 0
                      ? assigned.map((a) => `${a.name} (${a.powerWatts} W)`).join(', ')
                      : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 border border-line rounded">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums">{value}</div>
    </div>
  );
}
