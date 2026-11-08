import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Lock, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { CONDUCTOR_META, WALL_META } from '../data/presets';
import {
  computeSnapAndDimensions,
  getOrderedWallsAroundCenter,
  getPrimaryJunctionBoxWall,
  SnapResult,
} from '../engine/electricalEngine';
import { computeFurnitureDrag } from '../engine/furniture';
import { computeOpeningDrag, OpeningDragResult } from '../engine/openingDrag';
import { applianceIcon } from './applianceIcons';
import {
  Box,
  ceilingToView,
  ELEMENT_FOOTPRINT,
  formatMeters,
  getCeilingViewSize,
  getSurfaceSize,
  isNodeOutsideSurface,
  placeLabels,
  Point,
  viewToCeiling,
} from '../engine/geometry';
import {
  ApplianceItem,
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  FurnitureItem,
  RoomDimensions,
  RoutedSegment,
  SurfaceId,
  WallId,
  WallOpening,
} from '../types/electrical';

export interface CanvasLayers {
  wires: boolean;
  zones: boolean;
  dimensions: boolean;
  snap: boolean;
  appliances: boolean;
  furniture: boolean;
}

export interface CanvasHandle {
  previewPaletteDrop: (clientX: number, clientY: number) => void;
  commitPaletteDrop: (
    category: ElementCategory,
    clientX: number,
    clientY: number
  ) => void;
  clearPreview: () => void;
  /** Highlights the socket under the pointer and returns its id. */
  highlightSocketAt: (clientX: number, clientY: number) => string | null;
  clearSocketHighlight: () => void;
}

interface Props {
  room: RoomDimensions;
  openings: WallOpening[];
  nodes: ElectricalNode[];
  circuits: ElectricalCircuit[];
  segments: RoutedSegment[];
  appliances: ApplianceItem[];
  furniture: FurnitureItem[];
  openingsEditable: boolean;
  activeSurface: SurfaceId;
  layoutMode: 'strip_all' | 'single_surface';
  layers: CanvasLayers;
  selectedNodeId: string | null;
  circuitFilter: string;
  canDrag: boolean;
  onSelectSurface: (surface: SurfaceId) => void;
  onSelectNode: (id: string | null) => void;
  onMoveNode: (id: string, surface: SurfaceId, x: number, y: number, dragKey: string) => void;
  onDropNewNode: (category: ElementCategory, surface: SurfaceId, x: number, y: number) => void;
  onBlockedDrop: (message: string) => void;
  onMoveOpening: (id: string, wall: WallId, offset: number, sill: number, dragKey: string) => void;
  onMoveFurniture: (id: string, wall: WallId, offset: number, bottom: number, dragKey: string) => void;
}

interface SurfaceRect {
  surface: SurfaceId;
  caption: string;
  /** Position in metres within the drawing. */
  xM: number;
  yM: number;
  widthM: number;
  heightM: number;
}

const INK = '#222222';
const WALL = '#111111';
const GRID = '#E2E2DE';
const OPENING = '#ECECE8';
const OPENING_LINE = '#333333';
const SELECT = '#C2007A';
const FURNITURE = '#EFEFEC';
const FURNITURE_LINE = '#C4C4BF';
const FURNITURE_TEXT = '#9A9A95';
const ERROR = '#B3261E';
const PAD_X = 34;
const PAD_TOP = 14;
const PAD_BOTTOM = 46;
const ZOOM_STEP = 1.25;
const SHORT: Record<WallId, string> = {
  north: 'Sjever',
  east: 'Istok',
  south: 'Jug',
  west: 'Zapad',
};

function buildRects(
  room: RoomDimensions,
  center: WallId,
  layoutMode: Props['layoutMode'],
  activeSurface: SurfaceId
): { rects: SurfaceRect[]; widthM: number; heightM: number } {
  const dims = (w: number, h: number) => `${formatMeters(w)} × ${formatMeters(h)} m`;
  const ceiling = getCeilingViewSize(room, center);

  if (layoutMode === 'single_surface') {
    const size =
      activeSurface === 'ceiling' ? ceiling : getSurfaceSize(activeSurface, room);
    return {
      rects: [
        {
          surface: activeSurface,
          caption: `${
            activeSurface === 'ceiling' ? 'Strop' : WALL_META[activeSurface].name
          } · ${dims(size.width, size.height)}`,
          xM: 0,
          yM: 0,
          widthM: size.width,
          heightM: size.height,
        },
      ],
      widthM: size.width,
      heightM: size.height,
    };
  }

  const rects: SurfaceRect[] = [];
  let x = 0;
  for (const wall of getOrderedWallsAroundCenter(center)) {
    const { width, height } = getSurfaceSize(wall, room);
    rects.push({
      surface: wall,
      caption: `${SHORT[wall]} · ${dims(width, height)}`,
      xM: x,
      yM: ceiling.height,
      widthM: width,
      heightM: height,
    });
    x += width;
  }
  const centerRect = rects.find((r) => r.surface === center)!;
  rects.unshift({
    surface: 'ceiling',
    caption: `Strop · ${dims(ceiling.width, ceiling.height)}`,
    xM: centerRect.xM,
    yM: 0,
    widthM: ceiling.width,
    heightM: ceiling.height,
  });
  return { rects, widthM: x, heightM: ceiling.height + room.height };
}

