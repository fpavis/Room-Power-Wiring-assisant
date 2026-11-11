import React from 'react';
import { BoardCircuit, BoardPlan, Phase } from '../engine/board';
import { formatNumber } from '../engine/geometry';

const COLORS: Record<Phase | 'N' | 'PE', string> = {
  L1: '#7A4A1E',
  L2: '#111111',
  L3: '#6B6B6B',
  N: '#0A5FC4',
  PE: '#00753B',
};
const BODY = '#F4F4F2';
const LINE = '#333333';

const BUS_Y: Record<Phase, number> = { L1: 88, L2: 100, L3: 112 };
const BUS_N = 124;
const RCD_TOP = 160;
const RCD_BOTTOM = 230;
const LOCAL_Y: Record<Phase, number> = { L1: 252, L2: 264, L3: 276 };
const LOCAL_N = 288;
const BREAKER_TOP = 320;
const BREAKER_BOTTOM = 380;
const PE_BUS = 440;
const TERMINAL_TOP = 470;
const FIRST_COLUMN = 250;
const GROUP_GAP = 26;
const VIEW_HEIGHT = 566;

const columnWidth = (c: BoardCircuit) => (c.circuit.phaseType === '3P' ? 128 : 92);
const peStyle = { stroke: COLORS.PE, strokeDasharray: '6 3' };

function Dot({ x, y, color }: { x: number; y: number; color: string }) {
  return <circle cx={x} cy={y} r={3.2} fill={color} />;
}

function Terminal({ x, label, color }: { x: number; y?: number; label: string; color: string }) {
  return (
    <g>
      <rect x={x - 9} y={TERMINAL_TOP} width={18} height={24} fill="#FFFFFF" stroke={color} strokeWidth="1.5" />
      <text x={x} y={TERMINAL_TOP + 16} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={color}>
        {label}
      </text>
    </g>
  );
}

