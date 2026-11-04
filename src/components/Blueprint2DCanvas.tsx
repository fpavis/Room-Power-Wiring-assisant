import React, { useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { CONDUCTOR_META, ELEMENT_CATALOG, WALL_META } from '../data/presets';
import {
  computeSnapAndDimensions,
  getOrderedWallsAroundCenter,
  getPrimaryJunctionBoxWall,
  getSurfaceSize,
  SnapResult,
} from '../engine/electricalEngine';
import {
  ApplianceItem,
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  RoomDimensions,
  RoutedSegment,
  SurfaceId,
  WallId,
  WallOpening,
} from '../types/electrical';

interface Blueprint2DCanvasProps {
  room: RoomDimensions;
  openings: WallOpening[];
  nodes: ElectricalNode[];
  circuits: ElectricalCircuit[];
  segments: RoutedSegment[];
  appliances: ApplianceItem[];
  activeSurface: SurfaceId;
  layoutMode: 'strip_all' | 'single_surface';
  showWireConductors: boolean;
  showInstallZones: boolean;
  showAllDimensions: boolean;
  enableSnap: boolean;
  selectedNodeId: string | null;
  activeCircuitFilter: string;
  draggingPaletteCategory: ElementCategory | null;
  onSelectSurface: (s: SurfaceId) => void;
  onSelectNode: (id: string | null) => void;
  onUpdateNodePosition: (nodeId: string, surface: SurfaceId, x: number, y: number) => void;
  onDropNewNode: (category: ElementCategory, surface: SurfaceId, x: number, y: number) => void;
  onInspectWiring: (nodeId: string) => void;
}

interface SurfaceRect {
  surface: SurfaceId;
  title: string;
  subtitle: string;
  svgX: number;
  svgY: number;
  widthMeters: number;
  heightMeters: number;
  pxWidth: number;
  pxHeight: number;
  hasJunctionBox?: boolean;
}

export const Blueprint2DCanvas: React.FC<Blueprint2DCanvasProps> = ({
  room,
  openings,
  nodes,
  circuits,
  segments,
  appliances,
  activeSurface,
  layoutMode,
  showWireConductors,
  showInstallZones,
  showAllDimensions,
  enableSnap,
  selectedNodeId,
  activeCircuitFilter,
  draggingPaletteCategory,
  onSelectSurface,
  onSelectNode,
  onUpdateNodePosition,
  onDropNewNode,
  onInspectWiring,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(115);
  const [hoverSnap, setHoverSnap] = useState<{
    surface: SurfaceId;
    snap: SnapResult;
  } | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const activeFocusNodeId = draggingNodeId || hoveredNodeId || selectedNodeId;

  // The wall with the primary/selected junction box sits in the MIDDLE,
  // with its left neighbor on the left, right neighbor on the right, and Strop directly above it!
  const junctionBoxWall: WallId = getPrimaryJunctionBoxWall(nodes, selectedNodeId);
  const wallOrder = getOrderedWallsAroundCenter(junctionBoxWall);

  const baseScale = layoutMode === 'single_surface' ? 180 : 105;
  const SCALE = Math.round((baseScale * zoomPercent) / 100);
  const WALL_GAP = Math.round(24 * (zoomPercent / 100));
  const PADDING = 44;

  const surfaceRects: SurfaceRect[] = [];

  if (layoutMode === 'single_surface') {
    const { width, height } = getSurfaceSize(activeSurface, room);
    const title =
      activeSurface === 'ceiling' ? 'Strop' : WALL_META[activeSurface].name;
    const subtitle = `${width.toFixed(2)} × ${height.toFixed(2)} m`;
    surfaceRects.push({
      surface: activeSurface,
      title,
      subtitle,
      svgX: PADDING,
      svgY: PADDING,
      widthMeters: width,
      heightMeters: height,
      pxWidth: width * SCALE,
      pxHeight: height * SCALE,
      hasJunctionBox: nodes.some(
        (n) => n.surface === activeSurface && n.category === 'junction_box'
      ),
    });
  } else {
    // 4 walls in a row: [leftWall, centerWall (with RK), rightWall, oppositeWall] + Ceiling above centerWall
    const wallH = room.height * SCALE;

    const isEastOrWest =
      junctionBoxWall === 'east' || junctionBoxWall === 'west';
    const ceilWidthMeters = isEastOrWest ? room.width : room.length;
    const ceilHeightMeters = isEastOrWest ? room.length : room.width;
    const ceilPxW = ceilWidthMeters * SCALE;
    const ceilPxH = ceilHeightMeters * SCALE;

    const wallRowY = PADDING + ceilPxH + WALL_GAP + 22;
    let currentX = PADDING;

    const wallRectMap: Record<WallId, SurfaceRect> = {} as Record<
      WallId,
      SurfaceRect
    >;

    for (let i = 0; i < wallOrder.length; i++) {
      const wId = wallOrder[i];
      const { width } = getSurfaceSize(wId, room);
      const pxW = width * SCALE;
      const hasRk = nodes.some(
        (n) => n.surface === wId && n.category === 'junction_box'
      );

      const rect: SurfaceRect = {
        surface: wId,
        title: WALL_META[wId].name,
        subtitle: `${width.toFixed(2)} × ${room.height.toFixed(2)} m`,
        svgX: currentX,
        svgY: wallRowY,
        widthMeters: width,
        heightMeters: room.height,
        pxWidth: pxW,
        pxHeight: wallH,
        hasJunctionBox: hasRk,
      };
      surfaceRects.push(rect);
      wallRectMap[wId] = rect;
      currentX += pxW + WALL_GAP;
    }

    const targetWallRect = wallRectMap[junctionBoxWall];
    surfaceRects.unshift({
      surface: 'ceiling',
      title: 'Strop',
      subtitle: `${ceilWidthMeters.toFixed(2)} × ${ceilHeightMeters.toFixed(2)} m`,
      svgX: targetWallRect.svgX,
      svgY: PADDING,
      widthMeters: ceilWidthMeters,
      heightMeters: ceilHeightMeters,
      pxWidth: ceilPxW,
      pxHeight: ceilPxH,
    });
  }

  const totalSvgWidth =
    Math.max(...surfaceRects.map((r) => r.svgX + r.pxWidth)) + PADDING;
  const totalSvgHeight =
    Math.max(...surfaceRects.map((r) => r.svgY + r.pxHeight)) + PADDING;

  // Uniform bottom-up Y coordinate on both walls and ceiling:
  // On walls, y = 0 is the floor (bottom edge) and y = height is the ceiling hinge (top edge).
  // On ceiling (Strop), y = 0 is the bottom hinge edge touching the top of centerWall!
  const toSvgCoords = (rect: SurfaceRect, xMeters: number, yMeters: number) => {
    const clampedX = Math.max(0, Math.min(rect.widthMeters, xMeters));
    const clampedY = Math.max(0, Math.min(rect.heightMeters, yMeters));
    const pxX = rect.svgX + clampedX * SCALE;
    const pxY = rect.svgY + (rect.heightMeters - clampedY) * SCALE;
    return { pxX, pxY };
  };

  /**
   * Offsets an orthogonal SVG polyline by `offsetPx` along each segment's normal
   * so individual L, N, PE conductors remain strictly orthogonal at every 90° corner.
   */
  const buildOrthogonalOffsetPathD = (
    svgPts: { pxX: number; pxY: number }[],
    offsetPx: number
  ): string => {
    if (svgPts.length === 0) return '';
    if (svgPts.length === 1 || Math.abs(offsetPx) < 0.05) {
      return svgPts
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.pxX} ${p.pxY}`)
        .join(' ');
    }

    const shifted = svgPts.map((p) => ({ pxX: p.pxX, pxY: p.pxY }));
    for (let i = 0; i < svgPts.length - 1; i++) {
      const p1 = svgPts[i];
      const p2 = svgPts[i + 1];
      const isHorizontal = Math.abs(p2.pxX - p1.pxX) >= Math.abs(p2.pxY - p1.pxY);
      if (isHorizontal) {
        shifted[i].pxY += offsetPx;
        shifted[i + 1].pxY += offsetPx;
      } else {
        shifted[i].pxX += offsetPx;
        shifted[i + 1].pxX += offsetPx;
      }
    }

    return shifted
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.pxX} ${p.pxY}`)
      .join(' ');
  };

  const pointerToSurfaceCoords = (
    clientX: number,
    clientY: number
  ): { rect: SurfaceRect; x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const transformed = pt.matrixTransform(ctm.inverse());

    for (const rect of surfaceRects) {
      if (
        transformed.x >= rect.svgX &&
        transformed.x <= rect.svgX + rect.pxWidth &&
        transformed.y >= rect.svgY &&
        transformed.y <= rect.svgY + rect.pxHeight
      ) {
        const rawX = (transformed.x - rect.svgX) / SCALE;
        const rawY = rect.heightMeters - (transformed.y - rect.svgY) / SCALE;
        return { rect, x: rawX, y: rawY };
      }
    }
    return null;
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNodeId && !draggingPaletteCategory) {
      return;
    }
    const hit = pointerToSurfaceCoords(e.clientX, e.clientY);
    if (!hit) {
      setHoverSnap(null);
      return;
    }

    const snap = computeSnapAndDimensions(
      hit.rect.surface,
      hit.x,
      hit.y,
      room,
      nodes,
      openings,
      draggingNodeId || undefined,
      enableSnap
    );

    setHoverSnap({ surface: hit.rect.surface, snap });

    if (draggingNodeId && !snap.collidingOpening) {
      onUpdateNodePosition(draggingNodeId, hit.rect.surface, snap.x, snap.y);
    }
  };

  const handlePointerUp = () => {
    setDraggingNodeId(null);
    setHoverSnap(null);
  };

  const handleDragOver = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    const hit = pointerToSurfaceCoords(e.clientX, e.clientY);
    if (!hit) {
      setHoverSnap(null);
      return;
    }
    const snap = computeSnapAndDimensions(
      hit.rect.surface,
      hit.x,
      hit.y,
      room,
      nodes,
      openings,
      undefined,
      enableSnap
    );
    setHoverSnap({ surface: hit.rect.surface, snap });
  };

  const handleDrop = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    const cat =
      (e.dataTransfer.getData('text/plain') as ElementCategory) ||
      draggingPaletteCategory;
    const hit = pointerToSurfaceCoords(e.clientX, e.clientY);
    if (cat && hit) {
      const snap = computeSnapAndDimensions(
        hit.rect.surface,
        hit.x,
        hit.y,
        room,
        nodes,
        openings,
        undefined,
        enableSnap
      );
      if (!snap.collidingOpening) {
        onDropNewNode(cat, hit.rect.surface, snap.x, snap.y);
      }
    }
    setHoverSnap(null);
  };

  const ceilRect = surfaceRects.find((r) => r.surface === 'ceiling');
  const rkWallRect = surfaceRects.find((r) => r.surface === junctionBoxWall);
  const rectBySurface = new Map<SurfaceId, SurfaceRect>(
    surfaceRects.map((r) => [r.surface, r])
  );

  // Build non-crossing horizontal & vertical inter-surface bridge lines
  const interSurfaceBridges: {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    isFocused: boolean;
  }[] = [];

  if (layoutMode === 'strip_all') {
    const filteredSegs = segments.filter(
      (s) =>
        activeCircuitFilter === 'all' || s.circuitId === activeCircuitFilter
    );

    // 1. Horizontal bridges between consecutive walls in the strip (-w1 -> -w2, -w2 -> -w3, -w3 -> -w4)
    for (const sCurr of filteredSegs) {
      const match = sCurr.id.match(/^(.*)-w(\d+)$/);
      if (!match) continue;
      const baseId = match[1];
      const hopNum = parseInt(match[2], 10);
      const sNext = filteredSegs.find((s) => s.id === `${baseId}-w${hopNum + 1}`);
      if (!sNext) continue;

      const r1 = rectBySurface.get(sCurr.surface);
      const r2 = rectBySurface.get(sNext.surface);
      if (!r1 || !r2) continue;

      const cir = circuits.find((c) => c.id === sCurr.circuitId);
      const color = cir?.color || '#38BDF8';
      const isFocused =
        activeFocusNodeId !== null &&
        (sCurr.fromNodeId === activeFocusNodeId ||
          sCurr.toNodeId === activeFocusNodeId);

      const p1 = toSvgCoords(
        r1,
        sCurr.points[sCurr.points.length - 1].x,
        sCurr.points[sCurr.points.length - 1].y
      );
      const p2 = toSvgCoords(r2, sNext.points[0].x, sNext.points[0].y);

      interSurfaceBridges.push({
        id: `bridge-${baseId}-${hopNum}`,
        x1: p1.pxX,
        y1: p1.pxY,
        x2: p2.pxX,
        y2: p2.pxY,
        color,
        isFocused,
      });
    }

    // 2. Continuous vertical bridges from Junction Box Wall up into Strop (seg-...-wall -> seg-...-ceiling)
    const wallToCeilSegs = filteredSegs.filter(
      (s) => s.id.endsWith('-wall') && s.surface === junctionBoxWall
    );
    for (const sWall of wallToCeilSegs) {
      if (!rkWallRect || !ceilRect) continue;
      const baseId = sWall.id.slice(0, -5);
      const sCeil = filteredSegs.find((s) => s.id === `${baseId}-ceiling`);
      const cir = circuits.find((c) => c.id === sWall.circuitId);
      const color = cir?.color || '#A855F7';
      const isFocused =
        activeFocusNodeId !== null &&
        (sWall.fromNodeId === activeFocusNodeId ||
          sWall.toNodeId === activeFocusNodeId);

      const topPt = toSvgCoords(
        rkWallRect,
        sWall.points[sWall.points.length - 1].x,
        sWall.points[sWall.points.length - 1].y
      );
      const ceilEntryPt = sCeil
        ? toSvgCoords(ceilRect, sCeil.points[0].x, sCeil.points[0].y)
        : { pxX: topPt.pxX, pxY: ceilRect.svgY + ceilRect.pxHeight };

      interSurfaceBridges.push({
        id: `bridge-light-${sWall.id}`,
        x1: topPt.pxX,
        y1: topPt.pxY,
        x2: ceilEntryPt.pxX,
        y2: ceilEntryPt.pxY,
        color,
        isFocused,
      });
    }
  }

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[#0D1117] select-none">
      {/* Subtle Zoom Pill in Bottom-Right Corner */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 px-2.5 py-1 bg-[#161B22]/90 border border-slate-800 rounded-lg text-xs no-print">
        <button
          onClick={() => setZoomPercent((z) => Math.max(70, z - 15))}
          className="p-1 text-slate-400 hover:text-white rounded"
          title="Smanji"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoomPercent(115)}
          className="px-1.5 font-mono text-[11px] text-slate-300 hover:text-white tabular-nums"
          title="Resetiraj zum"
        >
          {zoomPercent}%
        </button>
        <button
          onClick={() => setZoomPercent((z) => Math.min(200, z + 15))}
          className="p-1 text-slate-400 hover:text-white rounded"
          title="Povećaj"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Clean Architectural Canvas */}
      <div className="flex-1 overflow-auto p-4">
        <svg
          ref={svgRef}
          width={totalSvgWidth}
          height={totalSvgHeight}
          viewBox={`0 0 ${totalSvgWidth} ${totalSvgHeight}`}
          className="block mx-auto"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <defs>
            <pattern
              id="clean-grid-major"
              width={SCALE}
              height={SCALE}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`}
                fill="none"
                stroke="#1E2633"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          {/* Subtle connector between Strop and the Wall with the Razvodna kutija */}
          {layoutMode === 'strip_all' && ceilRect && rkWallRect && (
            <g pointerEvents="none">
              <line
                x1={ceilRect.svgX}
                y1={ceilRect.svgY + ceilRect.pxHeight}
                x2={rkWallRect.svgX}
                y2={rkWallRect.svgY}
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <line
                x1={ceilRect.svgX + ceilRect.pxWidth}
                y1={ceilRect.svgY + ceilRect.pxHeight}
                x2={rkWallRect.svgX + rkWallRect.pxWidth}
                y2={rkWallRect.svgY}
                stroke="#334155"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </g>
          )}

          {/* Parallel Inter-Wall & Wall-to-Ceiling Conduit Bridges */}
          {interSurfaceBridges.length > 0 && (
            <g pointerEvents="none">
              {interSurfaceBridges.map((b) => (
                <line
                  key={b.id}
                  x1={b.x1}
                  y1={b.y1}
                  x2={b.x2}
                  y2={b.y2}
                  stroke={b.color}
                  strokeOpacity={
                    activeFocusNodeId || hoveredSegmentId
                      ? b.isFocused
                        ? 0.95
                        : 0.25
                      : 0.65
                  }
                  strokeWidth={b.isFocused ? 2.2 : 1.7}
                  strokeDasharray="4 3"
                />
              ))}
            </g>
          )}

          {/* Render Each Surface (Ceiling + 4 Walls in a Row) */}
          {surfaceRects.map((rect) => {
            const isCurrentSurface = rect.surface === activeSurface;
            const surfaceOpenings =
              rect.surface === 'ceiling'
                ? []
                : openings.filter((o) => o.wall === rect.surface);
            const surfaceSegments = segments.filter(
              (s) =>
                s.surface === rect.surface &&
                (activeCircuitFilter === 'all' ||
                  s.circuitId === activeCircuitFilter)
            );
            const surfaceNodes = nodes.filter(
              (n) =>
                n.surface === rect.surface &&
                (activeCircuitFilter === 'all' ||
                  n.circuitId === activeCircuitFilter)
            );

            const activeSnapOnSurface =
              hoverSnap?.surface === rect.surface ? hoverSnap.snap : null;

            const inspectedNode =
              !activeSnapOnSurface && selectedNode?.surface === rect.surface
                ? selectedNode
                : null;

            return (
              <g key={rect.surface}>
                {/* Minimal Surface Header */}
                <g
                  className="cursor-pointer"
                  onClick={() => onSelectSurface(rect.surface)}
                >
                  <text
                    x={rect.svgX}
                    y={rect.svgY - 10}
                    fill={isCurrentSurface ? '#F8FAFC' : '#94A3B8'}
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {rect.title}
                  </text>
                  <text
                    x={rect.svgX + rect.pxWidth}
                    y={rect.svgY - 10}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {rect.subtitle}
                  </text>
                </g>

                {/* Surface Background & Calm 1m Grid */}
                <rect
                  x={rect.svgX}
                  y={rect.svgY}
                  width={rect.pxWidth}
                  height={rect.pxHeight}
                  fill="#131922"
                  onClick={() => {
                    onSelectSurface(rect.surface);
                    onSelectNode(null);
                  }}
                />
                <rect
                  x={rect.svgX}
                  y={rect.svgY}
                  width={rect.pxWidth}
                  height={rect.pxHeight}
                  fill="url(#clean-grid-major)"
                  pointerEvents="none"
                />
                <rect
                  x={rect.svgX}
                  y={rect.svgY}
                  width={rect.pxWidth}
                  height={rect.pxHeight}
                  fill="none"
                  stroke={isCurrentSurface ? '#64748B' : '#263040'}
                  strokeWidth={isCurrentSurface ? 1.8 : 1}
                  pointerEvents="none"
                />

                {/* Subtle Installation Zone Hairlines (Only when dragging or toggled) */}
                {(showInstallZones || draggingNodeId || draggingPaletteCategory) &&
                  rect.surface !== 'ceiling' && (
                    <g pointerEvents="none">
                      <line
                        x1={rect.svgX}
                        y1={rect.svgY + 0.3 * SCALE}
                        x2={rect.svgX + rect.pxWidth}
                        y2={rect.svgY + 0.3 * SCALE}
                        stroke="#1E3A5F"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={rect.svgX}
                        y1={rect.svgY + (rect.heightMeters - 0.3) * SCALE}
                        x2={rect.svgX + rect.pxWidth}
                        y2={rect.svgY + (rect.heightMeters - 0.3) * SCALE}
                        stroke="#1E3A5F"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                    </g>
                  )}

                {/* Doors & Windows — Clean Architectural Outline */}
                {surfaceOpenings.map((op) => {
                  const topLeft = toSvgCoords(
                    rect,
                    op.offsetFromLeft,
                    op.sillHeight + op.height
                  );
                  const wPx = op.width * SCALE;
                  const hPx = op.height * SCALE;
                  const isColliding =
                    activeSnapOnSurface?.collidingOpening?.id === op.id;

                  return (
                    <g key={op.id} pointerEvents="none">
                      <rect
                        x={topLeft.pxX}
                        y={topLeft.pxY}
                        width={wPx}
                        height={hPx}
                        fill={
                          isColliding
                            ? 'rgba(239, 68, 68, 0.25)'
                            : '#0D1117'
                        }
                        stroke={isColliding ? '#EF4444' : '#334155'}
                        strokeWidth={isColliding ? 2 : 1.2}
                      />
                      <text
                        x={topLeft.pxX + wPx / 2}
                        y={topLeft.pxY + hPx / 2 + 3}
                        textAnchor="middle"
                        fill="#64748B"
                        fontSize="10"
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {op.label} ({op.width}×{op.height}m)
                      </text>
                    </g>
                  );
                })}

                {/* Routed Parallel Conduits & Smart Progressive Wire Display */}
                {surfaceSegments.map((seg) => {
                  const cir = circuits.find((c) => c.id === seg.circuitId);
                  const cColor = cir?.color || '#38BDF8';
                  const svgPts = seg.points.map((p) => toSvgCoords(rect, p.x, p.y));

                  const isFocused =
                    hoveredSegmentId === seg.id ||
                    (activeFocusNodeId !== null &&
                      (seg.fromNodeId === activeFocusNodeId ||
                        seg.toNodeId === activeFocusNodeId));

                  let bestMidX = 0;
                  let bestMidY = 0;
                  let maxSegPx = 0;
                  for (let i = 1; i < svgPts.length; i++) {
                    const d = Math.hypot(
                      svgPts[i].pxX - svgPts[i - 1].pxX,
                      svgPts[i].pxY - svgPts[i - 1].pxY
                    );
                    if (d > maxSegPx) {
                      maxSegPx = d;
                      bestMidX = (svgPts[i].pxX + svgPts[i - 1].pxX) / 2;
                      bestMidY = (svgPts[i].pxY + svgPts[i - 1].pxY) / 2;
                    }
                  }

                  const pathD = buildOrthogonalOffsetPathD(svgPts, 0);

                  // KISS Principle: Each conduit is rendered as its own parallel line in its track;
                  // Individual L, N, PE conductors expand when hovered/selected or when showWireConductors is on.
                  const expandWiresHere = showWireConductors || isFocused;

                  if (!expandWiresHere) {
                    return (
                      <g
                        key={seg.id}
                        className="cursor-pointer"
                        onPointerEnter={() => setHoveredSegmentId(seg.id)}
                        onPointerLeave={() => setHoveredSegmentId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectNode(seg.toNodeId);
                        }}
                      >
                        {/* Invisible wider hit-area so user can easily hover any parallel conduit line */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="7"
                        />
                        <path
                          d={pathD}
                          fill="none"
                          stroke={cColor}
                          strokeOpacity={
                            activeFocusNodeId || hoveredSegmentId
                              ? 0.35
                              : seg.isMainFeeder
                              ? 0.95
                              : 0.8
                          }
                          strokeWidth={seg.isMainFeeder ? 2.7 : 1.9}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  }

                  const count = seg.conductors.length;
                  const spacing = isFocused ? 2.8 : 2.0;
                  return (
                    <g
                      key={seg.id}
                      className="cursor-pointer"
                      onPointerEnter={() => setHoveredSegmentId(seg.id)}
                      onPointerLeave={() => setHoveredSegmentId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(seg.toNodeId);
                      }}
                      opacity={
                        (activeFocusNodeId || hoveredSegmentId) && !isFocused
                          ? 0.35
                          : 1
                      }
                    >
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="10"
                      />
                      {seg.conductors.map((cond, cIdx) => {
                        const offsetPx = (cIdx - (count - 1) / 2) * spacing;
                        const meta = CONDUCTOR_META[cond];
                        const strokeColor = meta?.colorHex || '#F8FAFC';
                        const isPE = cond === 'PE';
                        const d = buildOrthogonalOffsetPathD(svgPts, offsetPx);

                        return (
                          <path
                            key={`${seg.id}-${cond}-${cIdx}`}
                            d={d}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={isFocused ? 1.9 : 1.3}
                            strokeDasharray={isPE ? '4 2' : undefined}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })}

                      {/* Show conduit & wire spec badge ONLY on the focused segment */}
                      {isFocused && maxSegPx > 55 && (
                        <g
                          transform={`translate(${bestMidX}, ${bestMidY})`}
                          pointerEvents="none"
                        >
                          <rect
                            x={seg.isMainFeeder ? -86 : -64}
                            y="-10"
                            width={seg.isMainFeeder ? 172 : 128}
                            height="20"
                            rx="4"
                            fill="#0D1117"
                            stroke={seg.isMainFeeder ? '#F59E0B' : '#475569'}
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="3.5"
                            textAnchor="middle"
                            fill="#E2E8F0"
                            fontSize="9"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {seg.isMainFeeder
                              ? `GLAVNI VOD (${seg.fedDevicesCount || 0} ur.) · `
                              : ''}
                            {seg.conductors
                              .map((c) => CONDUCTOR_META[c]?.short || c)
                              .join('·')}{' '}
                            · Ø{seg.conduitDiameterMm} ({seg.lengthMeters}m)
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Subtle Snap Alignment Guides (Only while actively dragging) */}
                {activeSnapOnSurface && (
                  <g pointerEvents="none">
                    {activeSnapOnSurface.snappedXNodeId && (
                      <line
                        x1={toSvgCoords(rect, activeSnapOnSurface.x, 0).pxX}
                        y1={rect.svgY}
                        x2={toSvgCoords(rect, activeSnapOnSurface.x, 0).pxX}
                        y2={rect.svgY + rect.pxHeight}
                        stroke="#38BDF8"
                        strokeWidth="1.2"
                        strokeDasharray="4 4"
                      />
                    )}
                    {(activeSnapOnSurface.snappedYNodeId ||
                      activeSnapOnSurface.snappedStandardHeight !== undefined) && (
                      <line
                        x1={rect.svgX}
                        y1={toSvgCoords(rect, 0, activeSnapOnSurface.y).pxY}
                        x2={rect.svgX + rect.pxWidth}
                        y2={toSvgCoords(rect, 0, activeSnapOnSurface.y).pxY}
                        stroke="#38BDF8"
                        strokeWidth="1.2"
                        strokeDasharray="4 4"
                      />
                    )}
                  </g>
                )}

                {/* Contextual Kote od Poda i Stropa (Only for selected/dragged node or when showAllDimensions is on) */}
                {(activeSnapOnSurface || inspectedNode || showAllDimensions) &&
                  surfaceNodes
                    .filter(
                      (n) =>
                        showAllDimensions ||
                        n.id === draggingNodeId ||
                        n.id === inspectedNode?.id
                    )
                    .map((dimNode) => {
                      const pt = toSvgCoords(rect, dimNode.x, dimNode.y);
                      const floorY = rect.svgY + rect.pxHeight;
                      const ceilY = rect.svgY;
                      const kotaPoda = dimNode.y;
                      const kotaStropa = Number(
                        (rect.heightMeters - dimNode.y).toFixed(2)
                      );

                      return (
                        <g key={`dim-${dimNode.id}`} pointerEvents="none">
                          {/* Line to Floor */}
                          <line
                            x1={pt.pxX}
                            y1={pt.pxY + 15}
                            x2={pt.pxX}
                            y2={floorY}
                            stroke="#64748B"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={pt.pxX + 6}
                            y={(pt.pxY + floorY) / 2 + 3}
                            fill="#94A3B8"
                            fontSize="9.5"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ↓{kotaPoda.toFixed(2)}m
                          </text>

                          {/* Line to Ceiling */}
                          <line
                            x1={pt.pxX}
                            y1={ceilY}
                            x2={pt.pxX}
                            y2={pt.pxY - 15}
                            stroke="#64748B"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={pt.pxX + 6}
                            y={(pt.pxY + ceilY) / 2 + 3}
                            fill="#94A3B8"
                            fontSize="9.5"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ↑{kotaStropa.toFixed(2)}m
                          </text>

                          {/* Horizontal distance from left corner */}
                          {(dimNode.id === draggingNodeId ||
                            dimNode.id === inspectedNode?.id) && (
                            <>
                              <line
                                x1={rect.svgX}
                                y1={pt.pxY}
                                x2={pt.pxX - 15}
                                y2={pt.pxY}
                                stroke="#64748B"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                              />
                              <text
                                x={(rect.svgX + pt.pxX) / 2}
                                y={pt.pxY - 6}
                                textAnchor="middle"
                                fill="#94A3B8"
                                fontSize="9.5"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                ↔{dimNode.x.toFixed(2)}m
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}

                {/* Electrical Elements (Clean, Calm Nodes) */}
                {surfaceNodes.map((node) => {
                  const { pxX, pxY } = toSvgCoords(rect, node.x, node.y);
                  const cir = circuits.find((c) => c.id === node.circuitId);
                  const cColor = cir?.color || '#38BDF8';
                  const meta = ELEMENT_CATALOG[node.category];
                  const isSelected = node.id === selectedNodeId;
                  const isHovered = node.id === hoveredNodeId;
                  const connectedApps = appliances.filter(
                    (a) => a.assignedNodeId === node.id
                  );
                  const fedByThisBoxCount =
                    node.category === 'junction_box'
                      ? segments.find(
                          (s) => s.toNodeId === node.id && s.isMainFeeder
                        )?.fedDevicesCount ||
                        nodes.filter((n) => n.parentBoxId === node.id).length
                      : 0;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pxX}, ${pxY})`}
                      className="cursor-move"
                      onPointerEnter={() => setHoveredNodeId(node.id)}
                      onPointerLeave={() => setHoveredNodeId(null)}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelectSurface(rect.surface);
                        onSelectNode(node.id);
                        setDraggingNodeId(node.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onInspectWiring(node.id);
                      }}
                    >
                      {isSelected && (
                        <circle
                          r={node.category === 'distribution_board' ? 24 : 19}
                          fill="rgba(56, 189, 248, 0.12)"
                          stroke="#38BDF8"
                          strokeWidth="1.5"
                        />
                      )}

                      {node.category === 'distribution_board' ? (
                        <g>
                          {/* Incoming Main Supply Line (Dolazni glavni vod iz gornjeg lijevog kuta) */}
                          <path
                            d={`M ${rect.svgX - pxX} ${rect.svgY - pxY + 10} L -19 ${
                              rect.svgY - pxY + 10
                            } L -19 0`}
                            fill="none"
                            stroke="#F59E0B"
                            strokeWidth="2.6"
                            strokeDasharray="5 3"
                          />
                          <text
                            x="-16"
                            y={Math.max(-36, rect.svgY - pxY + 6)}
                            fill="#FBBF24"
                            fontSize="8.5"
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ⚡ DOLAZNI VOD
                          </text>
                          <rect
                            x="-19"
                            y="-15"
                            width="38"
                            height="30"
                            rx="4"
                            fill="#0F172A"
                            stroke={isSelected ? '#38BDF8' : '#F59E0B'}
                            strokeWidth={isSelected ? 2.4 : 2.0}
                          />
                          {/* Inner DIN breaker rail visual */}
                          <line
                            x1="-14"
                            y1="-6"
                            x2="14"
                            y2="-6"
                            stroke="#F59E0B"
                            strokeOpacity="0.45"
                            strokeWidth="1.5"
                          />
                        </g>
                      ) : node.category === 'junction_box' ? (
                        <rect
                          x="-13"
                          y="-13"
                          width="26"
                          height="26"
                          rx="5"
                          fill="#161B22"
                          stroke={isSelected ? '#38BDF8' : cColor}
                          strokeWidth={isSelected ? 2.2 : 1.8}
                        />
                      ) : node.category === 'socket_double' ? (
                        <rect
                          x="-15"
                          y="-12"
                          width="30"
                          height="24"
                          rx="6"
                          fill="#161B22"
                          stroke={isSelected ? '#38BDF8' : cColor}
                          strokeWidth={isSelected ? 2.2 : 1.6}
                        />
                      ) : (
                        <circle
                          r="13"
                          fill="#161B22"
                          stroke={isSelected ? '#38BDF8' : cColor}
                          strokeWidth={isSelected ? 2.2 : 1.6}
                        />
                      )}

                      <text
                        x="0"
                        y={node.category === 'distribution_board' ? '5' : '3.5'}
                        textAnchor="middle"
                        fill={
                          node.category === 'distribution_board'
                            ? '#FBBF24'
                            : '#F1F5F9'
                        }
                        fontSize="9.5"
                        fontWeight="700"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {meta?.shortCode || 'EL'}
                      </text>

                      {/* Small badge on RK showing how many devices share its main feeder */}
                      {node.category === 'junction_box' && fedByThisBoxCount > 0 && (
                        <g transform="translate(12, -12)">
                          <rect
                            x="-9"
                            y="-7"
                            width="18"
                            height="13"
                            rx="3.5"
                            fill="#0D1117"
                            stroke={cColor}
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="2.5"
                            textAnchor="middle"
                            fill="#E2E8F0"
                            fontSize="8"
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            ×{fedByThisBoxCount}
                          </text>
                        </g>
                      )}

                      {/* Small, quiet code underneath; full details only when selected/hovered */}
                      <text
                        x="0"
                        y={node.category === 'distribution_board' ? '27' : '24'}
                        textAnchor="middle"
                        fill={isSelected || isHovered ? '#F8FAFC' : '#64748B'}
                        fontSize="9.5"
                        fontWeight={isSelected ? '600' : '500'}
                        fontFamily="Plus Jakarta Sans, sans-serif"
                      >
                        {node.label.split(' ')[0]}
                        {connectedApps.length > 0 ? ' •' : ''}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
