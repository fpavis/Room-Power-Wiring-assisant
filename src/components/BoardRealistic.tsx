import React, { useState } from 'react';
import { BoardPlan, Phase, RcdGroup } from '../engine/board';
import { layoutBoardRails, MODULE_MM, RailItem } from '../engine/boardLayout';
import { formatNumber } from '../engine/geometry';
import { CONDUCTOR_META } from '../data/presets';
import { BoardCable, BoardCircuit } from '../engine/board';

const GUTTER = 46;
const TOP_ZONE = 42;
const DEVICE_H = 88;
const BOTTOM_ZONE = 104;
const ROW_PITCH = TOP_ZONE + DEVICE_H + BOTTOM_ZONE;
const MARGIN_TOP = 16;

const WIRE: Record<Phase | 'N', string> = {
  L1: '#7A4A1E',
  L2: '#1A1A1A',
  L3: '#77777A',
  N: '#2A6FD6',
};
const GREEN = '#2E9A45';
const YELLOW = '#F2D22E';

type Point = [number, number];
const path = (points: Point[]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');

/** Insulated conductor with a highlight, so it reads as a round wire. */
function Wire({ points, color, width = 3 }: { points: Point[]; color: string; width?: number }) {
  const d = path(points);
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" data-wire="">
      <path d={d} stroke={color} strokeWidth={width} />
      <path d={d} stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={width * 0.28} />
    </g>
  );
}

/** Protective conductor: green with a yellow stripe, as in a real cable. */
function EarthWire({ points, width = 3 }: { points: Point[]; width?: number }) {
  const d = path(points);
  return (
    <g fill="none" strokeLinejoin="round" data-wire="">
      <path d={d} stroke={GREEN} strokeWidth={width} strokeLinecap="round" />
      <path d={d} stroke={YELLOW} strokeWidth={width} strokeDasharray="7 7" />
    </g>
  );
}

function Screw({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle data-screw="" cx={x} cy={y} r={3.4} fill="#C9C9C4" stroke="#6F6F6A" strokeWidth={0.6} />
      <path d={`M${x - 2.2} ${y}L${x + 2.2} ${y}M${x} ${y - 2.2}L${x} ${y + 2.2}`} stroke="#555555" strokeWidth={0.7} />
    </g>
  );
}

function Device({
  x,
  y,
  modules,
  title,
  subtitle,
  accent,
  toggle = '#2B2B2B',
  poles,
  bottomPoles = poles,
  testButton,
  poleLabels,
  hint,
}: {
  x: number;
  y: number;
  modules: number;
  title: string;
  subtitle: string;
  accent: string;
  toggle?: string;
  poles: number;
  bottomPoles?: number;
  testButton?: boolean;
  /** Terminal names printed beside the screws, as on real devices. */
  poleLabels?: string[];
  hint?: string;
}) {
  const w = modules * MODULE_MM;
  const titleSize = modules === 1 ? 5.4 : 7;
  const titleTooWide = title.length * titleSize * 0.62 > w - 6;
  return (
    <g>
      {hint && <title>{hint}</title>}
      <rect x={x + 0.4} y={y} width={w - 0.8} height={DEVICE_H} rx={2} fill="#F3F2EC" stroke="#8C8C86" strokeWidth={0.8} />
      <rect x={x + 0.4} y={y} width={w - 0.8} height={13} fill="#E4E3DC" />
      <rect x={x + 0.4} y={y + DEVICE_H - 13} width={w - 0.8} height={13} fill="#E4E3DC" />
      {Array.from({ length: poles }, (_, i) => (
        <Screw key={`top-${i}`} x={x + (i + 0.5) * MODULE_MM} y={y + 6.5} />
      ))}
      {Array.from({ length: bottomPoles }, (_, i) => (
        <Screw key={`bottom-${i}`} x={x + (i + 0.5) * MODULE_MM} y={y + DEVICE_H - 6.5} />
      ))}
      <rect x={x + w / 2 - Math.min(w * 0.36, 16)} y={y + 40} width={Math.min(w * 0.72, 32)} height={18} rx={2} fill={toggle} />
      <rect x={x + 3} y={y + 16} width={w - 6} height={11} rx={1} fill={accent} />
      {poleLabels?.map((name, i) => (
        <g key={name + i} fontSize={4.2} fontWeight="700" fill="#555555">
          <text x={x + i * MODULE_MM + 1.2} y={y + 5}>{name}</text>
          {i < bottomPoles && <text x={x + i * MODULE_MM + 1.2} y={y + DEVICE_H - 2.4}>{name}</text>}
        </g>
      ))}
      <text
        x={x + w / 2}
        y={y + 24}
        textAnchor="middle"
        fontSize={titleSize}
        fontWeight="700"
        fill="#FFFFFF"
        textLength={titleTooWide ? w - 6 : undefined}
        lengthAdjust={titleTooWide ? 'spacingAndGlyphs' : undefined}
      >
        {title}
      </text>
      <text x={x + w / 2} y={y + 36} textAnchor="middle" fontSize={modules === 1 ? 6 : 5.6} fill="#222222">
        {subtitle}
      </text>
      {testButton && (
        <g>
          <circle cx={x + w / 2} cy={y + 67} r={4.2} fill="#D9A400" stroke="#6F6F6A" strokeWidth={0.5} />
          <text x={x + w / 2} y={y + 69.4} textAnchor="middle" fontSize={6} fontWeight="700" fill="#111111">T</text>
        </g>
      )}
    </g>
  );
}