function offsetPath(points: { x: number; y: number }[], offset: number): string {
  const shifted = points.map((p) => ({ ...p }));
  if (Math.abs(offset) > 0.01) {
    for (let i = 0; i < points.length - 1; i++) {
      const horizontal =
        Math.abs(points[i + 1].x - points[i].x) >=
        Math.abs(points[i + 1].y - points[i].y);
      const key = horizontal ? 'y' : 'x';
      shifted[i][key] = points[i][key] + offset;
      shifted[i + 1][key] = points[i + 1][key] + offset;
    }
  }
  return shifted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

const CHAR_WIDTH = 5.7;

type OpeningLabel =
  | { kind: 'inside'; lines: string[] }
  | { kind: 'rotated'; text: string }
  | { kind: 'outside'; lines: string[]; x: number; y: number; box: Box };

/** Picks a readable place for an opening's typed size at the current scale. */
function layoutOpeningLabel(
  op: WallOpening,
  x: number,
  y: number,
  w: number,
  h: number,
  surface: { x: number; y: number; width: number; height: number }
): OpeningLabel {
  const name = op.type === 'door' ? 'Vrata' : 'Prozor';
  const size = `${formatMeters(op.width)} × ${formatMeters(op.height)}`;
  if (w >= size.length * CHAR_WIDTH + 6 && h >= 30) {
    return { kind: 'inside', lines: [name, size] };
  }
  const first = `${formatMeters(op.width)} ×`;
  if (w >= Math.max(name.length, first.length) * CHAR_WIDTH + 4 && h >= 44) {
    return { kind: 'inside', lines: [name, first, formatMeters(op.height)] };
  }
  const text = `${name} ${size}`;
  const textWidth = text.length * CHAR_WIDTH + 4;
  if (w >= 16 && h >= textWidth + 6) return { kind: 'rotated', text };
  const floor = surface.y + surface.height;
  if (y + h + 44 <= floor) {
    const lines = [name, first, formatMeters(op.height)];
    const width = Math.max(name.length, first.length) * CHAR_WIDTH + 4;
    const left = Math.min(x, surface.x + surface.width - width);
    return {
      kind: 'outside',
      lines,
      x: left,
      y: y + h + 13,
      box: [left, y + h + 2, width, 40],
    };
  }
  const left = Math.min(x, surface.x + surface.width - textWidth);
  return {
    kind: 'outside',
    lines: [text],
    x: left,
    y: y - 4,
    box: [left, y - 15, textWidth, 15],
  };
}

function niceBarMeters(scale: number): number {
  for (const m of [0.1, 0.25, 0.5, 1, 2, 5]) {
    if (m * scale >= 50) return m;
  }
  return 10;
}

export const Blueprint2DCanvas = forwardRef<CanvasHandle, Props>(function Blueprint2DCanvas(
  {
    room,
    openings,
    nodes,
    circuits,
    segments,
    appliances,
    furniture,
    openingsEditable,
    activeSurface,
    layoutMode,
    layers,
    selectedNodeId,
    circuitFilter,
    canDrag,
    onSelectSurface,
    onSelectNode,
    onMoveNode,
    onDropNewNode,
    onBlockedDrop,
    onMoveOpening,
    onMoveFurniture,
  },
  ref
) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 500 });
  const [view, setView] = useState<{ zoom: number; panX: number; panY: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [socketHighlight, setSocketHighlight] = useState<string | null>(null);
  const [openingDrag, setOpeningDrag] = useState<{
    kind: 'opening' | 'furniture';
    id: string;
    key: string;
    grabX: number;
    grabY: number;
    result: OpeningDragResult | null;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinchDistance = useRef<number | null>(null);
  const didPan = useRef(false);
  const [dragging, setDragging] = useState<{ id: string; key: string } | null>(null);
  const [snapPreview, setSnapPreview] = useState<{
    surface: SurfaceId;
    snap: SnapResult;
  } | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAtRef.current(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    setView(null);
  }, [layoutMode, layoutMode === 'single_surface' ? activeSurface : '']);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const center = getPrimaryJunctionBoxWall(nodes, selectedNodeId);
  const wallRects = buildRects(room, center, layoutMode, activeSurface);
  const { rects, widthM, heightM } = wallRects;

  // One factor for both axes, so the drawing can never be stretched.
  const fitScale = Math.max(
    8,
    Math.min(
      (viewport.width - PAD_X * 2) / widthM,
      (viewport.height - PAD_TOP - PAD_BOTTOM) / heightM
    )
  );
  const zoom = view?.zoom ?? 1;
  const scale = fitScale * zoom;
  const svgWidth = widthM * scale + PAD_X * 2;
  const svgHeight = heightM * scale + PAD_TOP + PAD_BOTTOM;
  const panX = view ? view.panX : (viewport.width - svgWidth) / 2;
  const panY = view ? view.panY : (viewport.height - svgHeight) / 2;

  const clampPan = (x: number, y: number, w: number, h: number) => ({
    panX: Math.max(80 - w, Math.min(viewport.width - 80, x)),
    panY: Math.max(80 - h, Math.min(viewport.height - 80, y)),
  });

  /** Changes zoom keeping the point under the given screen position still. */
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const bounds = scrollerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const nextZoom = Math.max(0.5, Math.min(12, zoom * factor));
    const nextScale = fitScale * nextZoom;
    const ox = clientX - bounds.left;
    const oy = clientY - bounds.top;
    const worldX = (ox - panX - PAD_X) / scale;
    const worldY = (oy - panY - PAD_TOP) / scale;
    setView({
      zoom: nextZoom,
      ...clampPan(
        ox - PAD_X - worldX * nextScale,
        oy - PAD_TOP - worldY * nextScale,
        widthM * nextScale + PAD_X * 2,
        heightM * nextScale + PAD_TOP + PAD_BOTTOM
      ),
    });
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  const zoomFromCenter = (factor: number) => {
    const bounds = scrollerRef.current?.getBoundingClientRect();
    if (bounds) zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, factor);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
      panStart.current = null;
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchDistance.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / pinchDistance.current);
      pinchDistance.current = distance;
      return;
    }
    const start = panStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) > 3) {
      start.moved = true;
      scrollerRef.current?.setPointerCapture(e.pointerId);
      setPanning(true);
    }
    if (start.moved) {
      setView({ zoom, ...clampPan(start.panX + dx, start.panY + dy, svgWidth, svgHeight) });
    }
  };

  const handleCanvasPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    pinchDistance.current = null;
    if (panStart.current?.moved) {
      didPan.current = true;
      window.setTimeout(() => {
        didPan.current = false;
      });
    }
    panStart.current = null;
    setPanning(false);
  };

  const rectOf = (surface: SurfaceId) => rects.find((r) => r.surface === surface);
  const pxRect = (r: SurfaceRect) => ({
    x: PAD_X + r.xM * scale,
    y: PAD_TOP + r.yM * scale,
    width: r.widthM * scale,
    height: r.heightM * scale,
  });

  /** Position in a surface's drawn axes (origin bottom-left) to pixels. */
  const viewToPx = (r: SurfaceRect, x: number, y: number) => {
    const box = pxRect(r);
    return { x: box.x + x * scale, y: box.y + (r.heightM - y) * scale };
  };

  const storedToPx = (r: SurfaceRect, p: Point) =>
    r.surface === 'ceiling'
      ? (() => {
          const v = ceilingToView(p, room, center);
          return viewToPx(r, v.x, v.y);
        })()
      : viewToPx(r, p.x, p.y);

  const pointerToStored = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const bounds = svg.getBoundingClientRect();
    const px = clientX - bounds.left;
    const py = clientY - bounds.top;
    for (const r of rects) {
      const box = pxRect(r);
      if (
        px >= box.x &&
        px <= box.x + box.width &&
        py >= box.y &&
        py <= box.y + box.height
      ) {
        const view = {
          x: (px - box.x) / scale,
          y: r.heightM - (py - box.y) / scale,
        };
        const stored =
          r.surface === 'ceiling' ? viewToCeiling(view, room, center) : view;
        return { surface: r.surface, ...stored };
      }
    }
    return null;
  };

  const snapAt = (clientX: number, clientY: number, excludeId?: string) => {
    const hit = pointerToStored(clientX, clientY);
    if (!hit) return null;
    return {
      surface: hit.surface,
      snap: computeSnapAndDimensions(
        hit.surface,
        hit.x,
        hit.y,
        room,
        nodes,
        openings,
        excludeId,
        layers.snap
      ),
    };
  };

  useImperativeHandle(ref, () => ({
    previewPaletteDrop: (x, y) => setSnapPreview(snapAt(x, y)),
    clearPreview: () => setSnapPreview(null),
    highlightSocketAt: (clientX, clientY) => {
      const bounds = svgRef.current?.getBoundingClientRect();
      if (!bounds) return null;
      let found: string | null = null;
      let nearest = 40;
      for (const n of nodes.filter((item) => item.category.startsWith('socket_'))) {
        const r = rectOf(n.surface);
        if (!r) continue;
        const p = storedToPx(r, n);
        const distance = Math.hypot(clientX - bounds.left - p.x, clientY - bounds.top - p.y);
        if (distance < nearest) {
          nearest = distance;
          found = n.id;
        }
      }
      setSocketHighlight(found);
      return found;
    },
    clearSocketHighlight: () => setSocketHighlight(null),
    commitPaletteDrop: (category, x, y) => {
      const result = snapAt(x, y);
      setSnapPreview(null);
      if (!result) return;
      if (result.snap.collidingOpening) {
        onBlockedDrop('Element ne može preko vrata ili prozora.');
        return;
      }
      onDropNewNode(category, result.surface, result.snap.x, result.snap.y);
    },
  }));

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (openingDrag) {
      const hit = pointerToStored(e.clientX, e.clientY);
      if (hit && hit.surface !== 'ceiling') {
        const rawX = hit.x - openingDrag.grabX;
        const rawY = hit.y - openingDrag.grabY;
        const opening = openings.find((o) => o.id === openingDrag.id);
        const piece = furniture.find((f) => f.id === openingDrag.id);
        const result =
          openingDrag.kind === 'opening' && opening
            ? computeOpeningDrag(opening, hit.surface, rawX, rawY, room, openings, nodes, furniture)
            : piece
            ? computeFurnitureDrag(piece, hit.surface, rawX, rawY, room, furniture, openings)
            : null;
        if (result) {
          setOpeningDrag({ ...openingDrag, result });
          if (result.valid) {
            (openingDrag.kind === 'opening' ? onMoveOpening : onMoveFurniture)(
              openingDrag.id,
              result.wall,
              result.offsetFromLeft,
              result.sillHeight,
              openingDrag.key
            );
          }
        }
      }
      return;
    }
    if (!dragging) return;
    const result = snapAt(e.clientX, e.clientY, dragging.id);
    setSnapPreview(result);
    if (result && !result.snap.collidingOpening) {
      onMoveNode(dragging.id, result.surface, result.snap.x, result.snap.y, dragging.key);
    }
  };

  const endDrag = () => {
    setOpeningDrag(null);
    setDragging(null);
    setSnapPreview(null);
  };

  const visibleSegments = segments.filter(
    (s) => circuitFilter === 'all' || s.circuitId === circuitFilter
  );
  const visibleNodes = nodes.filter(
    (n) => circuitFilter === 'all' || n.circuitId === circuitFilter
  );
  const colorOf = (id: string) => circuits.find((c) => c.id === id)?.color ?? INK;
  const selected = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const dragActive = dragging !== null || snapPreview !== null;

  const showApplianceNames = scale >= 75;
  const appsOn = (nodeId: string) =>
    layers.appliances ? appliances.filter((a) => a.assignedNodeId === nodeId) : [];
  const shortName = (app: ApplianceItem) => app.name.split(' ')[0];
  const codeWidth = (text: string) => text.length * 6.7 + 8;
  const tagWidth = (apps: ApplianceItem[]) =>
    apps.length === 0
      ? 0
      : apps.reduce(
          (sum, a) => sum + 16 + (showApplianceNames ? shortName(a).length * 5.9 + 3 : 0),
          4
        );

  // Label layout, one pass per surface, the selected element first.
  const labels = new Map<string, { x: number; y: number; text: string; width: number }>();
  for (const r of rects) {
    const box = pxRect(r);
    const onSurface = visibleNodes
      .filter((n) => n.surface === r.surface)
      .sort((a, b) => Number(b.id === selectedNodeId) - Number(a.id === selectedNodeId));
    const obstacles: Box[] = openings
      .filter((o) => o.wall === r.surface)
      .flatMap((o) => {
        const p = viewToPx(r, o.offsetFromLeft, o.sillHeight + o.height);
        const w = o.width * scale;
        const h = o.height * scale;
        const label = layoutOpeningLabel(o, p.x, p.y, w, h, box);
        return label.kind === 'outside'
          ? ([[p.x, p.y, w, h], label.box] as Box[])
          : ([[p.x, p.y, w, h]] as Box[]);
      });
    if (selected?.surface === r.surface) {
      const p = storedToPx(r, selected);
      obstacles.push([p.x - 2, box.y, 4, box.height], [box.x, p.y - 2, p.x - box.x, 4]);
      obstacles.push([p.x - 45, box.y + box.height - 18, 42, 15]);
      obstacles.push([p.x - 21, (p.y + box.y) / 2 + 4, 42, 15]);
      obstacles.push([(p.x + box.x) / 2 - 23, p.y - 19, 42, 15]);
    }
    const textOf = (n: ElectricalNode) => {
      const base = n.label.split(' ')[0];
      if (n.category !== 'junction_box') return base;
      const fed = nodes.filter((d) => d.parentBoxId === n.id).length;
      return fed > 0 ? `${base} ×${fed}` : base;
    };
    const requests = onSurface.map((n) => {
      const p = storedToPx(r, n);
      const footprint = ELEMENT_FOOTPRINT[n.category];
      const text = textOf(n);
      return {
        id: n.id,
        x: p.x,
        y: p.y,
        anchorWidth: footprint.width * scale,
        anchorHeight: footprint.height * scale,
        labelWidth: codeWidth(text) + tagWidth(appsOn(n.id)),
        labelHeight: 15,
        gap: n.id === selectedNodeId ? 12 : 5,
        bounds: box,
      };
    });
    const cableBoxes: Box[] = [];
    for (const seg of visibleSegments.filter((s) => s.surface === r.surface)) {
      const pts = seg.points.map((p) => storedToPx(r, p));
      for (let i = 1; i < pts.length; i++) {
        cableBoxes.push([
          Math.min(pts[i - 1].x, pts[i].x) - 1,
          Math.min(pts[i - 1].y, pts[i].y) - 1,
          Math.abs(pts[i - 1].x - pts[i].x) + 2,
          Math.abs(pts[i - 1].y - pts[i].y) + 2,
        ]);
      }
    }
    placeLabels(requests, obstacles, cableBoxes).forEach((pos, id) => {
      const node = onSurface.find((n) => n.id === id)!;
      labels.set(id, { ...pos, text: textOf(node), width: codeWidth(textOf(node)) });
    });
  }

  const barMeters = niceBarMeters(scale);

  return (
    <div className="relative w-full h-full bg-desk select-none" data-testid="nacrt">
      <div
        ref={scrollerRef}
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: 'none', cursor: panning ? 'grabbing' : 'grab' }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerEnd}
        onPointerCancel={handleCanvasPointerEnd}
      >
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="absolute left-0 top-0 bg-paper"
          style={{ overflow: 'visible', transform: `translate(${panX}px, ${panY}px)` }}
          data-scale={scale}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {rects.map((r) => {
            const box = pxRect(r);
            const isActive = r.surface === activeSurface;
            return (
              <g key={`base-${r.surface}`}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="#FFFFFF"
                  onClick={() => {
                    if (didPan.current) return;
                    onSelectSurface(r.surface);
                    onSelectNode(null);
                  }}
                />
                {Array.from({ length: Math.ceil(r.widthM) - 1 }, (_, i) => i + 1).map((m) => (
                  <line
                    key={`v${m}`}
                    x1={box.x + m * scale}
                    y1={box.y}
                    x2={box.x + m * scale}
                    y2={box.y + box.height}
                    stroke={GRID}
                    pointerEvents="none"
                  />
                ))}
                {Array.from({ length: Math.ceil(r.heightM) - 1 }, (_, i) => i + 1).map((m) => (
                  <line
                    key={`h${m}`}
                    x1={box.x}
                    y1={box.y + box.height - m * scale}
                    x2={box.x + box.width}
                    y2={box.y + box.height - m * scale}
                    stroke={GRID}
                    pointerEvents="none"
                  />
                ))}
                {(layers.zones || dragActive) && r.surface !== 'ceiling' && (
                  <g stroke={INK} strokeDasharray="4 4" pointerEvents="none">
                    <line x1={box.x} x2={box.x + box.width} y1={box.y + 0.3 * scale} y2={box.y + 0.3 * scale} />
                    <line
                      x1={box.x}
                      x2={box.x + box.width}
                      y1={box.y + box.height - 0.3 * scale}
                      y2={box.y + box.height - 0.3 * scale}
                    />
                  </g>
                )}
                {r.surface === 'ceiling' ? (
                  <text
                    x={box.x + 8}
                    y={box.y + 18}
                    fontSize="12.5"
                    fontWeight={isActive ? 800 : 700}
                    fill={INK}
                    pointerEvents="none"
                  >
                    {box.width < r.caption.length * 6.6 ? r.caption.split(' · ')[0] : r.caption}
                  </text>
                ) : (
                  <text
                    x={box.x + box.width / 2}
                    y={box.y + box.height + 18}
                    textAnchor="middle"
                    fontSize="12.5"
                    fontWeight={isActive ? 800 : 700}
                    textDecoration={isActive ? 'underline' : undefined}
                    fill={INK}
                    className="cursor-pointer"
                    onClick={() => onSelectSurface(r.surface)}
                  >
                    {box.width < r.caption.length * 6.6 ? r.caption.split(' · ')[0] : r.caption}
                  </text>
                )}
              </g>
            );
          })}

          {openings
            .filter((o) => rectOf(o.wall))
            .map((op) => {
              const r = rectOf(op.wall)!;
              const p = viewToPx(r, op.offsetFromLeft, op.sillHeight + op.height);
              const w = op.width * scale;
              const h = op.height * scale;
              const colliding = snapPreview?.snap.collidingOpening?.id === op.id;
              const label = layoutOpeningLabel(op, p.x, p.y, w, h, pxRect(r));
              return (
                <g
                  key={op.id}
                  data-testid={`otvor-${op.type}-${op.wall}`}
                  pointerEvents={openingsEditable ? undefined : 'none'}
                  className={openingsEditable ? 'cursor-move' : undefined}
                  onPointerDown={(e) => {
                    if (!openingsEditable) return;
                    e.stopPropagation();
                    const hit = pointerToStored(e.clientX, e.clientY);
                    if (!hit || hit.surface === 'ceiling') return;
                    dragCounter.current += 1;
                    setOpeningDrag({
                      kind: 'opening',
                      id: op.id,
                      key: `opening-${dragCounter.current}`,
                      grabX: hit.x - op.offsetFromLeft,
                      grabY: hit.y - op.sillHeight,
                      result: null,
                    });
                    svgRef.current?.setPointerCapture(e.pointerId);
                  }}
                >
                  <rect
                    x={p.x}
                    y={p.y}
                    width={w}
                    height={h}
                    fill={colliding ? '#F9DEDC' : OPENING}
                    stroke={colliding ? ERROR : OPENING_LINE}
                    strokeWidth={colliding ? 2.5 : 1.5}
                  />
                  {label.kind === 'inside' && (
                    <text
                      x={p.x + w / 2}
                      y={p.y + h / 2 + 4 - ((label.lines.length - 1) * 13) / 2}
                      textAnchor="middle"
                      fontSize="11"
                      fill={INK}
                    >
                      {label.lines.map((line, i) => (
                        <tspan key={line} x={p.x + w / 2} dy={i === 0 ? 0 : 13}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                  {label.kind === 'rotated' && (
                    <text
                      transform={`translate(${p.x + w / 2 + 4},${p.y + h / 2}) rotate(-90)`}
                      textAnchor="middle"
                      fontSize="11"
                      fill={INK}
                    >
                      {label.text}
                    </text>
                  )}
                  {label.kind === 'outside' && (
                    <text
                      x={label.x}
                      y={label.y}
                      fontSize="11"
                      fill={INK}
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {label.lines.map((line, i) => (
                        <tspan key={line} x={label.x} dy={i === 0 ? 0 : 13}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                </g>
              );
            })}

          {layers.furniture &&
            furniture
              .filter((f) => rectOf(f.wall))
              .map((f) => {
                const r = rectOf(f.wall)!;
                const p = viewToPx(r, f.offsetFromLeft, f.bottom + f.height);
                const w = f.width * scale;
                const h = f.height * scale;
                const textWidth = f.name.length * 5.6;
                const fitsAcross = w >= textWidth + 6;
                const fitsAlong = !fitsAcross && h >= textWidth + 6 && w >= 14;
                return (
                  <g
                    key={f.id}
                    data-testid={`namjestaj-${f.name}`}
                    pointerEvents={openingsEditable ? undefined : 'none'}
                    className={openingsEditable ? 'cursor-move' : undefined}
                    onPointerDown={(e) => {
                      if (!openingsEditable) return;
                      e.stopPropagation();
                      const hit = pointerToStored(e.clientX, e.clientY);
                      if (!hit || hit.surface === 'ceiling') return;
                      dragCounter.current += 1;
                      setOpeningDrag({
                        kind: 'furniture',
                        id: f.id,
                        key: `furniture-${dragCounter.current}`,
                        grabX: hit.x - f.offsetFromLeft,
                        grabY: hit.y - f.bottom,
                        result: null,
                      });
                      svgRef.current?.setPointerCapture(e.pointerId);
                    }}
                  >
                    <title>{`${f.name} · ${formatMeters(f.width)} × ${formatMeters(f.height)} × ${formatMeters(f.depth)} m`}</title>
                    <rect x={p.x} y={p.y} width={w} height={h} fill={FURNITURE} stroke={FURNITURE_LINE} />
                    {fitsAcross && (
                      <text x={p.x + w / 2} y={h >= 34 ? p.y + 15 : p.y + h / 2 + 4} textAnchor="middle" fontSize="10.5" fill={FURNITURE_TEXT}>
                        {f.name}
                      </text>
                    )}
                    {fitsAlong && (
                      <text
                        transform={`translate(${p.x + w / 2 + 4},${p.y + h / 2}) rotate(-90)`}
                        textAnchor="middle"
                        fontSize="10.5"
                        fill={FURNITURE_TEXT}
                      >
                        {f.name}
                      </text>
                    )}
                  </g>
                );
              })}

          {visibleSegments
            .filter((s) => rectOf(s.surface))
            .map((seg) => {
              const r = rectOf(seg.surface)!;
              const pts = seg.points.map((p) => storedToPx(r, p));
              const focused =
                selectedNodeId !== null &&
                (seg.fromNodeId === selectedNodeId || seg.toNodeId === selectedNodeId);
              const dimmed = selectedNodeId !== null && !focused;
              const d = offsetPath(pts, 0);
              const color = colorOf(seg.circuitId);
              return (
                <g
                  key={seg.id}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.4 : 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!didPan.current) onSelectNode(seg.toNodeId);
                  }}
                >
                  <path d={d} fill="none" stroke="transparent" strokeWidth="10" />
                  {layers.wires || focused ? (
                    seg.conductors.map((c, i) => (
                      <path
                        key={`${c}-${i}`}
                        d={offsetPath(pts, (i - (seg.conductors.length - 1) / 2) * 2.4)}
                        fill="none"
                        stroke={CONDUCTOR_META[c]?.colorHex ?? INK}
                        strokeWidth="1.5"
                        strokeDasharray={c === 'PE' ? '4 2' : undefined}
                      />
                    ))
                  ) : (
                    <path d={d} fill="none" stroke={color} strokeWidth={seg.isMainFeeder ? 2.4 : 1.5} />
                  )}
                </g>
              );
            })}

          {rects.map((r) => {
            const box = pxRect(r);
            return (
              <rect
                key={`edge-${r.surface}`}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="none"
                stroke={WALL}
                strokeWidth="2"
                pointerEvents="none"
              />
            );
          })}

          {snapPreview && rectOf(snapPreview.surface) && (() => {
            const r = rectOf(snapPreview.surface)!;
            const size = getSurfaceSize(snapPreview.surface, room);
            const { snap } = snapPreview;
            const a = storedToPx(r, { x: snap.x, y: 0 });
            const b = storedToPx(r, { x: snap.x, y: size.height });
            const c = storedToPx(r, { x: 0, y: snap.y });
            const d = storedToPx(r, { x: size.width, y: snap.y });
            const showY = snap.snappedYNodeId || snap.snappedStandardHeight !== undefined;
            return (
              <g stroke={SELECT} strokeWidth="1.2" strokeDasharray="4 4" pointerEvents="none">
                {(snap.snappedXNodeId || !showY) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                {(showY || !snap.snappedXNodeId) && <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} />}
              </g>
            );
          })()}

          {layers.dimensions &&
            visibleNodes
              .filter((n) => n.surface !== 'ceiling' && n.id !== selectedNodeId && rectOf(n.surface))
              .map((n) => {
                const r = rectOf(n.surface)!;
                const p = storedToPx(r, n);
                const floor = pxRect(r).y + pxRect(r).height;
                return (
                  <g key={`dim-${n.id}`} pointerEvents="none">
                    <line x1={p.x} y1={p.y} x2={p.x} y2={floor} stroke={INK} strokeDasharray="2 3" />
                    <text x={p.x + 3} y={floor - 3} fontSize="10.5" fill={INK}>
                      {formatMeters(n.y)}
                    </text>
                  </g>
                );
              })}

          {visibleNodes
            .filter((n) => rectOf(n.surface))
            .map((node) => {
              const r = rectOf(node.surface)!;
              const p = storedToPx(r, node);
              const footprint = ELEMENT_FOOTPRINT[node.category];
              const w = footprint.width * scale;
              const h = footprint.height * scale;
              const outside = isNodeOutsideSurface(node, room);
              const color = outside ? ERROR : colorOf(node.circuitId);
              const hollow = node.category === 'light_ceiling';
              return (
                <g
                  key={node.id}
                  data-testid={`element-${node.label.split(' ')[0]}`}
                  className={canDrag ? 'cursor-move' : 'cursor-pointer'}
                  style={{ touchAction: canDrag ? 'none' : undefined }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectSurface(node.surface);
                    onSelectNode(node.id);
                    if (canDrag) {
                      dragCounter.current += 1;
                      setDragging({ id: node.id, key: `drag-${dragCounter.current}` });
                      svgRef.current?.setPointerCapture(e.pointerId);
                    }
                  }}
                >
                  <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
                  {footprint.shape === 'rect' ? (
                    <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} fill={color} />
                  ) : (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={w / 2}
                      fill={hollow ? 'none' : color}
                      stroke={color}
                      strokeWidth="1.5"
                    />
                  )}
                  {hollow && (
                    <path
                      d={`M${p.x - w * 0.35} ${p.y - w * 0.35}L${p.x + w * 0.35} ${p.y + w * 0.35}M${p.x + w * 0.35} ${p.y - w * 0.35}L${p.x - w * 0.35} ${p.y + w * 0.35}`}
                      stroke={color}
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              );
            })}

          {visibleNodes
            .filter((n) => labels.has(n.id) && (scale >= 22 || n.id === selectedNodeId))
            .map((node) => {
              const pos = labels.get(node.id)!;
              const isSelected = node.id === selectedNodeId;
              const outside = isNodeOutsideSurface(node, room);
              return (
                <g
                  key={`label-${node.id}`}
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectSurface(node.surface);
                    onSelectNode(node.id);
                  }}
                >
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={pos.width}
                    height={15}
                    rx={2}
                    fill={isSelected ? SELECT : outside ? ERROR : colorOf(node.circuitId)}
                  />
                  <text
                    x={pos.x + pos.width / 2}
                    y={pos.y + 11.3}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {pos.text}
                  </text>
                  {appsOn(node.id).length > 0 && (() => {
                    let cursor = pos.x + pos.width + 4;
                    const apps = appsOn(node.id);
                    return (
                      <g data-testid={`tag-${node.label.split(' ')[0]}`}>
                        <rect
                          x={pos.x + pos.width}
                          y={pos.y}
                          width={tagWidth(apps)}
                          height={15}
                          fill="#FFFFFF"
                          stroke={colorOf(node.circuitId)}
                        />
                        {apps.map((app) => {
                          const Icon = applianceIcon(app);
                          const x = cursor;
                          cursor += 16 + (showApplianceNames ? shortName(app).length * 5.9 + 3 : 0);
                          return (
                            <g key={app.id}>
                              <title>{`${app.name} · ${app.powerWatts} W`}</title>
                              <Icon x={x} y={pos.y + 1.5} width={12} height={12} color={INK} />
                              {showApplianceNames && (
                                <text x={x + 15} y={pos.y + 11.3} fontSize="10.5" fill={INK}>
                                  {shortName(app)}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })()}
                </g>
              );
            })}

          {socketHighlight && (() => {
            const node = nodes.find((n) => n.id === socketHighlight);
            const r = node && rectOf(node.surface);
            if (!node || !r) return null;
            const p = storedToPx(r, node);
            return <circle cx={p.x} cy={p.y} r={16} fill="none" stroke="#00693A" strokeWidth="3" pointerEvents="none" />;
          })()}

          {openingDrag?.result && rectOf(openingDrag.result.wall) && (() => {
            const opening =
              openingDrag.kind === 'opening'
                ? openings.find((o) => o.id === openingDrag.id)
                : furniture.find((f) => f.id === openingDrag.id);
            if (!opening) return null;
            const { result } = openingDrag;
            const r = rectOf(result.wall)!;
            const box = pxRect(r);
            const topLeft = viewToPx(r, result.offsetFromLeft, result.sillHeight + opening.height);
            const w = opening.width * scale;
            const h = opening.height * scale;
            const color = result.valid ? SELECT : ERROR;
            const midY = topLeft.y + h / 2;
            const midX = topLeft.x + w / 2;
            const floor = box.y + box.height;
            const tag = (x: number, y: number, value: number) => (
              <g>
                <rect x={x - 22} y={y - 8} width={44} height={15} fill="#FFFFFF" />
                <text x={x} y={y + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={color}>
                  {formatMeters(value)}
                </text>
              </g>
            );
            const wallWidth = r.widthM;
            const right = wallWidth - result.offsetFromLeft - opening.width;
            const above = r.heightM - result.sillHeight - opening.height;
            const locked = result.valid ? result.locks : [];
            return (
              <g pointerEvents="none">
                {locked.map((lock) => {
                  const a = lock.axis === 'x' ? viewToPx(r, lock.guide, 0) : viewToPx(r, 0, lock.guide);
                  const b = lock.axis === 'x' ? viewToPx(r, lock.guide, r.heightM) : viewToPx(r, r.widthM, lock.guide);
                  return <line key={lock.label} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#00693A" strokeWidth="2" strokeDasharray="6 3" />;
                })}
                <rect
                  x={topLeft.x}
                  y={topLeft.y}
                  width={w}
                  height={h}
                  fill={result.valid ? 'none' : '#F9DEDC'}
                  fillOpacity={0.7}
                  stroke={color}
                  strokeWidth="2.5"
                  strokeDasharray={result.valid ? undefined : '5 3'}
                />
                <g stroke={color} strokeWidth="1.5">
                  <line x1={box.x} y1={midY} x2={topLeft.x} y2={midY} />
                  <line x1={topLeft.x + w} y1={midY} x2={box.x + box.width} y2={midY} />
                  <line x1={midX} y1={box.y} x2={midX} y2={topLeft.y} />
                  {result.sillHeight > 0 && <line x1={midX} y1={topLeft.y + h} x2={midX} y2={floor} />}
                </g>
                {tag((box.x + topLeft.x) / 2, midY - 10, result.offsetFromLeft)}
                {tag((topLeft.x + w + box.x + box.width) / 2, midY - 10, right)}
                {tag(midX, (box.y + topLeft.y) / 2, above)}
                {result.sillHeight > 0 && tag(midX, (topLeft.y + h + floor) / 2, result.sillHeight)}
                <g data-testid="otvor-status">
                  <rect
                    x={topLeft.x}
                    y={Math.max(box.y + 2, topLeft.y - 21)}
                    width={Math.max(
                      28,
                      (result.reason ?? locked.map((l) => l.label).join(' · ')).length * 6.3 + 24
                    )}
                    height={18}
                    rx={3}
                    fill={result.valid ? '#00693A' : ERROR}
                  />
                  {result.valid && (
                    <Lock x={topLeft.x + 5} y={Math.max(box.y + 2, topLeft.y - 21) + 3} width={12} height={12} color="#FFFFFF" />
                  )}
                  <text
                    x={topLeft.x + (result.valid ? 21 : 6)}
                    y={Math.max(box.y + 2, topLeft.y - 21) + 13}
                    fontSize="11.5"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {result.reason ?? locked.map((l) => l.label).join(' · ')}
                  </text>
                </g>
              </g>
            );
          })()}

          {selected && rectOf(selected.surface) && (() => {
            const r = rectOf(selected.surface)!;
            const box = pxRect(r);
            const p = storedToPx(r, selected);
            const tag = (x: number, y: number, text: string) => (
              <g>
                <rect x={x - 22} y={y - 8} width={44} height={15} fill="#FFFFFF" />
                <text x={x} y={y + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={SELECT}>
                  {text}
                </text>
              </g>
            );
            if (selected.surface === 'ceiling') {
              const toWest = storedToPx(r, { x: 0, y: selected.y });
              const toSouth = storedToPx(r, { x: selected.x, y: 0 });
              return (
                <g pointerEvents="none">
                  <circle cx={p.x} cy={p.y} r={10} fill="none" stroke={SELECT} strokeWidth="2.2" />
                  <g stroke={SELECT} strokeWidth="1.5">
                    <line x1={p.x} y1={p.y} x2={toWest.x} y2={toWest.y} />
                    <line x1={p.x} y1={p.y} x2={toSouth.x} y2={toSouth.y} />
                  </g>
                  {tag((p.x + toWest.x) / 2, (p.y + toWest.y) / 2 - 9, formatMeters(selected.x))}
                  {tag((p.x + toSouth.x) / 2 + 24, (p.y + toSouth.y) / 2, formatMeters(selected.y))}
                </g>
              );
            }
            const floor = box.y + box.height;
            return (
              <g pointerEvents="none">
                <circle cx={p.x} cy={p.y} r={10} fill="none" stroke={SELECT} strokeWidth="2.2" />
                <g stroke={SELECT} strokeWidth="1.5">
                  <line x1={p.x} y1={p.y + 10} x2={p.x} y2={floor} />
                  <line x1={p.x} y1={p.y - 10} x2={p.x} y2={box.y} />
                  <line x1={p.x - 10} y1={p.y} x2={box.x} y2={p.y} />
                </g>
                {tag(p.x - 25, floor - 10, formatMeters(selected.y))}
                {tag(p.x, (p.y + box.y) / 2 + 11, formatMeters(room.height - selected.y))}
                {tag((p.x + box.x) / 2 - 2, p.y - 11, formatMeters(selected.x))}
              </g>
            );
          })()}
        </svg>
      </div>

      <div className="absolute bottom-3 left-3 flex items-end gap-2 px-2 py-1 bg-paper border border-line rounded no-print pointer-events-none">
        <div data-testid="mjerna-traka" style={{ width: barMeters * scale }}>
          <div className="text-center text-[12px] font-semibold leading-tight">
            {formatMeters(barMeters)} m
          </div>
          <div className="h-1.5 border-x-2 border-b-2 border-ink" />
        </div>
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 p-0.5 bg-paper border border-line rounded no-print">
        <button className="icon-btn" aria-label="Smanji" onClick={() => zoomFromCenter(1 / ZOOM_STEP)}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="icon-btn" aria-label="Prilagodi prozoru" onClick={() => setView(null)}>
          <Maximize className="w-4 h-4" />
        </button>
        <button className="icon-btn" aria-label="Povećaj" onClick={() => zoomFromCenter(ZOOM_STEP)}>
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
