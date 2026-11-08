import React from 'react';
import { ELEMENT_CATALOG, WALL_META } from '../data/presets';
import {
  getOrderedWallsAroundCenter,
  getPrimaryJunctionBoxWall,
} from '../engine/electricalEngine';
import {
  Box,
  ceilingToView,
  ELEMENT_FOOTPRINT,
  formatMeters,
  getCeilingViewSize,
  getSurfaceSize,
  pickPrintScale,
  placeLabels,
  Point,
} from '../engine/geometry';
import {
  BomSummary,
  CircuitAnalysis,
  ProjectData,
  RoutedSegment,
  SurfaceId,
  WallId,
} from '../types/electrical';
import { BomContent } from './BomAndPrintModal';

const PAGE_WIDTH_MM = 277;
const DRAWING_MAX_HEIGHT_MM = 150;
const MARGIN_MM = 6;
const CAPTION_MM = 6;

const SHORT: Record<WallId, string> = {
  north: 'Sjever',
  east: 'Istok',
  south: 'Jug',
  west: 'Zapad',
};

interface Placed {
  surface: SurfaceId;
  caption: string;
  xM: number;
  yM: number;
  widthM: number;
  heightM: number;
}

/** One SVG unit is one millimetre on paper, so the print scale is exact. */
function Drawing({
  data,
  segments,
  center,
  surfaces,
  widthM,
  heightM,
  scale,
}: {
  data: ProjectData;
  segments: RoutedSegment[];
  center: WallId;
  surfaces: Placed[];
  widthM: number;
  heightM: number;
  scale: number;
}) {
  const { room, nodes, openings, circuits } = data;
  const mm = 1000 / scale;
  const width = widthM * mm + MARGIN_MM * 2;
  const height = heightM * mm + MARGIN_MM + CAPTION_MM;
  const colorOf = (id: string) => circuits.find((c) => c.id === id)?.color ?? '#111111';

  const toMm = (s: Placed, p: Point): Point => {
    const v = s.surface === 'ceiling' ? ceilingToView(p, room, center) : p;
    return {
      x: MARGIN_MM + (s.xM + v.x) * mm,
      y: MARGIN_MM + (s.yM + s.heightM - v.y) * mm,
    };
  };

  const fontSize = 2.5;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: `${width}mm`, height: `${height}mm`, display: 'block' }}
      fontFamily="Plus Jakarta Sans, sans-serif"
    >
      {surfaces.map((s) => {
        const x = MARGIN_MM + s.xM * mm;
        const y = MARGIN_MM + s.yM * mm;
        const w = s.widthM * mm;
        const h = s.heightM * mm;
        const onSurface = nodes.filter((n) => n.surface === s.surface);
        const obstacles: Box[] = openings
          .filter((o) => o.wall === s.surface)
          .map((o) => {
            const p = toMm(s, { x: o.offsetFromLeft, y: o.sillHeight + o.height });
            return [p.x, p.y, o.width * mm, o.height * mm] as Box;
          });
        const requests = onSurface.map((n) => {
          const p = toMm(s, n);
          const f = ELEMENT_FOOTPRINT[n.category];
          const text = n.label.split(' ')[0];
          return {
            id: n.id,
            x: p.x,
            y: p.y,
            anchorWidth: f.width * mm,
            anchorHeight: f.height * mm,
            labelWidth: text.length * 1.55 + 1.6,
            labelHeight: 3.6,
            gap: 0.8,
            bounds: { x, y, width: w, height: h },
          };
        });
        const labels = placeLabels(requests, obstacles);

        return (
          <g key={s.surface}>
            <rect x={x} y={y} width={w} height={h} fill="#FFFFFF" />
            {openings
              .filter((o) => o.wall === s.surface)
              .map((o) => {
                const p = toMm(s, { x: o.offsetFromLeft, y: o.sillHeight + o.height });
                const ow = o.width * mm;
                const oh = o.height * mm;
                return (
                  <g key={o.id}>
                    <rect x={p.x} y={p.y} width={ow} height={oh} fill="#ECECE8" stroke="#333333" strokeWidth="0.25" />
                    {ow > 16 && (
                      <text x={p.x + ow / 2} y={p.y + oh / 2} textAnchor="middle" fontSize={fontSize} fill="#222222">
                        {o.type === 'door' ? 'Vrata' : 'Prozor'} {formatMeters(o.width)}×{formatMeters(o.height)}
                      </text>
                    )}
                  </g>
                );
              })}
            {segments
              .filter((seg) => seg.surface === s.surface)
              .map((seg) => (
                <polyline
                  key={seg.id}
                  fill="none"
                  stroke={colorOf(seg.circuitId)}
                  strokeWidth={seg.isMainFeeder ? 0.5 : 0.3}
                  points={seg.points
                    .map((pt) => {
                      const q = toMm(s, pt);
                      return `${q.x},${q.y}`;
                    })
                    .join(' ')}
                />
              ))}
            <rect x={x} y={y} width={w} height={h} fill="none" stroke="#111111" strokeWidth="0.45" />
            {onSurface.map((n) => {
              const p = toMm(s, n);
              const f = ELEMENT_FOOTPRINT[n.category];
              const fw = f.width * mm;
              const fh = f.height * mm;
              const color = colorOf(n.circuitId);
              const pos = labels.get(n.id)!;
              const text = n.label.split(' ')[0];
              const lw = text.length * 1.55 + 1.6;
              return (
                <g key={n.id}>
                  {f.shape === 'rect' ? (
                    <rect x={p.x - fw / 2} y={p.y - fh / 2} width={fw} height={fh} fill={color} />
                  ) : (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={fw / 2}
                      fill={n.category === 'light_ceiling' ? 'none' : color}
                      stroke={color}
                      strokeWidth="0.3"
                    />
                  )}
                  <rect x={pos.x} y={pos.y} width={lw} height={3.6} rx={0.4} fill={color} />
                  <text
                    x={pos.x + lw / 2}
                    y={pos.y + 2.75}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {text}
                  </text>
                </g>
              );
            })}
            <text
              x={x + w / 2}
              y={s.surface === 'ceiling' ? y + 4 : y + h + 4.2}
              textAnchor="middle"
              fontSize={fontSize + 0.3}
              fontWeight="700"
              fill="#222222"
            >
              {s.caption}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Page({
  projectName,
  title,
  scale,
  date,
  children,
}: {
  projectName: string;
  title: string;
  scale?: number;
  date: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ width: `${PAGE_WIDTH_MM}mm`, breakAfter: 'page' }}>
      <header className="flex items-end justify-between border-b-2 border-ink pb-1 mb-2">
        <div>
          <div className="text-[15px] font-bold">{projectName}</div>
          <div className="text-[12px]">{title}</div>
        </div>
        <div className="flex items-end gap-5 text-[12px]">
          {scale && (
            <div>
              <div style={{ width: '50mm' }} className="h-1.5 border-x-2 border-b-2 border-ink" />
              <div className="mt-0.5">
                5 cm na papiru = {formatMeters((50 * scale) / 1000)} m u prostoru
              </div>
            </div>
          )}
          <div className="text-right">
            {scale && <div className="font-bold">Mjerilo 1:{scale}</div>}
            <div>{date}</div>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

export function PrintSheets({
  projectName,
  data,
  segments,
  circuitAnalyses,
  bom,
}: {
  projectName: string;
  data: ProjectData;
  segments: RoutedSegment[];
  circuitAnalyses: CircuitAnalysis[];
  bom: BomSummary;
}) {
  const { room, nodes } = data;
  const center = getPrimaryJunctionBoxWall(nodes);
  const walls = getOrderedWallsAroundCenter(center);
  const ceiling = getCeilingViewSize(room, center);
  const date = new Date().toLocaleDateString('hr-HR');
  const usableWidth = PAGE_WIDTH_MM - MARGIN_MM * 2;
  const usableHeight = DRAWING_MAX_HEIGHT_MM - MARGIN_MM - CAPTION_MM;
  const dims = (w: number, h: number) => `${formatMeters(w)} × ${formatMeters(h)} m`;

  let x = 0;
  const strip: Placed[] = walls.map((wall) => {
    const { width, height } = getSurfaceSize(wall, room);
    const placed = {
      surface: wall as SurfaceId,
      caption: `${SHORT[wall]} · ${dims(width, height)}`,
      xM: x,
      yM: ceiling.height,
      widthM: width,
      heightM: height,
    };
    x += width;
    return placed;
  });
  const centerPlaced = strip.find((s) => s.surface === center)!;
  const overview: Placed[] = [
    {
      surface: 'ceiling',
      caption: `Strop · ${dims(ceiling.width, ceiling.height)}`,
      xM: centerPlaced.xM,
      yM: 0,
      widthM: ceiling.width,
      heightM: ceiling.height,
    },
    ...strip,
  ];
  const overviewHeight = ceiling.height + room.height;
  const overviewScale = pickPrintScale(x, overviewHeight, usableWidth, usableHeight);

  const singles: { surface: SurfaceId; title: string; width: number; height: number }[] = [
    ...walls.map((wall) => ({
      surface: wall as SurfaceId,
      title: WALL_META[wall].name,
      ...getSurfaceSize(wall, room),
    })),
    { surface: 'ceiling' as SurfaceId, title: 'Strop', ...ceiling },
  ];

  return (
    <div className="print-only text-ink bg-white">
      <Page projectName={projectName} title="Pregled svih zidova i stropa" scale={overviewScale} date={date}>
        <Drawing
          data={data}
          segments={segments}
          center={center}
          surfaces={overview}
          widthM={x}
          heightM={overviewHeight}
          scale={overviewScale}
        />
      </Page>

      {singles.map((sheet) => {
        const scale = pickPrintScale(sheet.width, sheet.height, usableWidth, usableHeight);
        const onSheet = nodes.filter((n) => n.surface === sheet.surface);
        const isCeiling = sheet.surface === 'ceiling';
        return (
          <Page
            key={sheet.surface}
            projectName={projectName}
            title={`${sheet.title} · ${dims(sheet.width, sheet.height)}`}
            scale={scale}
            date={date}
          >
            <Drawing
              data={data}
              segments={segments}
              center={center}
              surfaces={[
                {
                  surface: sheet.surface,
                  caption: '',
                  xM: 0,
                  yM: 0,
                  widthM: sheet.width,
                  heightM: sheet.height,
                },
              ]}
              widthM={sheet.width}
              heightM={sheet.height}
              scale={scale}
            />
            {onSheet.length > 0 && (
              <div style={{ columnCount: 3, columnGap: '8mm' }} className="mt-1 text-[11.5px]">
                {onSheet.map((n) => (
                  <div key={n.id} className="flex justify-between gap-2 border-b border-line py-0.5" style={{ breakInside: 'avoid' }}>
                    <span className="truncate">
                      <b>{n.label.split(' ')[0]}</b> {ELEMENT_CATALOG[n.category].shortCode}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {isCeiling
                        ? `Z ${formatMeters(n.x)} · J ${formatMeters(n.y)}`
                        : `kut ${formatMeters(n.x)} · pod ${formatMeters(n.y)} · strop ${formatMeters(room.height - n.y)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Page>
        );
      })}

      <Page projectName={projectName} title="Strujni krugovi i troškovnik" date={date}>
        <BomContent
          room={room}
          nodes={nodes}
          appliances={data.appliances}
          circuitAnalyses={circuitAnalyses}
          bom={bom}
        />
      </Page>
    </div>
  );
}