/** Marks where a conductor branches off a bar or a distribution wire. */
function Joint({ x, y, color }: { x: number; y: number; color: string }) {
  return <circle cx={x} cy={y} r={2.6} fill={color} stroke="#FFFFFF" strokeWidth={0.5} />;
}

const CABLE_WIDTH = 8.5;

/** What a drawn part belongs to; decides what stays lit when a circuit is picked. */
type Owner =
  | { kind: 'common' }
  | { kind: 'group'; group: string }
  | { kind: 'circuit'; group: string; circuit: string };
interface Active {
  group: string;
  circuit?: string;
}
const COMMON: Owner = { kind: 'common' };
const GROUP_TINTS = ['#0A5FC4', '#A85400', '#00753B', '#6D35B8', '#00707F'];

function cableCountText(count: number): string {
  if (count === 0) return 'bez vodova';
  if (count === 1) return '1 vod';
  return count <= 4 ? `${count} voda` : `${count} vodova`;
}

function Legend({ phases }: { phases: Phase[] }) {
  const swatch = (background: string) => (
    <span className="inline-block w-6 h-[5px] rounded-sm align-middle" style={{ background }} />
  );
  const entry = (key: string, mark: React.ReactNode, text: string) => (
    <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {mark}
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-ink" data-testid="legenda-ormara">
      {phases.map((phase) =>
        entry(phase, swatch(WIRE[phase]), phases.length === 1 ? 'Faza L' : `Faza ${phase}`)
      )}
      {entry('N', swatch(WIRE.N), 'Nula N')}
      {entry(
        'PE',
        swatch(`repeating-linear-gradient(90deg, ${GREEN} 0 5px, ${YELLOW} 5px 10px)`),
        'Zaštitni vodič PE'
      )}
      {entry('bar', swatch('#B87333'), 'Češalj ili razdjelna stezaljka')}
      {entry(
        'joint',
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: WIRE.L1 }} />,
        'Spoj'
      )}
      {entry('cable', swatch('#8E8E88'), 'Kabel prema elementu')}
    </div>
  );
}