/** Wiring of the board: supply, main switch, RCD groups, breakers, outgoing terminals. */
export function BoardDiagram({ plan, printHeightMm }: { plan: BoardPlan; printHeightMm?: number }) {
  const phases: Phase[] = plan.supplyPhases === 3 ? ['L1', 'L2', 'L3'] : ['L1'];
  const poleNames: (Phase | 'N')[] = [...phases, 'N'];
  const label = (p: Phase) => (plan.supplyPhases === 1 ? 'L' : p);

  let cursor = FIRST_COLUMN;
  const layout = plan.groups.map((group) => {
    const x = cursor;
    let cx = x;
    const columns = group.circuits.map((item) => {
      const column = { item, x: cx, width: columnWidth(item) };
      cx += column.width;
      return column;
    });
    const width = Math.max(cx - x, poleNames.length * 24 + 28);
    cursor = x + width + GROUP_GAP;
    return { group, x, width, columns };
  });
  const right = cursor - GROUP_GAP + 10;
  const viewWidth = right + 16;

  const switchLeft = 70;
  const switchRight = 140;
  const surgeLeft = 158;
  const surgeRight = surgeLeft + poleNames.length * 16 + 12;
  const surgeX = (i: number) => surgeLeft + 14 + i * 16;

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
      className={printHeightMm ? undefined : 'w-full h-auto'}
      style={
        printHeightMm
          ? { display: 'block', width: '100%', height: `${printHeightMm}mm` }
          : { minWidth: Math.min(viewWidth, 760) }
      }
      data-testid="shema-ormara"
      fontFamily="Plus Jakarta Sans, sans-serif"
    >
      {/* Supply and main bars */}
      <text x={10} y={72} fontSize="11" fontWeight="700" fill="#111111">Dovod</text>
      {phases.map((p) => (
        <g key={p}>
          <text x={10} y={BUS_Y[p] - 3} fontSize="9.5" fontWeight="700" fill={COLORS[p]}>{label(p)}</text>
          <line x1={10} x2={switchLeft} y1={BUS_Y[p]} y2={BUS_Y[p]} stroke={COLORS[p]} strokeWidth="2.5" />
          <line x1={switchRight} x2={right} y1={BUS_Y[p]} y2={BUS_Y[p]} stroke={COLORS[p]} strokeWidth="3" />
        </g>
      ))}
      <text x={10} y={BUS_N - 3} fontSize="9.5" fontWeight="700" fill={COLORS.N}>N</text>
      <line x1={10} x2={switchLeft} y1={BUS_N} y2={BUS_N} stroke={COLORS.N} strokeWidth="2.5" />
      <line x1={switchRight} x2={right} y1={BUS_N} y2={BUS_N} stroke={COLORS.N} strokeWidth="3" />

      <rect x={switchLeft} y={72} width={switchRight - switchLeft} height={68} rx={3} fill={BODY} stroke={LINE} strokeWidth="1.5" />
      <text x={(switchLeft + switchRight) / 2} y={102} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#111111">Glavna</text>
      <text x={(switchLeft + switchRight) / 2} y={114} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#111111">sklopka</text>
      <text x={(switchLeft + switchRight) / 2} y={128} textAnchor="middle" fontSize="9.5" fill="#111111">
        {plan.mainSwitch.poles}P {plan.mainSwitch.ratedAmps} A
      </text>

      {/* Protective conductor: never through a switch or an RCD */}
      <text x={10} y={PE_BUS - 3} fontSize="9.5" fontWeight="700" fill={COLORS.PE}>PE</text>
      <line x1={10} x2={right} y1={PE_BUS} y2={PE_BUS} strokeWidth="3" {...peStyle} />

      {/* Surge protector */}
      {poleNames.map((pole, i) => {
        const busY = pole === 'N' ? BUS_N : BUS_Y[pole];
        return (
          <g key={pole}>
            <line x1={surgeX(i)} x2={surgeX(i)} y1={busY} y2={RCD_TOP} stroke={COLORS[pole]} strokeWidth="1.5" />
            <Dot x={surgeX(i)} y={busY} color={COLORS[pole]} />
          </g>
        );
      })}
      <rect x={surgeLeft} y={RCD_TOP} width={surgeRight - surgeLeft} height={RCD_BOTTOM - RCD_TOP} rx={3} fill={BODY} stroke={LINE} strokeWidth="1.5" />
      <text x={(surgeLeft + surgeRight) / 2} y={190} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#111111">SPD</text>
      <text x={(surgeLeft + surgeRight) / 2} y={204} textAnchor="middle" fontSize="9" fill="#111111">tip 2</text>
      <line x1={(surgeLeft + surgeRight) / 2} x2={(surgeLeft + surgeRight) / 2} y1={RCD_BOTTOM} y2={PE_BUS} strokeWidth="2" {...peStyle} />
      <Dot x={(surgeLeft + surgeRight) / 2} y={PE_BUS} color={COLORS.PE} />

      {layout.map(({ group, x, width, columns }) => {
        const poleX = (i: number) => x + 16 + i * 24;
        const blockWidth = poleNames.length * 24 + 8;
        const end = x + width - 6;
        return (
          <g key={group.code} data-testid={`fid-${group.code}`}>
            <rect x={x - 6} y={140} width={width + 8} height={VIEW_HEIGHT - 146} fill="none" stroke="#CFCFCB" strokeDasharray="3 4" />

            {poleNames.map((pole, i) => {
              const busY = pole === 'N' ? BUS_N : BUS_Y[pole];
              const localY = pole === 'N' ? LOCAL_N : LOCAL_Y[pole];
              return (
                <g key={pole}>
                  <line x1={poleX(i)} x2={poleX(i)} y1={busY} y2={RCD_TOP} stroke={COLORS[pole]} strokeWidth="2" />
                  <Dot x={poleX(i)} y={busY} color={COLORS[pole]} />
                  <line x1={poleX(i)} x2={poleX(i)} y1={RCD_BOTTOM} y2={localY} stroke={COLORS[pole]} strokeWidth="2" />
                  <line x1={x} x2={end} y1={localY} y2={localY} stroke={COLORS[pole]} strokeWidth="2.5" />
                  <Dot x={poleX(i)} y={localY} color={COLORS[pole]} />
                </g>
              );
            })}

            <rect x={x + 2} y={RCD_TOP} width={blockWidth} height={RCD_BOTTOM - RCD_TOP} rx={3} fill={BODY} stroke={LINE} strokeWidth="1.5" />
            <text x={x + 2 + blockWidth / 2} y={186} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111111">{group.code}</text>
            <text x={x + 2 + blockWidth / 2} y={201} textAnchor="middle" fontSize="9" fill="#111111">
              {group.poles}P {group.ratedAmps} A
            </text>
            <text x={x + 2 + blockWidth / 2} y={214} textAnchor="middle" fontSize="9" fill="#111111">30 mA · A</text>
            <text x={x} y={LOCAL_N + 13} fontSize="8.5" fill={COLORS.N}>N sabirnica {group.code}</text>

            {columns.map(({ item, x: cx, width: columnW }) => {
              const three = item.circuit.phaseType === '3P';
              const lineXs = three ? [cx + 16, cx + 40, cx + 64] : [cx + 24];
              const neutralX = three ? cx + 88 : cx + 54;
              const earthX = three ? cx + 108 : cx + 74;
              const breakerW = three ? 72 : 40;
              const name = item.circuit.name;
              const maxChars = Math.floor(columnW / 5.2);
              return (
                <g key={item.circuit.id} data-testid={`krug-${item.circuit.code}`}>
                  {item.phases.map((phase, i) => (
                    <g key={phase}>
                      <line x1={lineXs[i]} x2={lineXs[i]} y1={LOCAL_Y[phase]} y2={BREAKER_TOP} stroke={COLORS[phase]} strokeWidth="2" />
                      <Dot x={lineXs[i]} y={LOCAL_Y[phase]} color={COLORS[phase]} />
                      <line x1={lineXs[i]} x2={lineXs[i]} y1={BREAKER_BOTTOM} y2={TERMINAL_TOP} stroke={COLORS[phase]} strokeWidth="2" />
                      <Terminal x={lineXs[i]} label={label(phase)} color={COLORS[phase]} />
                    </g>
                  ))}
                  <rect x={cx + 4} y={BREAKER_TOP} width={breakerW} height={BREAKER_BOTTOM - BREAKER_TOP} rx={3} fill={BODY} stroke={item.circuit.color} strokeWidth="2" />
                  <text x={cx + 4 + breakerW / 2} y={346} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111111">
                    {item.circuit.breakerCurve}{item.circuit.breakerAmps}
                  </text>
                  <text x={cx + 4 + breakerW / 2} y={362} textAnchor="middle" fontSize="9" fill="#111111">
                    {three ? '3P' : '1P'}
                  </text>

                  <line x1={neutralX} x2={neutralX} y1={LOCAL_N} y2={TERMINAL_TOP} stroke={COLORS.N} strokeWidth="2" />
                  <Dot x={neutralX} y={LOCAL_N} color={COLORS.N} />
                  <Terminal x={neutralX} label="N" color={COLORS.N} />

                  <line x1={earthX} x2={earthX} y1={PE_BUS} y2={TERMINAL_TOP} strokeWidth="2" {...peStyle} />
                  <Dot x={earthX} y={PE_BUS} color={COLORS.PE} />
                  <Terminal x={earthX} label="PE" color={COLORS.PE} />

                  <text x={cx + 4} y={510} fontSize="11.5" fontWeight="700" fill={item.circuit.color}>
                    X{item.terminal} · {item.circuit.code}
                  </text>
                  <text x={cx + 4} y={524} fontSize="9.5" fill="#333333">
                    {name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name}
                  </text>
                  <text x={cx + 4} y={538} fontSize="9.5" fill="#333333">
                    {cableCountText(item.cables.length)}
                  </text>
                  <text x={cx + 4} y={552} fontSize="9.5" fill="#333333">
                    {item.powerWatts} W
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function cableCountText(count: number): string {
  if (count === 1) return '1 vod';
  if (count >= 2 && count <= 4) return `${count} voda`;
  return `${count} vodova`;
}

const th = 'text-left py-1.5 px-1.5 font-semibold border-b border-ink';
const td = 'py-1.5 px-1.5 border-b border-line';

/** Summary tables that go with the wiring diagram. */
export function BoardSummary({ plan }: { plan: BoardPlan }) {
  const phases: Phase[] = plan.supplyPhases === 3 ? ['L1', 'L2', 'L3'] : ['L1'];
  const stat = (title: string, value: string) => (
    <div className="p-2.5 border border-line rounded">
      <div className="text-[12px] text-muted">{title}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="space-y-4 text-[12.5px]">
      <div className="grid grid-cols-2 lg:grid-cols-5 print:grid-cols-5 gap-3">
        {stat('Napajanje', plan.supplyPhases === 3 ? 'Trofazno, 400 V' : 'Jednofazno, 230 V')}
        {stat('FID sklopke', `${plan.groups.length} × ${plan.groups[0]?.poles ?? 2}P 30 mA`)}
        {stat('Ormar', `${plan.modules.enclosure} modula, zauzeto ${plan.modules.used}`)}
        {stat(
          'Vodova iz ormara',
          String(plan.groups.reduce((sum, g) => sum + g.circuits.reduce((n, c) => n + c.cables.length, 0), 0))
        )}
        {stat(
          'Opterećenje faza',
          phases
            .map((p) => `${plan.supplyPhases === 1 ? 'L' : p} ${formatNumber(plan.phaseLoadsWatts[p] / 1000, 1)}`)
            .join(' · ') + ' kW'
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Stezaljka</th>
              <th className={th}>Krug</th>
              <th className={th}>Osigurač</th>
              <th className={th}>FID</th>
              <th className={th}>Faza</th>
              <th className={th}>Vodovi iz ormara</th>
              <th className={th}>Snaga</th>
            </tr>
          </thead>
          <tbody>
            {plan.groups.flatMap((group) =>
              group.circuits.map((item) => (
                <tr key={item.circuit.id}>
                  <td className={td}><b>X{item.terminal}</b></td>
                  <td className={td}><b>{item.circuit.code}</b> {item.circuit.name}</td>
                  <td className={td}>{item.circuit.breakerCurve}{item.circuit.breakerAmps} A</td>
                  <td className={td}>{group.code}</td>
                  <td className={td}>{plan.supplyPhases === 1 ? 'L' : item.phases.join(', ')}</td>
                  <td className={td}>
                    {item.cables.length === 0
                      ? '–'
                      : item.cables.map((c) => `${c.label} (${c.spec.replace('NYM-J ', '').replace(' mm²', '')})`).join(', ')}
                  </td>
                  <td className={td}>{item.powerWatts} W</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ul className="list-disc pl-5 space-y-1 text-[12px] text-muted">
        <li>Više vodova istog kruga dijeli jedan osigurač preko razdjelne stezaljke.</li>
        <li>Nula svakog kruga spaja se isključivo na nulsku sabirnicu svoje FID sklopke.</li>
        <li>Zaštitni vodič PE ne prolazi kroz glavnu sklopku ni kroz FID sklopke.</li>
        <li>Rasvjeta je raspoređena na više FID sklopki, pa kvar ne ugasi cijelu rasvjetu.</li>
        <li>Veličina ormara uključuje 20 % rezerve za proširenje.</li>
      </ul>
    </div>
  );
}
