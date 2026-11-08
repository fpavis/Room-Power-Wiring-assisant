import React, { useEffect, useState } from 'react';
import { X, Zap, CheckCircle2, Info } from 'lucide-react';
import { CONDUCTOR_META, ELEMENT_CATALOG } from '../data/presets';
import {
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  RoutedSegment,
} from '../types/electrical';

interface WiringSchematicModalProps {
  node: ElectricalNode | null;
  circuit: ElectricalCircuit | null;
  segments: RoutedSegment[];
  onClose: () => void;
}

type SchematicTab =
  | 'switch_single'
  | 'switch_double'
  | 'switch_two_way'
  | 'switch_cross'
  | 'socket_1p'
  | 'socket_3p';

function categoryToDefaultTab(cat?: ElementCategory): SchematicTab {
  if (!cat) return 'switch_two_way';
  if (cat === 'switch_single') return 'switch_single';
  if (cat === 'switch_double') return 'switch_double';
  if (cat === 'switch_two_way') return 'switch_two_way';
  if (cat === 'switch_cross') return 'switch_cross';
  if (cat === 'socket_shuko_3p') return 'socket_3p';
  if (cat === 'socket_single' || cat === 'socket_double') return 'socket_1p';
  return 'switch_two_way';
}

export const WiringSchematicModal: React.FC<WiringSchematicModalProps> = ({
  node,
  circuit,
  segments,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SchematicTab>(() =>
    categoryToDefaultTab(node?.category)
  );

  // Interactive switch state for live current flow simulation
  const [sw1State, setSw1State] = useState<boolean>(true);
  const [sw2State, setSw2State] = useState<boolean>(false);
  const [crossState, setCrossState] = useState<boolean>(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nodeSegments = node
    ? segments.filter((s) => s.fromNodeId === node.id || s.toNodeId === node.id)
    : [];

  // Compute whether lamp is energized in current schematic simulation
  const isLamp1On = (() => {
    if (activeTab === 'switch_single') return sw1State;
    if (activeTab === 'switch_double') return sw1State;
    if (activeTab === 'switch_two_way') return sw1State === sw2State;
    if (activeTab === 'switch_cross') {
      const match = sw1State === sw2State;
      return crossState ? !match : match;
    }
    return true;
  })();

  const isLamp2On = activeTab === 'switch_double' ? sw2State : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 no-print">
      <div className="w-full max-w-5xl bg-paper rounded-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-paper border-b border-line">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <Zap className="w-5 h-5 text-ink" />
              Shema spajanja vodiča (Faza L, Nula N, Uzemljenje PE) i bužira
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {node
                ? `Odabrani element: ${node.label} (${ELEMENT_CATALOG[node.category]?.name}) · Krug: ${circuit?.code || 'SK'}`
                : 'Prikaz ožičenja prekidača i utičnica prema normi IEC 60446'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Zatvori"
            className="p-2 text-muted hover:text-ink rounded-lg hover:bg-desk transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector Tabs for Schematic Types */}
        <div className="flex flex-wrap items-center gap-1.5 px-6 py-3 bg-panel border-b border-line">
          {[
            { id: 'switch_single', label: 'Jednopolni prekidač (P1)' },
            { id: 'switch_double', label: 'Serijski / Dvostruki (P2)' },
            { id: 'switch_two_way', label: 'Izmjenični spoj (2 mjesta)' },
            { id: 'switch_cross', label: 'Križni spoj (3 mjesta)' },
            { id: 'socket_1p', label: 'Šuko utičnice (1P+N+PE)' },
            { id: 'socket_3p', label: 'Trofazni priključak (3P+N+PE)' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as SchematicTab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-ink text-paper'
                  : 'bg-paper text-muted hover:text-ink border border-line'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Interactive Simulation Controls */}
          {activeTab.startsWith('switch_') && (
            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-panel border border-line rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-ink">
                  Simulacija protoka faze (kliknite na prekidač za testiranje):
                </span>
                <button
                  onClick={() => setSw1State((v) => !v)}
                  className={`px-3 py-1.5 text-xs  font-semibold rounded border transition-colors ${
                    sw1State
                      ? 'bg-warn border-ink text-ink'
                      : 'bg-desk border-line text-ink'
                  }`}
                >
                  Prekidač 1: {sw1State ? 'POLOŽAJ A (UKLJ)' : 'POLOŽAJ B (ISKLJ)'}
                </button>

                {(activeTab === 'switch_double' ||
                  activeTab === 'switch_two_way' ||
                  activeTab === 'switch_cross') && (
                  <button
                    onClick={() => setSw2State((v) => !v)}
                    className={`px-3 py-1.5 text-xs  font-semibold rounded border transition-colors ${
                      sw2State
                        ? 'bg-warn border-ink text-ink'
                        : 'bg-desk border-line text-ink'
                    }`}
                  >
                    {activeTab === 'switch_double'
                      ? `Tipka 2: ${sw2State ? 'UKLJUČENO' : 'ISKLJUČENO'}`
                      : `Prekidač 2: ${sw2State ? 'POLOŽAJ A' : 'POLOŽAJ B'}`}
                  </button>
                )}

                {activeTab === 'switch_cross' && (
                  <button
                    onClick={() => setCrossState((v) => !v)}
                    className={`px-3 py-1.5 text-xs  font-semibold rounded border transition-colors ${
                      crossState
                        ? 'bg-warn border-ink text-ink'
                        : 'bg-desk border-line text-ink'
                    }`}
                  >
                    Križni prekidač: {crossState ? 'KRIŽNO (✕)' : 'RAVNO (═)'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2  text-xs">
                <span
                  className={`px-2.5 py-1 rounded font-semibold ${
                    isLamp1On
                      ? 'bg-warn text-ink border border-ink'
                      : 'bg-desk text-muted'
                  }`}
                >
                  Svjetlo 1: {isLamp1On ? 'SVIJETLI (230V)' : 'UGAŠENO (0V)'}
                </span>
                {activeTab === 'switch_double' && (
                  <span
                    className={`px-2.5 py-1 rounded font-semibold ${
                      isLamp2On
                        ? 'bg-warn text-ink border border-ink'
                        : 'bg-desk text-muted'
                    }`}
                  >
                    Svjetlo 2: {isLamp2On ? 'SVIJETLI (230V)' : 'UGAŠENO (0V)'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Interactive SVG Wiring Diagram */}
          <div className="bg-paper border border-line rounded-xl p-4 overflow-x-auto">
            <svg viewBox="0 0 880 390" className="w-full min-w-[740px] h-auto">
              {/* 1. SINGLE-POLE SWITCH (JEDNOPOLNI PREKIDAČ) */}
              {activeTab === 'switch_single' && (
                <g>
                  {/* Main Power Supply Input */}
                  <text x="25" y="45" fill="#555555" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans">
                    DOVOD IZ ORMARIĆA (3×1,5 mm²)
                  </text>
                  {/* L, N, PE Incoming Lines */}
                  <line x1="25" y1="75" x2="250" y2="75" stroke="#7A4A1E" strokeWidth="3.5" />
                  <text x="30" y="68" fill="#A85400" fontSize="10" fontFamily="JetBrains Mono">Faza L (Smeđa)</text>

                  <line x1="25" y1="110" x2="250" y2="110" stroke="#0A5FC4" strokeWidth="3.5" />
                  <text x="30" y="103" fill="#0A5FC4" fontSize="10" fontFamily="JetBrains Mono">Nula N (Plava)</text>

                  <line x1="25" y1="145" x2="250" y2="145" stroke="#00753B" strokeWidth="3.5" strokeDasharray="6 3" />
                  <text x="30" y="138" fill="#00753B" fontSize="10" fontFamily="JetBrains Mono">Uzemljenje PE (Žuto-zelena)</text>

                  {/* Razvodna Kutija (Junction Box) */}
                  <rect x="230" y="40" width="240" height="145" rx="10" fill="#FFFFFF" stroke="#555555" strokeWidth="2" />
                  <text x="350" y="60" textAnchor="middle" fill="#111111" fontSize="12" fontWeight="700">
                    RAZVODNA KUTIJA Ø80 (WAGO spojevi)
                  </text>

                  {/* WAGO Terminals inside box */}
                  <circle cx="280" cy="75" r="6" fill="#7A4A1E" />
                  <circle cx="350" cy="110" r="6" fill="#0A5FC4" />
                  <circle cx="390" cy="145" r="6" fill="#00753B" />
                  <circle cx="420" cy="92" r="6" fill="#C2410C" />

                  {/* Conduit downward to Switch */}
                  <rect x="265" y="195" width="95" height="24" rx="4" fill="#F4F4F2" stroke="#555555" />
                  <text x="312" y="211" textAnchor="middle" fill="#222222" fontSize="9.5" fontFamily="JetBrains Mono">
                    Bužir Ø16 (3×1.5)
                  </text>

                  {/* Phase down to switch L terminal */}
                  <path d="M 280 75 L 280 285" fill="none" stroke="#7A4A1E" strokeWidth="3.5" />
                  {/* Switched Phase L' returning from switch to Junction box */}
                  <path
                    d="M 335 285 L 335 92 L 420 92"
                    fill="none"
                    stroke={isLamp1On ? '#C2410C' : '#555555'}
                    strokeWidth="3.5"
                  />

                  {/* Switch Box */}
                  <rect
                    x="245"
                    y="255"
                    width="135"
                    height="110"
                    rx="10"
                    fill="#F4F4F2"
                    stroke="#111111"
                    strokeWidth="2"
                    className="cursor-pointer"
                    onClick={() => setSw1State((v) => !v)}
                  />
                  <text x="312" y="275" textAnchor="middle" fill="#111111" fontSize="11" fontWeight="700">
                    JEDNOPOLNI PREKIDAČ
                  </text>
                  <circle cx="280" cy="295" r="5" fill="#7A4A1E" />
                  <text x="280" y="314" textAnchor="middle" fill="#A85400" fontSize="9" fontFamily="JetBrains Mono">L (Ulaz)</text>
                  <circle cx="335" cy="295" r="5" fill="#C2410C" />
                  <text x="335" y="314" textAnchor="middle" fill="#C2410C" fontSize="9" fontFamily="JetBrains Mono">L&apos; (Izlaz)</text>

                  {/* Switch Contact Blade */}
                  <line
                    x1="280"
                    y1="295"
                    x2={sw1State ? 335 : 325}
                    y2={sw1State ? 295 : 272}
                    stroke="#111111"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <text x="312" y="352" textAnchor="middle" fill="#111111" fontSize="9.5" fontFamily="JetBrains Mono">
                    [Klikni za preklapanje]
                  </text>

                  {/* Conduit from Junction Box to Ceiling Lamp */}
                  <rect x="490" y="45" width="120" height="22" rx="4" fill="#F4F4F2" stroke="#555555" />
                  <text x="550" y="60" textAnchor="middle" fill="#222222" fontSize="9.5" fontFamily="JetBrains Mono">
                    Bužir Ø16 prema stropu
                  </text>

                  {/* Wires to Lamp: L' (orange), N (blue), PE (green) */}
                  <line
                    x1="420"
                    y1="92"
                    x2="680"
                    y2="92"
                    stroke={isLamp1On ? '#C2410C' : '#555555'}
                    strokeWidth="3.5"
                  />
                  <line x1="350" y1="110" x2="680" y2="110" stroke="#0A5FC4" strokeWidth="3.5" />
                  <line x1="390" y1="145" x2="680" y2="145" stroke="#00753B" strokeWidth="3.5" strokeDasharray="6 3" />

                  {/* Ceiling Light Fixture */}
                  <rect x="680" y="55" width="165" height="115" rx="12" fill="#FFFFFF" stroke={isLamp1On ? '#FACC15' : '#555555'} strokeWidth="2.5" />
                  <circle
                    cx="762"
                    cy="105"
                    r="26"
                    fill={isLamp1On ? '#FEF08A' : '#F4F4F2'}
                    stroke={isLamp1On ? '#FACC15' : '#555555'}
                    strokeWidth="3"
                  />
                  <text x="762" y="110" textAnchor="middle" fill={isLamp1On ? '#713F12' : '#555555'} fontSize="12" fontWeight="700" fontFamily="JetBrains Mono">
                    {isLamp1On ? 'ON' : 'OFF'}
                  </text>
                  <text x="762" y="154" textAnchor="middle" fill="#111111" fontSize="11" fontWeight="600">
                    STROPNO SVJETLO (L&apos;+N+PE)
                  </text>
                </g>
              )}

              {/* 2. DOUBLE / SERIAL SWITCH (SERIJSKI PREKIDAČ) */}
              {activeTab === 'switch_double' && (
                <g>
                  <text x="25" y="45" fill="#555555" fontSize="11" fontWeight="700">
                    DOVOD IZ ORMARIĆA (3×1,5 mm²)
                  </text>
                  <line x1="25" y1="75" x2="275" y2="75" stroke="#7A4A1E" strokeWidth="3.5" />
                  <line x1="25" y1="110" x2="660" y2="110" stroke="#0A5FC4" strokeWidth="3.5" />
                  <line x1="25" y1="145" x2="660" y2="145" stroke="#00753B" strokeWidth="3.5" strokeDasharray="6 3" />

                  {/* Junction box */}
                  <rect x="220" y="40" width="250" height="140" rx="10" fill="#FFFFFF" stroke="#555555" strokeWidth="2" />
                  <text x="345" y="60" textAnchor="middle" fill="#111111" fontSize="12" fontWeight="700">
                    RAZVODNA KUTIJA (5×1,5 mm² prema P2)
                  </text>

                  {/* Phase down to switch L */}
                  <line x1="275" y1="75" x2="275" y2="290" stroke="#7A4A1E" strokeWidth="3.5" />
                  {/* Switched L1' */}
                  <path
                    d="M 325 290 L 325 88 L 660 88"
                    fill="none"
                    stroke={isLamp1On ? '#C2410C' : '#555555'}
                    strokeWidth="3.5"
                  />
                  {/* Switched L2'' */}
                  <path
                    d="M 375 290 L 375 215 L 660 215"
                    fill="none"
                    stroke={isLamp2On ? '#6D35B8' : '#555555'}
                    strokeWidth="3.5"
                  />

                  <rect x="235" y="245" width="180" height="120" rx="10" fill="#F4F4F2" stroke="#111111" strokeWidth="2" />
                  <text x="325" y="268" textAnchor="middle" fill="#111111" fontSize="11" fontWeight="700">
                    SERIJSKI PREKIDAČ (P2)
                  </text>
                  <circle cx="275" cy="295" r="5" fill="#7A4A1E" />
                  <text x="275" y="318" textAnchor="middle" fill="#A85400" fontSize="9" fontFamily="JetBrains Mono">L (Ulaz)</text>

                  <circle cx="325" cy="295" r="5" fill="#C2410C" />
                  <text x="325" y="318" textAnchor="middle" fill="#C2410C" fontSize="9" fontFamily="JetBrains Mono">L1&apos;</text>

                  <circle cx="375" cy="295" r="5" fill="#6D35B8" />
                  <text x="375" y="318" textAnchor="middle" fill="#6D35B8" fontSize="9" fontFamily="JetBrains Mono">L2&apos;&apos;</text>

                  {/* Lamp 1 */}
                  <rect x="660" y="55" width="180" height="105" rx="10" fill="#FFFFFF" stroke={isLamp1On ? '#FACC15' : '#555555'} strokeWidth="2" />
                  <text x="750" y="105" textAnchor="middle" fill={isLamp1On ? '#FEF08A' : '#555555'} fontSize="13" fontWeight="700">
                    GRUPA SVJETALA 1: {isLamp1On ? 'UKLJ' : 'ISKLJ'}
                  </text>
                  <text x="750" y="135" textAnchor="middle" fill="#555555" fontSize="10" fontFamily="JetBrains Mono">
                    Vodiči: L1&apos; + N + PE
                  </text>

                  {/* Lamp 2 */}
                  <rect x="660" y="185" width="180" height="105" rx="10" fill="#FFFFFF" stroke={isLamp2On ? '#6D35B8' : '#555555'} strokeWidth="2" />
                  <text x="750" y="235" textAnchor="middle" fill={isLamp2On ? '#FBCFE8' : '#555555'} fontSize="13" fontWeight="700">
                    GRUPA SVJETALA 2: {isLamp2On ? 'UKLJ' : 'ISKLJ'}
                  </text>
                  <text x="750" y="265" textAnchor="middle" fill="#555555" fontSize="10" fontFamily="JetBrains Mono">
                    Vodiči: L2&apos;&apos; + N + PE
                  </text>
                </g>
              )}

              {/* 3. TWO-WAY SWITCH (IZMJENIČNI SPOJ S 2 MJESTA) */}
              {activeTab === 'switch_two_way' && (
                <g>
                  <text x="20" y="36" fill="#555555" fontSize="11" fontWeight="700">
                    IZMJENIČNI SPOJ (Upravljanje rasvjetom s 2 mjesta — Bužir Ø20 / NYM-J 5×1,5 mm²)
                  </text>

                  {/* Supply L, N, PE */}
                  <line x1="25" y1="75" x2="175" y2="75" stroke="#7A4A1E" strokeWidth="3.5" />
                  <line x1="175" y1="75" x2="175" y2="255" stroke="#7A4A1E" strokeWidth="3.5" />
                  <text x="30" y="67" fill="#A85400" fontSize="10" fontFamily="JetBrains Mono">Stalna Faza L (Smeđa) → u L ulaz 1. prekidača</text>

                  <line x1="25" y1="115" x2="700" y2="115" stroke="#0A5FC4" strokeWidth="3.5" />
                  <text x="30" y="108" fill="#0A5FC4" fontSize="10" fontFamily="JetBrains Mono">Nula N (Plava) → izravno na rasvjetno tijelo</text>

                  <line x1="25" y1="150" x2="700" y2="150" stroke="#00753B" strokeWidth="3.5" strokeDasharray="6 3" />
                  <text x="30" y="143" fill="#00753B" fontSize="10" fontFamily="JetBrains Mono">Uzemljenje PE (Žuto-zelena) → izravno na rasvjetno tijelo</text>

                  {/* Switch 1 (Izmjenični 1) */}
                  <rect
                    x="110"
                    y="220"
                    width="180"
                    height="135"
                    rx="10"
                    fill="#F4F4F2"
                    stroke="#111111"
                    strokeWidth="2"
                    className="cursor-pointer"
                    onClick={() => setSw1State((v) => !v)}
                  />
                  <text x="200" y="242" textAnchor="middle" fill="#111111" fontSize="11" fontWeight="700">
                    IZMJENIČNI PREKIDAČ 1
                  </text>
                  <circle cx="175" cy="265" r="5" fill="#7A4A1E" />
                  <text x="150" y="269" fill="#A85400" fontSize="9.5" fontFamily="JetBrains Mono">L</text>

                  <circle cx="245" cy="255" r="5" fill="#555555" />
                  <circle cx="245" cy="295" r="5" fill="#111111" />

                  {/* Switch 1 Blade */}
                  <line
                    x1="175"
                    y1="265"
                    x2="245"
                    y2={sw1State ? 255 : 295}
                    stroke="#A85400"
                    strokeWidth="3.5"
                  />

                  {/* Two Traveler Wires (Korespondenti K1 & K2) between Switch 1 and Switch 2 */}
                  <line
                    x1="245"
                    y1="255"
                    x2="455"
                    y2="255"
                    stroke={sw1State ? '#A85400' : '#555555'}
                    strokeWidth="3.5"
                  />
                  <text x="350" y="246" textAnchor="middle" fill="#222222" fontSize="9.5" fontFamily="JetBrains Mono">
                    K1 (siva)
                  </text>

                  <line
                    x1="245"
                    y1="295"
                    x2="455"
                    y2="295"
                    stroke={!sw1State ? '#A85400' : '#555555'}
                    strokeWidth="3.5"
                  />
                  <text x="350" y="313" textAnchor="middle" fill="#222222" fontSize="9.5" fontFamily="JetBrains Mono">
                    K2 (crna)
                  </text>

                  {/* Switch 2 (Izmjenični 2) */}
                  <rect
                    x="415"
                    y="220"
                    width="180"
                    height="135"
                    rx="10"
                    fill="#F4F4F2"
                    stroke="#111111"
                    strokeWidth="2"
                    className="cursor-pointer"
                    onClick={() => setSw2State((v) => !v)}
                  />
                  <text x="505" y="242" textAnchor="middle" fill="#111111" fontSize="11" fontWeight="700">
                    IZMJENIČNI PREKIDAČ 2
                  </text>
                  <circle cx="455" cy="255" r="5" fill="#555555" />
                  <circle cx="455" cy="295" r="5" fill="#111111" />
                  <circle cx="535" cy="275" r="5" fill="#C2410C" />
                  <text x="558" y="279" fill="#C2410C" fontSize="9.5" fontFamily="JetBrains Mono">L&apos;</text>

                  {/* Switch 2 Blade */}
                  <line
                    x1="535"
                    y1="275"
                    x2="455"
                    y2={sw2State ? 255 : 295}
                    stroke={isLamp1On ? '#C2410C' : '#555555'}
                    strokeWidth="3.5"
                  />

                  {/* Switched Phase L' from Switch 2 to Lamp */}
                  <path
                    d="M 535 275 L 635 275 L 635 85 L 700 85"
                    fill="none"
                    stroke={isLamp1On ? '#C2410C' : '#555555'}
                    strokeWidth="3.5"
                  />
                  <text x="635" y="195" textAnchor="middle" fill="#C2410C" fontSize="9.5" fontFamily="JetBrains Mono">
                    Komutirana faza L&apos;
                  </text>

                  {/* Ceiling Lamp */}
                  <rect x="700" y="60" width="155" height="115" rx="12" fill="#FFFFFF" stroke={isLamp1On ? '#FACC15' : '#555555'} strokeWidth="2.5" />
                  <circle
                    cx="777"
                    cy="112"
                    r="24"
                    fill={isLamp1On ? '#FEF08A' : '#F4F4F2'}
                    stroke={isLamp1On ? '#FACC15' : '#555555'}
                    strokeWidth="2.5"
                  />
                  <text x="777" y="116" textAnchor="middle" fill={isLamp1On ? '#713F12' : '#555555'} fontSize="11" fontWeight="700" fontFamily="JetBrains Mono">
                    {isLamp1On ? '230V ON' : '0V OFF'}
                  </text>
                  <text x="777" y="158" textAnchor="middle" fill="#111111" fontSize="10" fontWeight="600">
                    STROPNO SVJETLO
                  </text>
                </g>
              )}

              {/* 4. CROSS SWITCH (KRIŽNI SPOJ S 3 MJESTA) */}
              {activeTab === 'switch_cross' && (
                <g>
                  <text x="20" y="36" fill="#555555" fontSize="11" fontWeight="700">
                    KRIŽNI SPOJ (2 Izmjenična + 1 Križni prekidač u sredini — Bužir Ø20 / 5×1,5 mm²)
                  </text>

                  <line x1="25" y1="80" x2="95" y2="80" stroke="#7A4A1E" strokeWidth="3.5" />
                  <line x1="95" y1="80" x2="95" y2="265" stroke="#7A4A1E" strokeWidth="3.5" />
                  <line x1="25" y1="115" x2="720" y2="115" stroke="#0A5FC4" strokeWidth="3.5" />
                  <line x1="25" y1="145" x2="720" y2="145" stroke="#00753B" strokeWidth="3.5" strokeDasharray="6 3" />

                  {/* Izmjenični 1 */}
                  <rect x="60" y="215" width="145" height="125" rx="8" fill="#F4F4F2" stroke="#111111" strokeWidth="1.8" />
                  <text x="132" y="236" textAnchor="middle" fill="#111111" fontSize="10" fontWeight="700">1. IZMJENIČNI</text>
                  <circle cx="95" cy="265" r="5" fill="#7A4A1E" />
                  <circle cx="170" cy="250" r="5" fill="#555555" />
                  <circle cx="170" cy="290" r="5" fill="#111111" />
                  <line x1="95" y1="265" x2="170" y2={sw1State ? 250 : 290} stroke="#A85400" strokeWidth="3" />

                  {/* Travelers into Cross Switch */}
                  <line x1="170" y1="250" x2="310" y2="250" stroke="#555555" strokeWidth="3" />
                  <line x1="170" y1="290" x2="310" y2="290" stroke="#111111" strokeWidth="3" />

                  {/* Križni Prekidač */}
                  <rect x="280" y="215" width="165" height="125" rx="8" fill="#F4F4F2" stroke="#A85400" strokeWidth="2" />
                  <text x="362" y="236" textAnchor="middle" fill="#FFD23F" fontSize="10" fontWeight="700">2. KRIŽNI PREKIDAČ</text>
                  <circle cx="310" cy="250" r="5" fill="#555555" />
                  <circle cx="310" cy="290" r="5" fill="#111111" />
                  <circle cx="415" cy="250" r="5" fill="#555555" />
                  <circle cx="415" cy="290" r="5" fill="#111111" />

                  {crossState ? (
                    <>
                      <line x1="310" y1="250" x2="415" y2="290" stroke="#111111" strokeWidth="3" />
                      <line x1="310" y1="290" x2="415" y2="250" stroke="#111111" strokeWidth="3" />
                    </>
                  ) : (
                    <>
                      <line x1="310" y1="250" x2="415" y2="250" stroke="#111111" strokeWidth="3" />
                      <line x1="310" y1="290" x2="415" y2="290" stroke="#111111" strokeWidth="3" />
                    </>
                  )}

                  {/* Travelers from Cross Switch to Izmjenični 2 */}
                  <line x1="415" y1="250" x2="540" y2="250" stroke="#555555" strokeWidth="3" />
                  <line x1="415" y1="290" x2="540" y2="290" stroke="#111111" strokeWidth="3" />

                  {/* Izmjenični 2 */}
                  <rect x="510" y="215" width="145" height="125" rx="8" fill="#F4F4F2" stroke="#111111" strokeWidth="1.8" />
                  <text x="582" y="236" textAnchor="middle" fill="#111111" fontSize="10" fontWeight="700">3. IZMJENIČNI</text>
                  <circle cx="540" cy="250" r="5" fill="#555555" />
                  <circle cx="540" cy="290" r="5" fill="#111111" />
                  <circle cx="620" cy="270" r="5" fill="#C2410C" />
                  <line x1="620" y1="270" x2="540" y2={sw2State ? 250 : 290} stroke="#C2410C" strokeWidth="3" />

                  <path
                    d="M 620 270 L 675 270 L 675 85 L 720 85"
                    fill="none"
                    stroke={isLamp1On ? '#C2410C' : '#555555'}
                    strokeWidth="3.5"
                  />

                  <rect x="720" y="60" width="135" height="110" rx="10" fill="#FFFFFF" stroke={isLamp1On ? '#FACC15' : '#555555'} strokeWidth="2.5" />
                  <circle cx="787" cy="112" r="22" fill={isLamp1On ? '#FEF08A' : '#F4F4F2'} />
                  <text x="787" y="116" textAnchor="middle" fill={isLamp1On ? '#713F12' : '#555555'} fontSize="11" fontWeight="700">
                    {isLamp1On ? 'ON' : 'OFF'}
                  </text>
                </g>
              )}

              {/* 5. 1P SHUKO SOCKETS (JEDNOFAZNE ŠUKO UTIČNICE) */}
              {activeTab === 'socket_1p' && (
                <g>
                  <text x="25" y="40" fill="#555555" fontSize="11" fontWeight="700">
                    SPAJANJE ŠUKO UTIČNICA 16A / 230V (Kabel NYM-J 3×2,5 mm² u bužiru Ø20 mm)
                  </text>

                  {/* Main bus lines */}
                  <line x1="30" y1="85" x2="780" y2="85" stroke="#7A4A1E" strokeWidth="4" />
                  <text x="35" y="75" fill="#A85400" fontSize="10" fontFamily="JetBrains Mono">Faza L — Smeđa (2,5 mm²) → Lijevi kontakt utičnice</text>

                  <line x1="30" y1="125" x2="780" y2="125" stroke="#00753B" strokeWidth="4" strokeDasharray="6 3" />
                  <text x="35" y="115" fill="#00753B" fontSize="10" fontFamily="JetBrains Mono">Uzemljenje PE — Žuto-zelena (2,5 mm²) → Srednja zaštitna opruga (Šuko)</text>

                  <line x1="30" y1="165" x2="780" y2="165" stroke="#0A5FC4" strokeWidth="4" />
                  <text x="35" y="155" fill="#0A5FC4" fontSize="10" fontFamily="JetBrains Mono">Nula N — Svijetloplava (2,5 mm²) → Desni kontakt utičnice</text>

                  {/* Single Socket Box */}
                  <rect x="160" y="220" width="210" height="140" rx="12" fill="#F4F4F2" stroke="#0A5FC4" strokeWidth="2" />
                  <text x="265" y="245" textAnchor="middle" fill="#111111" fontSize="12" fontWeight="700">
                    JEDNOSTRUKA ŠUKO UTIČNICA
                  </text>
                  <line x1="215" y1="85" x2="215" y2="295" stroke="#7A4A1E" strokeWidth="3.5" />
                  <line x1="265" y1="125" x2="265" y2="295" stroke="#00753B" strokeWidth="3.5" strokeDasharray="5 3" />
                  <line x1="315" y1="165" x2="315" y2="295" stroke="#0A5FC4" strokeWidth="3.5" />

                  <circle cx="215" cy="295" r="7" fill="#7A4A1E" />
                  <circle cx="265" cy="295" r="7" fill="#00753B" />
                  <circle cx="315" cy="295" r="7" fill="#0A5FC4" />
                  <text x="215" y="322" textAnchor="middle" fill="#A85400" fontSize="10" fontFamily="JetBrains Mono">L (Faza)</text>
                  <text x="265" y="322" textAnchor="middle" fill="#00753B" fontSize="10" fontFamily="JetBrains Mono">PE (Zemlja)</text>
                  <text x="315" y="322" textAnchor="middle" fill="#0A5FC4" fontSize="10" fontFamily="JetBrains Mono">N (Nula)</text>

                  {/* Double Socket Box */}
                  <rect x="470" y="220" width="270" height="140" rx="12" fill="#F4F4F2" stroke="#00753B" strokeWidth="2" />
                  <text x="605" y="245" textAnchor="middle" fill="#111111" fontSize="12" fontWeight="700">
                    DVOSTRUKA UTIČNICA (2 priključna mjesta)
                  </text>
                  <line x1="540" y1="85" x2="540" y2="295" stroke="#7A4A1E" strokeWidth="3.5" />
                  <line x1="605" y1="125" x2="605" y2="295" stroke="#00753B" strokeWidth="3.5" strokeDasharray="5 3" />
                  <line x1="670" y1="165" x2="670" y2="295" stroke="#0A5FC4" strokeWidth="3.5" />

                  <circle cx="540" cy="295" r="7" fill="#7A4A1E" />
                  <circle cx="605" cy="295" r="7" fill="#00753B" />
                  <circle cx="670" cy="295" r="7" fill="#0A5FC4" />
                  <text x="605" y="335" textAnchor="middle" fill="#555555" fontSize="10" fontFamily="JetBrains Mono">
                    Unutarnji paralelni most (L1=L2, PE1=PE2, N1=N2)
                  </text>
                </g>
              )}

              {/* 6. 3-PHASE CONNECTION (TROFAZNI PRIKLJUČAK 5x2,5 mm²) */}
              {activeTab === 'socket_3p' && (
                <g>
                  <text x="25" y="38" fill="#555555" fontSize="11" fontWeight="700">
                    TROFAZNI PRIKLJUČAK 400V / 16A (Kabel NYM-J 5×2,5 mm² u bužiru Ø25 mm za indukciju/pećnicu)
                  </text>
                  {[
                    { y: 75, color: '#7A4A1E', label: 'L1 — Faza 1 (Smeđa)', xTerm: 240 },
                    { y: 105, color: '#F43F5E', label: 'L2 — Faza 2 (Crna)', xTerm: 330 },
                    { y: 135, color: '#A855F7', label: 'L3 — Faza 3 (Siva)', xTerm: 420 },
                    { y: 165, color: '#0A5FC4', label: 'N — Nula (Plava)', xTerm: 510 },
                    { y: 195, color: '#00753B', label: 'PE — Zaštitno uzemljenje (Žuto-zelena)', xTerm: 600 },
                  ].map((w, i) => (
                    <g key={i}>
                      <line
                        x1="30"
                        y1={w.y}
                        x2={w.xTerm}
                        y2={w.y}
                        stroke={w.color}
                        strokeWidth="3.5"
                        strokeDasharray={i === 4 ? '6 3' : undefined}
                      />
                      <line
                        x1={w.xTerm}
                        y1={w.y}
                        x2={w.xTerm}
                        y2="295"
                        stroke={w.color}
                        strokeWidth="3.5"
                        strokeDasharray={i === 4 ? '6 3' : undefined}
                      />
                      <text x="35" y={w.y - 6} fill="#111111" fontSize="9.5" fontFamily="JetBrains Mono">
                        {w.label}
                      </text>
                      <circle cx={w.xTerm} cy="295" r="7" fill={w.color} />
                    </g>
                  ))}
                  <rect x="190" y="245" width="465" height="110" rx="12" fill="none" stroke="#A85400" strokeWidth="2" />
                  <text x="422" y="335" textAnchor="middle" fill="#111111" fontSize="12" fontWeight="700">
                    TROFAZNA PRIKLJUČNICA (5-POLNA STEZALJKA: L1 · L2 · L3 · N · PE)
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* Legend & Selected Node Segment Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 bg-paper border border-line rounded-lg space-y-2.5">
              <h3 className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Info className="w-4 h-4 text-ink" />
                Standard oznaka i boja vodiča (HRN HD 308 S2 / IEC 60446)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(CONDUCTOR_META)
                  .slice(0, 6)
                  .map(([key, m]) => (
                    <div
                      key={key}
                      className="flex items-center gap-2.5 p-2 rounded bg-paper/80 border border-line/80"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: m.colorHex }}
                      />
                      <div className="min-w-0">
                        <div className=" font-semibold text-ink truncate">
                          {m.label}
                        </div>
                        <div className="text-[11px] text-muted truncate">
                          {m.iecColorName}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-4 bg-paper border border-line rounded-lg space-y-2.5">
              <h3 className="text-xs font-bold text-ink flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-ok" />
                Specifikacija bužira i vodiča za odabrani element
              </h3>
              {node && nodeSegments.length > 0 ? (
                <div className="space-y-2">
                  {nodeSegments.map((seg) => (
                    <div
                      key={seg.id}
                      className="p-2.5 rounded bg-paper border border-line text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between ">
                        <span className="text-ink font-semibold">
                          {seg.cableSpec} · Bužir Ø{seg.conduitDiameterMm} mm
                        </span>
                        <span className="text-ink font-bold">
                          Dužina: {seg.lengthMeters.toFixed(2)} m
                        </span>
                      </div>
                      <p className="text-muted text-[11px]">{seg.description}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1  text-[11px]">
                        {seg.conductors.map((c, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-slate-950 border border-line text-ink"
                            style={{ borderLeft: `3px solid ${CONDUCTOR_META[c]?.colorHex || '#fff'}` }}
                          >
                            {CONDUCTOR_META[c]?.label || c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted space-y-1.5 leading-relaxed">
                  <p>
                    • <strong>Bužir Ø16 mm</strong>: Za rasvjetne i prekidačke vodove
                    presjeka <code className=" text-ink">3×1,5 mm²</code>.
                  </p>
                  <p>
                    • <strong>Bužir Ø20 mm</strong>: Za strujne krugove utičnica{' '}
                    <code className=" text-ink">3×2,5 mm²</code> te
                    izmjenične/križne spojeve{' '}
                    <code className=" text-ink">5×1,5 mm²</code>.
                  </p>
                  <p>
                    • <strong>Bužir Ø25 mm</strong>: Za trofazne vodove{' '}
                    <code className=" text-ink">5×2,5 mm²</code> i glavne
                    dovode u razvodne kutije.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