/** Front view of the open board, drawn from the plan. Module widths are true to size. */
export function BoardRealistic({
  plan,
  printHeightMm,
  fitHeight,
}: {
  plan: BoardPlan;
  printHeightMm?: number;
  /** Fill the height of the surrounding area instead of the width. */
  fitHeight?: boolean;
}) {
  const interactive = !printHeightMm;
  const [hover, setHover] = useState<Active | null>(null);
  const [pinned, setPinned] = useState<Active | null>(null);
  const active = interactive ? hover ?? pinned : null;
  const lit = (o: Owner) =>
    !active ||
    o.kind === 'common' ||
    (o.kind === 'group' || !active.circuit ? o.group === active.group : o.circuit === active.circuit);
  const same = (a: Active | null, b: Active) => a?.group === b.group && a?.circuit === b.circuit;
  const pick = (target: Active) => ({
    onMouseEnter: () => setHover(target),
    onMouseLeave: () => setHover(null),
    onClick: () => setPinned((current) => (same(current, target) ? null : target)),
  });

  // Every part pushed to a layer is tagged with the owner current at that moment.
  let owner: Owner = COMMON;
  const makeLayer = () => {
    const items: React.ReactNode[] = [];
    return {
      items,
      push(...nodes: React.ReactElement[]) {
        const o = owner;
        const target: Active | null =
          o.kind === 'circuit'
            ? { group: o.group, circuit: o.circuit }
            : o.kind === 'group'
            ? { group: o.group }
            : null;
        for (const node of nodes) {
          items.push(
            <g
              key={node.key}
              opacity={lit(o) ? 1 : 0.12}
              data-dim={lit(o) ? undefined : ''}
              style={interactive && target ? { cursor: 'pointer', transition: 'opacity 120ms' } : undefined}
              {...(interactive && target ? pick(target) : {})}
            >
              {node}
            </g>
          );
        }
      },
    };
  };
  const ownerOfGroup = (group: RcdGroup): Owner => ({ kind: 'group', group: group.code });
  const ownerOfCircuit = (group: RcdGroup, item: BoardCircuit): Owner => ({
    kind: 'circuit',
    group: group.code,
    circuit: item.circuit.id,
  });

  const { perRow, rows } = layoutBoardRails(plan);
  const phases: Phase[] = plan.supplyPhases === 3 ? ['L1', 'L2', 'L3'] : ['L1'];
  const poleNames: (Phase | 'N')[] = [...phases, 'N'];
  const railWidth = perRow * MODULE_MM;
  const width = railWidth + GUTTER * 2;
  const height = MARGIN_TOP + rows.length * ROW_PITCH + 10;
  const moduleX = (start: number) => GUTTER + start * MODULE_MM;
  const poleX = (item: RailItem, i: number) => moduleX(item.start) + (i + 0.5) * MODULE_MM;
  const rowTop = (r: number) => MARGIN_TOP + r * ROW_PITCH;
  const deviceTop = (r: number) => rowTop(r) + TOP_ZONE;
  const deviceBottom = (r: number) => deviceTop(r) + DEVICE_H;
  const nBarY = (r: number) => deviceBottom(r) + 20;
  const peBarY = (r: number) => deviceBottom(r) + 32;
  const sheathEndY = (r: number) => deviceBottom(r) + 56;
  const extraTerminalY = (r: number) => deviceBottom(r) + 44;
  const distY = (r: number, i: number) => rowTop(r) + 7 + i * 4.5;
  const combY = (r: number, i: number) => deviceTop(r) - 7 - i * 4;
  const phaseIndex = (p: Phase) => phases.indexOf(p);
  const passOffset = (i: number, n: number) => (i - (n - 1) / 2) * 3.6;

  const backdrops = makeLayer();
  const devices = makeLayer();
  const bars = makeLayer();
  const cables = makeLayer();
  const wires = makeLayer();
  const screws = makeLayer();
  const joints = makeLayer();
  const labels = makeLayer();
  const poleLetters = poleNames.map((pole) => (pole === 'N' ? 'N' : phases.length === 1 ? 'L' : pole));

  let firstMain: { r: number; item: RailItem } | null = null;
  rows.forEach((row, r) => {
    for (const item of row) if (item.kind === 'main') firstMain = { r, item };
  });

  // Main distribution: runs only between real connections, so no wire ends in the air.
  const linkX = (i: number) => GUTTER + railWidth + 4 + i * 4;
  const tapsIn = (r: number) => rows[r].filter((i) => i.kind === 'surge' || i.kind === 'rcd');
  const lastTapRow = rows.reduce((last, _row, r) => (tapsIn(r).length > 0 ? r : last), 0);
  const firstPass = rows[0].find((i) => i.kind === 'pass');
  rows.forEach((_row, r) => {
    if (r > lastTapRow) return;
    poleNames.forEach((pole, i) => {
      const color = WIRE[pole];
      const xs = tapsIn(r).map((item) => poleX(item, i));
      for (const x of xs) joints.push(<Joint key={`dist-${r}-${pole}-${x}`} x={x} y={distY(r, i)} color={color} />);
      if (r === 0 && firstPass) xs.push(moduleX(firstPass.start) + 9 + passOffset(i, poleNames.length));
      if (lastTapRow > 0) xs.push(linkX(i));
      if (xs.length >= 2) {
        wires.push(
          <Wire
            key={`dist-${r}-${pole}`}
            points={[
              [Math.min(...xs), distY(r, i)],
              [Math.max(...xs), distY(r, i)],
            ]}
            color={color}
            width={4}
          />
        );
      }
      if (r > 0) {
        wires.push(
          <Wire
            key={`dist-link-${r}-${pole}`}
            points={[
              [linkX(i), distY(r - 1, i)],
              [linkX(i), distY(r, i)],
            ]}
            color={color}
            width={4}
          />
        );
      }
    });
  });

  const tapFromDistribution = (item: RailItem, r: number, key: string) => {
    poleNames.forEach((pole, i) => {
      wires.push(
        <Wire
          key={`${key}-${pole}`}
          points={[
            [poleX(item, i), distY(r, i)],
            [poleX(item, i), deviceTop(r) + 6.5],
          ]}
          color={WIRE[pole]}
          width={3.6}
        />
      );
    });
  };

  // Devices, wire passages and short links on each rail.
  const groupRows = new Map<RcdGroup, number[]>();
  const barRanges = new Map<string, { first: number; end: number; barStart: number }>();
  rows.forEach((row, r) => {
    owner = COMMON;
    const y = deviceTop(r);
    const railY = y + DEVICE_H / 2 - 17;
    devices.push(
      <rect key={`rail-${r}`} x={GUTTER - 6} y={railY} width={railWidth + 12} height={34} fill="#B9B9B3" stroke="#8C8C86" strokeWidth={0.6} />
    );

    const usedModules = row.reduce((sum, item) => Math.max(sum, item.start + item.modules), 0);
    for (let m = usedModules; m < perRow; m++) {
      devices.push(
        <g key={`blank-${r}-${m}`}>
          <rect x={moduleX(m) + 0.4} y={y + 12} width={MODULE_MM - 0.8} height={DEVICE_H - 24} rx={1} fill="#DEDDD6" stroke="#B5B5AF" strokeWidth={0.5} />
          <text transform={`translate(${moduleX(m) + 11.5},${y + DEVICE_H / 2}) rotate(-90)`} textAnchor="middle" fontSize={6.5} fill="#8C8C86">
            rezerva
          </text>
        </g>
      );
    }

    for (const item of row) {
      const x = moduleX(item.start);
      owner =
        item.kind === 'rcd'
          ? ownerOfGroup(item.group)
          : item.kind === 'breaker'
          ? ownerOfCircuit(item.group, item.item)
          : item.kind === 'pass' && item.owner !== 'main'
          ? ownerOfGroup(item.owner)
          : COMMON;
      if (item.kind === 'main') {
        devices.push(
          <Device key="main" x={x} y={y} modules={item.modules} poles={item.modules} title="GLAVNA" subtitle={`${plan.mainSwitch.ratedAmps} A`} accent="#333333" toggle="#B3261E" poleLabels={poleLetters} hint={`Glavna sklopka ${plan.mainSwitch.poles}P ${plan.mainSwitch.ratedAmps} A`} />
        );
        poleNames.forEach((pole, i) => {
          const passX = moduleX(item.start + item.modules) + 9 + passOffset(i, poleNames.length);
          const lane = deviceBottom(r) + 5 + (poleNames.length - 1 - i) * 3.4;
          wires.push(
            <Wire
              key={`main-out-${pole}`}
              points={[
                [poleX(item, i), y + DEVICE_H - 6.5],
                [poleX(item, i), lane],
                [passX, lane],
                [passX, distY(r, i)],
              ]}
              color={WIRE[pole]}
              width={4}
            />
          );
          const count = poleNames.length;
          const entryX = x + item.modules * 9 + (i - (count - 1) / 2) * 2.6 + 1.6;
          const isLeft = poleX(item, i) < entryX;
          const feedLane = rowTop(r) + 15 + (isLeft ? i : count - 1 - i) * 3.6;
          wires.push(
            <Wire
              key={`feed-${pole}`}
              points={[
                [entryX, rowTop(r) + 6],
                [entryX, feedLane],
                [poleX(item, i), feedLane],
                [poleX(item, i), y + 6.5],
              ]}
              color={WIRE[pole]}
              width={4}
            />
          );
        });
        cables.push(
          <path
            key="feed-sheath"
            d={path([
              [x + item.modules * 9, 0],
              [x + item.modules * 9, rowTop(r) + 7],
            ])}
            data-cable-end={`${x + item.modules * 9},${rowTop(r) + 7}`}
            stroke="#6F6F6A"
            strokeWidth={13}
            fill="none"
          />
        );
      }

      if (item.kind === 'surge') {
        devices.push(
          <Device key="surge" x={x} y={y} modules={item.modules} poles={item.modules} bottomPoles={0} title="SPD" subtitle="tip 2" accent="#00753B" toggle="#3C8D40" poleLabels={poleLetters} hint="Odvodnik prenapona, tip 2" />
        );
        tapFromDistribution(item, r, 'surge');
        const midX = x + (item.modules * MODULE_MM) / 2;
        screws.push(<Screw key="surge-earth-top" x={midX} y={y + DEVICE_H - 6.5} />);
        screws.push(<Screw key="surge-earth-bar" x={midX} y={peBarY(r) + 3.5} />);
        wires.push(
          <EarthWire
            key="surge-earth"
            points={[
              [midX, y + DEVICE_H - 6.5],
              [midX, peBarY(r) + 3.5],
            ]}
          />
        );
      }

      if (item.kind === 'rcd') {
        devices.push(
          <Device
            key={`rcd-${item.group.code}`}
            x={x}
            y={y}
            modules={item.modules}
            poles={item.modules}
            title={item.group.code}
            subtitle={`${item.group.ratedAmps} A / 30 mA`}
            accent="#0A5FC4"
            testButton
            poleLabels={poleLetters}
            hint={`${item.group.code}: FID sklopka ${item.group.poles}P ${item.group.ratedAmps} A / 30 mA, štiti ${item.group.circuits.map((c) => c.circuit.code).join(', ')}`}
          />
        );
        tapFromDistribution(item, r, `rcd-${item.group.code}`);
      }

      if (item.kind === 'pass') {
        devices.push(
          <rect key={`pass-${r}-${item.start}`} x={x + 0.4} y={y} width={MODULE_MM - 0.8} height={DEVICE_H} fill="#CFCFC9" stroke="#B5B5AF" strokeWidth={0.5} strokeDasharray="2 2" />
        );
        if (item.owner !== 'main') {
          const group = item.owner;
          groupRows.set(group, [...(groupRows.get(group) ?? []), r]);
          const rcd = row.find((other) => other.kind === 'rcd' && other.group === group)!;
          phases.forEach((phase, i) => {
            const lane = deviceBottom(r) + 5 + (phases.length - 1 - i) * 3.4;
            const passX = x + 9 + passOffset(i, phases.length);
            wires.push(
              <Wire
                key={`rcd-out-${group.code}-${phase}`}
                points={[
                  [poleX(rcd, i), y + DEVICE_H - 6.5],
                  [poleX(rcd, i), lane],
                  [passX, lane],
                  [passX, combY(r, phaseIndex(phase))],
                ]}
                color={WIRE[phase]}
                width={4}
              />
            );
          });
          const nIndex = phases.length;
          screws.push(<Screw key={`rcd-n-${group.code}`} x={poleX(rcd, nIndex)} y={nBarY(r) + 3} />);
          wires.push(
            <Wire
              key={`rcd-out-${group.code}-N`}
              points={[
                [poleX(rcd, nIndex), y + DEVICE_H - 6.5],
                [poleX(rcd, nIndex), nBarY(r) + 3],
              ]}
              color={WIRE.N}
              width={4}
            />
          );
        }
      }

      if (item.kind === 'breaker') {
        const { circuit } = item.item;
        devices.push(
          <Device
            key={`breaker-${circuit.id}`}
            x={x}
            y={y}
            modules={item.modules}
            poles={item.modules}
            title={circuit.code}
            subtitle={`${circuit.breakerCurve}${circuit.breakerAmps}`}
            accent={circuit.color}
            hint={`${circuit.code} · ${circuit.name} · ${circuit.breakerCurve}${circuit.breakerAmps} A · ${cableCountText(item.item.cables.length)}`}
          />
        );
      }
    }

    // Comb bars and neutral bars for each group's stretch on this rail.
    const breakersByGroup = new Map<RcdGroup, RailItem[]>();
    for (const item of row) {
      if (item.kind === 'breaker') {
        breakersByGroup.set(item.group, [...(breakersByGroup.get(item.group) ?? []), item]);
      }
    }
    breakersByGroup.forEach((items, group) => {
      owner = ownerOfGroup(group);
      const passItem = row.find((i) => i.kind === 'pass' && i.owner === group);
      const rcdItem = row.find((i) => i.kind === 'rcd' && i.group === group);
      const first = passItem ? moduleX(passItem.start) + 4 : moduleX(items[0].start) + 4;
      const last = items[items.length - 1];
      const end = moduleX(last.start + last.modules) - 3;
      phases.forEach((phase, i) => {
        bars.push(
          <rect data-bar="" key={`comb-${r}-${group.code}-${phase}`} x={first} y={combY(r, i) - 1.2} width={end - first} height={2.4} fill="#B87333" stroke={WIRE[phase]} strokeWidth={0.6} />
        );
      });
      const barStart = rcdItem ? moduleX(rcdItem.start) + 4 : first;
      barRanges.set(`${group.code}:${r}`, { first, end, barStart });
      const tint = GROUP_TINTS[plan.groups.indexOf(group) % GROUP_TINTS.length];
      backdrops.push(
        <rect
          key={`group-${r}-${group.code}`}
          x={barStart - 3.5}
          y={deviceTop(r) - 19}
          width={end - barStart + 5.5}
          height={sheathEndY(r) + 17 - (deviceTop(r) - 19)}
          rx={3}
          fill={tint}
          fillOpacity={0.07}
          stroke={tint}
          strokeOpacity={0.45}
          strokeWidth={0.7}
          strokeDasharray="3 2"
        />
      );
      bars.push(
        <g key={`nbar-${r}-${group.code}`} data-testid={`n-sabirnica-${group.code}`}>
          <rect data-bar="" x={barStart} y={nBarY(r)} width={end - barStart} height={6} rx={1} fill="#BFD4F2" stroke={WIRE.N} strokeWidth={0.9} />
          <text x={barStart + 2} y={nBarY(r) - 1.5} fontSize={5.5} fontWeight="700" fill={WIRE.N}>
            N {group.code}
          </text>
        </g>
      );
      for (const item of items) {
        if (item.kind !== 'breaker') continue;
        owner = ownerOfCircuit(group, item.item);
        item.item.phases.forEach((phase, i) => {
          joints.push(
            <Joint key={`tap-joint-${item.item.circuit.id}-${phase}`} x={poleX(item, i)} y={combY(r, phaseIndex(phase))} color={WIRE[phase]} />
          );
          wires.push(
            <Wire
              key={`tap-${item.item.circuit.id}-${phase}`}
              points={[
                [poleX(item, i), combY(r, phaseIndex(phase))],
                [poleX(item, i), deviceTop(r) + 6.5],
              ]}
              color={WIRE[phase]}
              width={3}
            />
          );
        });
      }
    });

    owner = COMMON;
    bars.push(
      <g key={`pe-${r}`}>
        <rect data-bar="" x={GUTTER} y={peBarY(r)} width={railWidth} height={7} rx={1} fill="#CDE3C4" stroke={GREEN} strokeWidth={0.9} />
        <text x={GUTTER + 2} y={peBarY(r) - 1.5} fontSize={5.5} fontWeight="700" fill={GREEN}>PE</text>
      </g>
    );

    // Outgoing cables: every real cable gets its own place under its group of breakers.
    type Breaker = Extract<RailItem, { kind: 'breaker' }>;
    type Slot = { breaker: Breaker; cable: BoardCable; x: number };
    const breakers = row.filter((i): i is Breaker => i.kind === 'breaker');
    const slots: Slot[] = [];
    [...new Set(breakers.map((b) => b.group))].forEach((group) => {
      const inGroup = breakers.filter((b) => b.group === group);
      const pending = inGroup.flatMap((breaker) =>
        breaker.item.cables.map((cable) => ({ breaker, cable }))
      );
      const last = inGroup[inGroup.length - 1];
      const lastX = poleX(last, last.modules - 1);
      // With more cables than breakers, spread them under the RCD as well, so each has room.
      const rcd = row.find((i) => i.kind === 'rcd' && i.group === group);
      const firstX = rcd ? poleX(rcd, 0) : poleX(inGroup[0], 0);
      const oneEach =
        pending.length <= inGroup.length && inGroup.every((b) => b.item.cables.length <= 1);
      pending.forEach((entry, i) => {
        const x = oneEach
          ? poleX(entry.breaker, 0)
          : firstX + (i * (lastX - firstX)) / Math.max(1, pending.length - 1);
        slots.push({ ...entry, x });
      });
    });

    const zoneFloor = rowTop(r) + ROW_PITCH - 4;
    const laneTop = sheathEndY(r) + 18;
    const middle = GUTTER + railWidth / 2;
    const left = slots.filter((c) => c.x < middle).sort((a, b) => a.x - b.x);
    const right = slots.filter((c) => c.x >= middle).sort((a, b) => b.x - a.x);
    const place = (list: Slot[], side: 1 | -1) => {
      const room = GUTTER - 22;
      const step = Math.min(CABLE_WIDTH * 0.8, room / Math.max(1, list.length));
      const laneStep = Math.min(6, (zoneFloor - laneTop) / Math.max(1, list.length - 1));
      list.forEach((slot, order) => {
        owner = ownerOfCircuit(slot.breaker.group, slot.breaker.item);
        const gutterX =
          side === 1
            ? 8 + order * step + CABLE_WIDTH / 2
            : width - 8 - order * step - CABLE_WIDTH / 2;
        const laneY = laneTop + order * laneStep;
        const route: Point[] = [
          [gutterX, 0],
          [gutterX, laneY],
          [slot.x, laneY],
          [slot.x, sheathEndY(r)],
        ];
        cables.push(
          <g key={`cable-${slot.cable.nodeId}`}>
            <path
              d={path(route)}
              data-cable-end={`${slot.x},${sheathEndY(r)}`}
              stroke="#8E8E88"
              strokeWidth={CABLE_WIDTH}
              fill="none"
              strokeLinejoin="round"
            />
            <path d={path(route)} stroke="#B9B9B3" strokeWidth={2} fill="none" strokeLinejoin="round" />
          </g>
        );
      });
    };
    place(left, 1);
    place(right, -1);

    const conductorWidth = (b: BoardCircuit) =>
      b.circuit.cableCrossSection >= 4 ? 4.2 : b.circuit.cableCrossSection >= 2.5 ? 3.6 : 2.9;

    breakers.forEach((breaker, index) => {
      owner = ownerOfCircuit(breaker.group, breaker.item);
      const own = slots.filter((slot) => slot.breaker === breaker);
      const wireWidth = conductorWidth(breaker.item);
      const code = breaker.item.circuit.code;
      // Lanes step down from left to right, so a conductor never crosses its neighbour's.
      const stripY = deviceBottom(r) + 10.5 + (index % 4) * 2.4;
      const three = breaker.item.circuit.phaseType === '3P';
      const isPhase = (c: string) => c === 'L' || c === 'L1' || c === 'L2' || c === 'L3';
      const fedByLine = own.filter((slot) => slot.cable.conductors.some(isPhase));

      // Several cables on one breaker share it through a distribution terminal.
      if (!three && fedByLine.length > 1) {
        const xs = [...fedByLine.map((slot) => slot.x), poleX(breaker, 0)];
        const stripLeft = Math.min(...xs) - 3;
        const stripRight = Math.max(...xs) + 3;
        bars.push(
          <rect data-bar="" key={`strip-${breaker.item.circuit.id}`} x={stripLeft} y={stripY - 1.8} width={stripRight - stripLeft} height={3.6} rx={0.8} fill="#B87333" stroke={WIRE.L1} strokeWidth={0.6} />
        );
        wires.push(
          <Wire
            key={`strip-feed-${breaker.item.circuit.id}`}
            points={[
              [poleX(breaker, 0), deviceBottom(r) - 6.5],
              [poleX(breaker, 0), stripY],
            ]}
            color={WIRE[breaker.item.phases[0]]}
            width={wireWidth}
          />
        );
        joints.push(<Joint key={`strip-joint-${breaker.item.circuit.id}`} x={poleX(breaker, 0)} y={stripY} color={WIRE.L1} />);
      }

      own.forEach((slot) => {
        const { cable, x } = slot;
        const end = sheathEndY(r);
        const parts: React.ReactNode[] = [];
        const phaseConductors = cable.conductors.filter(isPhase);

        if (three) {
          breaker.item.phases.forEach((phase, i) => {
            const entry = x + (i - 1) * 3;
            parts.push(
              <Wire
                key={phase}
                points={[
                  [poleX(breaker, i), deviceBottom(r) - 6.5],
                  [poleX(breaker, i), stripY + i * 3],
                  [entry, stripY + i * 3],
                  [entry, end],
                ]}
                color={WIRE[phase]}
                width={wireWidth}
              />
            );
          });
        } else if (phaseConductors.length > 0) {
          const color = WIRE[breaker.item.phases[0]];
          if (fedByLine.length > 1) {
            joints.push(<Joint key={`strip-tap-${cable.nodeId}`} x={x} y={stripY} color={WIRE.L1} />);
            parts.push(<Wire key="L" points={[[x, stripY], [x, end]]} color={color} width={wireWidth} />);
          } else {
            parts.push(
              <Wire
                key="L"
                points={[
                  [poleX(breaker, 0), deviceBottom(r) - 6.5],
                  [poleX(breaker, 0), stripY],
                  [x, stripY],
                  [x, end],
                ]}
                color={color}
                width={wireWidth}
              />
            );
          }
        }

        if (cable.conductors.includes('N')) {
          parts.push(<Wire key="N" points={[[x + 3, end], [x + 3, nBarY(r) + 3]]} color={WIRE.N} width={wireWidth} />);
          screws.push(<Screw key={`n-screw-${cable.nodeId}`} x={x + 3} y={nBarY(r) + 3} />);
        }
        if (cable.conductors.includes('PE')) {
          parts.push(<EarthWire key="PE" width={wireWidth} points={[[x - 3, end], [x - 3, peBarY(r) + 3.5]]} />);
          screws.push(<Screw key={`pe-screw-${cable.nodeId}`} x={x - 3} y={peBarY(r) + 3.5} />);
        }
        wires.push(
          <g key={`out-${cable.nodeId}`} data-testid={`vod-${code}-${cable.label}`}>
            {parts}
          </g>
        );
        labels.push(
          <g key={`label-${cable.nodeId}`}>
            <title>{`${cable.label} · ${code} · ${cable.spec}`}</title>
            <rect x={x - cable.label.length * 1.8 - 1.8} y={end + 1.5 + (slots.indexOf(slot) % 2) * 7.4} width={cable.label.length * 3.6 + 3.6} height={6.8} rx={1.2} fill={breaker.item.circuit.color} stroke="#FFFFFF" strokeWidth={0.5} />
            <text x={x} y={end + 6.6 + (slots.indexOf(slot) % 2) * 7.4} textAnchor="middle" fontSize={5.3} fontWeight="700" fill="#FFFFFF">
              {cable.label}
            </text>
          </g>
        );
      });

      // Switched conductors and travellers meet on terminals of their own, never on the breaker.
      const extraKinds = [
        ...new Set(
          own.flatMap((slot) =>
            slot.cable.conductors.filter((c) => !['L', 'L1', 'L2', 'L3', 'N', 'PE'].includes(c))
          )
        ),
      ];
      extraKinds.forEach((kind, k) => {
        const users = own.filter((slot) => slot.cable.conductors.includes(kind));
        const offset = (k - (extraKinds.length - 1) / 2) * 2.4;
        const xs = users.map((slot) => slot.x + offset);
        const boxLeft = Math.min(...xs) - 4;
        const boxRight = Math.max(...xs) + 4;
        const y = extraTerminalY(r) + k * 3;
        const color = CONDUCTOR_META[kind]?.colorHex ?? '#333333';
        bars.push(
          <rect data-bar="" key={`extra-${breaker.item.circuit.id}-${kind}`} x={boxLeft} y={y - 2} width={boxRight - boxLeft} height={4} rx={0.8} fill="#F3F2EC" stroke={color} strokeWidth={0.8} />
        );
        users.forEach((slot) => {
          wires.push(
            <Wire
              key={`extra-${slot.cable.nodeId}-${kind}`}
              points={[
                [slot.x + offset, sheathEndY(r)],
                [slot.x + offset, y],
              ]}
              color={color}
              width={conductorWidth(breaker.item) * 0.85}
            />
          );
        });
      });
    });
  });

  // Links between PE bars, and the supply's earth down the left gutter.
  owner = COMMON;
  const main = firstMain as { r: number; item: RailItem } | null;
  if (main) {
    const x = moduleX(main.item.start) + (main.item.modules * MODULE_MM) / 2;
    const earthEntry = x - (poleNames.length + 1) * 1.3;
    const earthEnd: Point = [GUTTER + 6, peBarY(main.r) + 3.5];
    screws.push(<Screw key="feed-earth-screw" x={earthEnd[0]} y={earthEnd[1]} />);
    wires.push(
      <EarthWire
        key="feed-earth"
        width={4}
        points={[
          [earthEntry, rowTop(main.r) + 6],
          [earthEntry, rowTop(main.r) + 11],
          [GUTTER - 10, rowTop(main.r) + 11],
          [GUTTER - 10, earthEnd[1]],
          earthEnd,
        ]}
      />
    );
  }
  for (let r = 1; r < rows.length; r++) {
    const barEnd = GUTTER + railWidth - 3;
    const channel = GUTTER + railWidth + 12;
    screws.push(<Screw key={`pe-link-a-${r}`} x={barEnd} y={peBarY(r - 1) + 3.5} />);
    screws.push(<Screw key={`pe-link-b-${r}`} x={barEnd} y={peBarY(r) + 3.5} />);
    wires.push(
      <EarthWire
        key={`pe-link-${r}`}
        width={4}
        points={[
          [barEnd, peBarY(r - 1) + 3.5],
          [channel, peBarY(r - 1) + 3.5],
          [channel, peBarY(r) + 3.5],
          [barEnd, peBarY(r) + 3.5],
        ]}
      />
    );
  }

  // A group continuing on the next rail takes its supply and neutral along.
  groupRows.forEach((_rows, group) => {
    const present = rows
      .map((row, r) => (row.some((i) => i.kind === 'breaker' && i.group === group) ? r : -1))
      .filter((r) => r >= 0);
    owner = ownerOfGroup(group);
    for (let i = 1; i < present.length; i++) {
      const from = present[i - 1];
      const to = present[i];
      const channel = GUTTER + railWidth + 20;
      const fromBars = barRanges.get(`${group.code}:${from}`);
      const toBars = barRanges.get(`${group.code}:${to}`);
      if (!fromBars || !toBars) continue;
      phases.forEach((phase, p) => {
        wires.push(
          <Wire
            key={`group-link-${group.code}-${phase}-${to}`}
            points={[
              [fromBars.end - 2, combY(from, p)],
              [channel + p * 3, combY(from, p)],
              [channel + p * 3, combY(to, p)],
              [toBars.first + 2, combY(to, p)],
            ]}
            color={WIRE[phase]}
          />
        );
      });
      wires.push(
        <Wire
          key={`group-link-${group.code}-N-${to}`}
          points={[
            [fromBars.end - 2, nBarY(from) + 3],
            [channel + phases.length * 3, nBarY(from) + 3],
            [channel + phases.length * 3, nBarY(to) + 3],
            [toBars.barStart + 2, nBarY(to) + 3],
          ]}
          color={WIRE.N}
        />
      );
    }
  });

  const drawing = (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      data-testid="izgled-ormara"
      className={printHeightMm || fitHeight ? undefined : 'w-full h-auto'}
      style={
        printHeightMm
          ? { display: 'block', width: '100%', height: `${printHeightMm}mm` }
          : fitHeight
          ? { display: 'block', width: '100%', height: '100%' }
          : { display: 'block', margin: '0 auto' }
      }
      fontFamily="Plus Jakarta Sans, sans-serif"
    >
      <rect x={1} y={1} width={width - 2} height={height - 2} rx={5} fill="#D7D6CF" stroke="#6F6F6A" strokeWidth={2} />
      <rect x={6} y={6} width={width - 12} height={height - 12} rx={3} fill="#E3E2DB" stroke="#B5B5AF" strokeWidth={0.8} />
      {backdrops.items}
      {cables.items}
      {devices.items}
      {bars.items}
      {wires.items}
      {joints.items}
      {screws.items}
      {labels.items}
      <text x={width - 8} y={height - 5} textAnchor="end" fontSize={6} fill="#6F6F6A">
        {plan.modules.enclosure} modula · modul {MODULE_MM} mm · {formatNumber(rows.length, 0)} red
      </text>
    </svg>
  );

  if (printHeightMm) {
    return (
      <div>
        {drawing}
        <div className="mt-1">
          <Legend phases={phases} />
        </div>
      </div>
    );
  }

  const rowClass = (on: boolean, dimmed: boolean) =>
    `w-full flex items-center gap-1.5 px-2 py-1.5 rounded border text-left ${
      on ? 'border-ink bg-paper' : 'border-line bg-paper hover:border-ink'
    } ${dimmed ? 'opacity-50' : ''}`;
  const list = (
    <div className="space-y-2" data-testid="popis-ormara">
      <p className="text-[12px] text-muted">
        Prijeđi mišem ili klikni krug da se istaknu samo njegovi vodovi.
      </p>
      {plan.groups.map((group, index) => {
        const groupTarget: Active = { group: group.code };
        return (
          <div key={group.code} className="space-y-1">
            <button
              className={rowClass(same(pinned, groupTarget), false)}
              aria-pressed={same(pinned, groupTarget)}
              data-testid={`ormar-${group.code}`}
              {...pick(groupTarget)}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: GROUP_TINTS[index % GROUP_TINTS.length] }}
              />
              <b>{group.code}</b>
              <span className="text-[12px] text-muted truncate">
                {group.poles}P {group.ratedAmps} A / 30 mA
              </span>
            </button>
            {group.circuits.map((item) => {
              const target: Active = { group: group.code, circuit: item.circuit.id };
              return (
                <button
                  key={item.circuit.id}
                  className={rowClass(same(pinned, target), false)}
                  aria-pressed={same(pinned, target)}
                  data-testid={`ormar-krug-${item.circuit.code}`}
                  {...pick(target)}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[11.5px] font-bold text-white shrink-0"
                    style={{ backgroundColor: item.circuit.color }}
                  >
                    {item.circuit.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">
                      <b>
                        {item.circuit.breakerCurve}
                        {item.circuit.breakerAmps}
                      </b>{' '}
                      · {item.circuit.name}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {item.cables.length === 0
                        ? 'bez vodova'
                        : `${cableCountText(item.cables.length)}: ${item.cables.map((c) => c.label).join(', ')}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
      {pinned && (
        <button className="btn w-full" onClick={() => setPinned(null)}>
          Prikaži sve krugove
        </button>
      )}
    </div>
  );

  if (fitHeight) {
    return (
      <div className="h-full flex flex-col md:flex-row gap-3">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0">{drawing}</div>
          <Legend phases={phases} />
        </div>
        <aside className="md:w-64 shrink-0 max-h-48 md:max-h-none overflow-y-auto">{list}</aside>
      </div>
    );
  }
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_16rem] gap-3 items-start">
      <div className="space-y-2">
        {drawing}
        <Legend phases={phases} />
      </div>
      {list}
    </div>
  );
}
