import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Ruler,
  SlidersHorizontal,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { Blueprint2DCanvas } from './components/Blueprint2DCanvas';
import { BomAndPrintModal } from './components/BomAndPrintModal';
import { UnfoldedRoom3D } from './components/UnfoldedRoom3D';
import { WiringSchematicModal } from './components/WiringSchematicModal';
import {
  APPLIANCE_CATALOG_TEMPLATES,
  ELEMENT_CATALOG,
  INITIAL_APPLIANCES,
  INITIAL_CIRCUITS,
  INITIAL_NODES,
  INITIAL_OPENINGS,
  INITIAL_ROOM,
  WALL_META,
} from './data/presets';
import {
  analyzeProject,
  computeRoutedSegments,
  getSurfaceSize,
  resolveNodeParentBox,
} from './engine/electricalEngine';
import {
  ApplianceItem,
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  OpeningType,
  RoomDimensions,
  SurfaceId,
  WallId,
  WallOpening,
} from './types/electrical';

type ActiveDrawer = 'none' | 'prostorija' | 'elementi' | 'trosila_krugovi';
type ViewportMode = '2d_strip' | '2d_single' | '3d_unfold';

export default function App() {
  // 1. Core Project State
  const [room, setRoom] = useState<RoomDimensions>(INITIAL_ROOM);
  const [openings, setOpenings] = useState<WallOpening[]>(INITIAL_OPENINGS);
  const [nodes, setNodes] = useState<ElectricalNode[]>(INITIAL_NODES);
  const [circuits, setCircuits] = useState<ElectricalCircuit[]>(INITIAL_CIRCUITS);
  const [appliances, setAppliances] = useState<ApplianceItem[]>(INITIAL_APPLIANCES);

  // 2. KISS Progressive Disclosure State
  // Default: no heavy sidebars open, just a compact floating element dock and clean full-width canvas
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('elementi');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('2d_strip');
  const [unfoldAmount, setUnfoldAmount] = useState<number>(0.25);
  const [activeSurface, setActiveSurface] = useState<SurfaceId>('west');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeCircuitFilter, setActiveCircuitFilter] = useState<string>('all');

  // 3. Smart View Options (Quiet by default — details appear on hover/select)
  const [showWireConductors, setShowWireConductors] = useState<boolean>(false);
  const [showInstallZones, setShowInstallZones] = useState<boolean>(false);
  const [showAllDimensions, setShowAllDimensions] = useState<boolean>(false);
  const [enableSnap, setEnableSnap] = useState<boolean>(true);
  const [showViewOptionsPopover, setShowViewOptionsPopover] =
    useState<boolean>(false);
  const [draggingPaletteCategory, setDraggingPaletteCategory] =
    useState<ElementCategory | null>(null);

  // 4. Modals
  const [showWiringModal, setShowWiringModal] = useState<boolean>(false);
  const [showBomModal, setShowBomModal] = useState<boolean>(false);

  // 5. New Opening Form State
  const [newOpWall, setNewOpWall] = useState<WallId>('west');
  const [newOpType, setNewOpType] = useState<OpeningType>('window');
  const [newOpWidth, setNewOpWidth] = useState<number>(1.2);
  const [newOpHeight, setNewOpHeight] = useState<number>(1.3);
  const [newOpOffset, setNewOpOffset] = useState<number>(1.0);
  const [newOpSill, setNewOpSill] = useState<number>(0.9);

  // 6. Custom Appliance Form State
  const [customAppName, setCustomAppName] = useState<string>('');
  const [customAppWatts, setCustomAppWatts] = useState<number>(1500);

  // Compute routed cable/conduit segments and full analysis
  const segments = useMemo(
    () => computeRoutedSegments(room, nodes, circuits, openings),
    [room, nodes, circuits, openings]
  );

  const { socketBalance, circuitAnalyses, bom } = useMemo(
    () => analyzeProject(nodes, appliances, circuits, segments),
    [nodes, appliances, circuits, segments]
  );

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const selectedNodeCircuit = useMemo(
    () =>
      selectedNode
        ? circuits.find((c) => c.id === selectedNode.circuitId) || null
        : null,
    [selectedNode, circuits]
  );

  const handleRoomChange = (field: keyof RoomDimensions, val: number) => {
    const clamped = Math.max(1.8, Math.min(20, Number(val) || 2.0));
    setRoom((prev) => ({ ...prev, [field]: clamped }));
  };

  const handleUpdateNodePosition = (
    nodeId: string,
    surface: SurfaceId,
    x: number,
    y: number
  ) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              surface,
              x: Number(x.toFixed(2)),
              y: Number(y.toFixed(2)),
            }
          : n
      )
    );
  };

  const handleAddNode = (
    category: ElementCategory,
    surface: SurfaceId,
    x?: number,
    y?: number
  ) => {
    const meta = ELEMENT_CATALOG[category];
    const finalSurface: SurfaceId =
      category === 'light_ceiling'
        ? 'ceiling'
        : surface === 'ceiling' && category !== 'junction_box'
        ? 'north'
        : surface;
    const targetSize = getSurfaceSize(finalSurface, room);

    const posX =
      x !== undefined ? x : Number((targetSize.width * 0.5).toFixed(2));
    const posY =
      y !== undefined
        ? y
        : finalSurface === 'ceiling'
        ? Number((targetSize.height * 0.5).toFixed(2))
        : Math.min(targetSize.height - 0.15, meta.defaultHeightMeters);

    const defaultCircuit =
      category.startsWith('light_') || category.startsWith('switch_')
        ? circuits.find((c) => c.breakerAmps === 10)?.id || circuits[0].id
        : activeCircuitFilter !== 'all'
        ? activeCircuitFilter
        : circuits[0].id;

    const mainRo = nodes.find((n) => n.category === 'distribution_board');
    const sameWallRk = nodes.find(
      (n) =>
        n.category === 'junction_box' &&
        n.circuitId === defaultCircuit &&
        n.surface === finalSurface
    );
    const circuitDefaultBoxId = circuits.find(
      (c) => c.id === defaultCircuit
    )?.mainJunctionBoxId;

    const existingCount =
      nodes.filter((n) => n.category === category).length + 1;
    const newId = `node-${category}-${Date.now()}`;
    const newNode: ElectricalNode = {
      id: newId,
      surface: finalSurface,
      category,
      label:
        category === 'distribution_board'
          ? `RO-${existingCount} (Razvodni ormar s osiguračima)`
          : category === 'junction_box'
          ? `RK-${existingCount} (Razvodna kutija)`
          : `${meta.shortCode}-${existingCount} (${meta.name.split(' ')[0]})`,
      x: posX,
      y: posY,
      circuitId: defaultCircuit,
      parentBoxId:
        category === 'distribution_board'
          ? undefined
          : category === 'junction_box'
          ? mainRo?.id
          : sameWallRk?.id || circuitDefaultBoxId || mainRo?.id,
    };

    setNodes((prev) => {
      // When user drops a new Razvodna kutija (RK) on a wall, automatically attach
      // devices on that same wall & circuit so 1 main feeder serves all of them!
      if (category === 'junction_box') {
        const updated = prev.map((n) => {
          if (
            n.category !== 'distribution_board' &&
            n.category !== 'junction_box' &&
            n.circuitId === defaultCircuit &&
            n.surface === finalSurface
          ) {
            return { ...n, parentBoxId: newId };
          }
          return n;
        });
        return [...updated, newNode];
      }
      return [...prev, newNode];
    });
    setSelectedNodeId(newId);
    setActiveSurface(finalSurface);
  };

  const handleGroupCircuitDevicesWithNewRk = (
    circuitId: string,
    wall: SurfaceId
  ) => {
    const targetWall: WallId = wall === 'ceiling' ? 'north' : wall;
    const targetDevices = nodes.filter(
      (n) =>
        n.category !== 'distribution_board' &&
        n.category !== 'junction_box' &&
        n.circuitId === circuitId &&
        (n.surface === targetWall || (wall === 'ceiling' && n.surface === 'ceiling'))
    );
    const avgX =
      targetDevices.length > 0
        ? Number(
            (
              targetDevices.reduce((s, d) => s + d.x, 0) / targetDevices.length
            ).toFixed(2)
          )
        : Number((getSurfaceSize(targetWall, room).width * 0.5).toFixed(2));
    const mainRo = nodes.find((n) => n.category === 'distribution_board');
    const rkCount =
      nodes.filter((n) => n.category === 'junction_box').length + 1;
    const cir = circuits.find((c) => c.id === circuitId);
    const newRkId = `node-rk-${Date.now()}`;
    const newRk: ElectricalNode = {
      id: newRkId,
      surface: targetWall,
      category: 'junction_box',
      label: `RK-${rkCount} (Razvodna kutija ${cir?.code || 'SK'})`,
      x: avgX,
      y: Number(Math.max(0.35, room.height - 0.3).toFixed(2)),
      circuitId,
      parentBoxId: mainRo?.id,
    };

    setNodes((prev) => [
      ...prev.map((n) =>
        n.category !== 'distribution_board' &&
        n.category !== 'junction_box' &&
        n.circuitId === circuitId &&
        (n.surface === targetWall || n.id === selectedNodeId)
          ? { ...n, parentBoxId: newRkId }
          : n
      ),
      newRk,
    ]);
    setSelectedNodeId(newRkId);
  };

  const handleDeleteNode = (nodeId: string) => {
    const mainRo = nodes.find(
      (n) => n.category === 'distribution_board' && n.id !== nodeId
    );
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n) =>
          n.parentBoxId === nodeId ? { ...n, parentBoxId: mainRo?.id } : n
        )
    );
    setAppliances((prev) =>
      prev.map((a) =>
        a.assignedNodeId === nodeId ? { ...a, assignedNodeId: undefined } : a
      )
    );
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  const handleAddOpening = () => {
    const wallW = getSurfaceSize(newOpWall, room).width;
    const width = Math.min(wallW - 0.2, Math.max(0.4, newOpWidth));
    const offset = Math.min(wallW - width - 0.05, Math.max(0.05, newOpOffset));
    const sill = newOpType === 'door' ? 0 : Math.max(0, newOpSill);
    const height = Math.min(
      room.height - sill - 0.05,
      Math.max(0.5, newOpHeight)
    );

    const newOp: WallOpening = {
      id: `op-${Date.now()}`,
      wall: newOpWall,
      type: newOpType,
      label: newOpType === 'door' ? 'Vrata' : 'Prozor',
      offsetFromLeft: Number(offset.toFixed(2)),
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
      sillHeight: Number(sill.toFixed(2)),
    };
    setOpenings((prev) => [...prev, newOp]);
  };

  const handleAddApplianceFromCatalog = (
    tpl: (typeof APPLIANCE_CATALOG_TEMPLATES)[number]
  ) => {
    const targetCircuit =
      tpl.category === 'kuhinja'
        ? circuits.find((c) => c.name.toLowerCase().includes('kuhinj'))?.id ||
          circuits[0].id
        : tpl.category === 'klima_grijanje'
        ? circuits.find((c) => c.name.toLowerCase().includes('klim'))?.id ||
          circuits[0].id
        : circuits[0].id;

    const newApp: ApplianceItem = {
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: tpl.name,
      category: tpl.category,
      powerWatts: tpl.powerWatts,
      requiresDedicatedCircuit: tpl.requiresDedicatedCircuit,
      threePhase: tpl.threePhase,
      circuitId: targetCircuit,
    };
    setAppliances((prev) => [...prev, newApp]);
  };

  const handleAddCustomAppliance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAppName.trim()) return;
    const newApp: ApplianceItem = {
      id: `app-custom-${Date.now()}`,
      name: customAppName.trim(),
      category: 'ostalo',
      powerWatts: Math.max(10, Number(customAppWatts) || 500),
      requiresDedicatedCircuit: customAppWatts >= 2500,
      circuitId: circuits[0].id,
    };
    setAppliances((prev) => [...prev, newApp]);
    setCustomAppName('');
  };

  const handleAutoAdaptNetwork = () => {
    let updatedCircuits = [...circuits];
    let updatedNodes = [...nodes];
    let updatedAppliances = [...appliances];

    const mainJunctionBox =
      updatedNodes.find((n) => n.category === 'junction_box') ||
      updatedNodes[0];

    for (const app of updatedAppliances) {
      if (app.requiresDedicatedCircuit || app.powerWatts >= 2500) {
        const appsInSameCircuit = updatedAppliances.filter(
          (a) => a.circuitId === app.circuitId
        );
        if (appsInSameCircuit.length > 1) {
          const newCirId = `cir-auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
          const nextNum = updatedCircuits.length + 1;
          const colors = ['#F59E0B', '#EC4899', '#14B8A6', '#8B5CF6', '#EF4444'];
          const newCircuit: ElectricalCircuit = {
            id: newCirId,
            code: `SK-${nextNum}`,
            name: `Zasebni: ${app.name.slice(0, 16)}`,
            breakerAmps: 16,
            breakerCurve: 'B',
            phaseType: app.threePhase ? '3P' : '1P',
            cableCrossSection: 2.5,
            color: colors[nextNum % colors.length],
            mainJunctionBoxId: mainJunctionBox?.id || 'node-rk-1',
          };
          updatedCircuits.push(newCircuit);
          app.circuitId = newCirId;

          if (app.assignedNodeId) {
            updatedNodes = updatedNodes.map((n) =>
              n.id === app.assignedNodeId ? { ...n, circuitId: newCirId } : n
            );
          } else {
            const newSocketId = `node-auto-sock-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
            updatedNodes.push({
              id: newSocketId,
              surface: 'west',
              category: app.threePhase ? 'socket_shuko_3p' : 'socket_single',
              label: `U-${updatedNodes.length + 1} (${app.name.split(' ')[0]})`,
              x: Number(
                Math.min(
                  room.width - 0.3,
                  0.4 + (updatedNodes.length % 5) * 0.55
                ).toFixed(2)
              ),
              y: 0.6,
              circuitId: newCirId,
            });
            app.assignedNodeId = newSocketId;
          }
        }
      }
    }

    const currentOutlets1P = updatedNodes.reduce(
      (acc, n) =>
        acc +
        (n.category === 'socket_single'
          ? 1
          : n.category === 'socket_double'
          ? 2
          : 0),
      0
    );
    const total1PApps = updatedAppliances.filter((a) => !a.threePhase).length;
    let deficit = total1PApps - currentOutlets1P;

    while (deficit > 0) {
      const isDouble = deficit >= 2;
      const newSockId = `node-bal-${Date.now()}-${deficit}`;
      const targetWall: WallId = deficit % 2 === 0 ? 'north' : 'east';
      const wallWidth = getSurfaceSize(targetWall, room).width;
      const xPos = Number(
        Math.min(
          wallWidth - 0.3,
          0.5 + ((deficit * 0.65) % (wallWidth - 0.8))
        ).toFixed(2)
      );

      updatedNodes.push({
        id: newSockId,
        surface: targetWall,
        category: isDouble ? 'socket_double' : 'socket_single',
        label: `${isDouble ? 'U2' : 'U1'}-Auto`,
        x: xPos,
        y: 0.3,
        circuitId: updatedCircuits[0].id,
      });
      deficit -= isDouble ? 2 : 1;
    }

    updatedCircuits = updatedCircuits.map((c) =>
      c.breakerAmps >= 16 && c.cableCrossSection < 2.5
        ? { ...c, cableCrossSection: 2.5 }
        : c
    );

    setCircuits(updatedCircuits);
    setNodes(updatedNodes);
    setAppliances(updatedAppliances);
  };

  const handleExportJson = () => {
    const payload = {
      project: 'ElektroPlan 3D/2D Blueprint',
      exportedAt: new Date().toISOString(),
      room,
      openings,
      circuits,
      nodes,
      appliances,
      bom,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elektroplan-${room.length}x${room.width}m.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overloadedCircuitsCount = circuitAnalyses.filter(
    (c) => c.status === 'overload'
  ).length;

  const toggleDrawer = (d: ActiveDrawer) => {
    setActiveDrawer((prev) => (prev === d ? 'none' : d));
  };

  return (
    <div className="h-screen flex flex-col bg-[#0D1117] text-slate-200 overflow-hidden">
      {/* 1. CLEAN 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3 bg-[#131922] border-b border-slate-800/80 shrink-0 no-print">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setViewportMode('2d_strip');
          }}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          ElektroPlan
        </a>

        {/* Zone 2: Step-Based Navigation (Progressive Disclosure) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <a
            href="#prostorija"
            onClick={(e) => {
              e.preventDefault();
              toggleDrawer('prostorija');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeDrawer === 'prostorija'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            1. Prostorija ({room.length}×{room.width}m)
          </a>
          <a
            href="#elementi"
            onClick={(e) => {
              e.preventDefault();
              toggleDrawer('elementi');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeDrawer === 'elementi'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            2. Elementi na zidu
          </a>
          <a
            href="#trosila"
            onClick={(e) => {
              e.preventDefault();
              toggleDrawer('trosila_krugovi');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeDrawer === 'trosila_krugovi'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            3. Trošila i Krugovi ({appliances.length}/
            {socketBalance.totalAvailableOutlets1P +
              socketBalance.totalAvailableOutlets3P}
            )
          </a>
          <a
            href="#shema"
            onClick={(e) => {
              e.preventDefault();
              setShowWiringModal(true);
            }}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Shema Spajanja
          </a>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowBomModal(true)}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Troškovnik i Ispis
          </button>
        </div>
      </header>

      {/* 2. MINIMAL STREAMLINED SUB-BAR (View Switcher + Quiet Summary) */}
      <div className="flex items-center justify-between gap-4 px-6 py-2 bg-[#0D1117] border-b border-slate-800/60 text-xs shrink-0 no-print">
        <div className="flex items-center gap-3">
          {/* View Mode Segmented Control */}
          <div className="flex items-center gap-1 p-0.5 bg-[#161B22] border border-slate-800 rounded-md">
            <button
              onClick={() => setViewportMode('2d_strip')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                viewportMode === '2d_strip'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              4 zida u nizu + Strop
            </button>
            <button
              onClick={() => setViewportMode('2d_single')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                viewportMode === '2d_single'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Samo aktivni zid
            </button>
            <button
              onClick={() => setViewportMode('3d_unfold')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                viewportMode === '3d_unfold'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              3D Prikaz
            </button>
          </div>

          {/* Contextual Wall Selector ONLY when in Single Wall mode */}
          {viewportMode === '2d_single' && (
            <div className="flex items-center gap-1">
              {(['north', 'east', 'south', 'west', 'ceiling'] as SurfaceId[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setActiveSurface(s)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      activeSurface === s
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s === 'ceiling' ? 'Strop' : WALL_META[s].short}
                  </button>
                )
              )}
            </div>
          )}

          {/* Contextual 3D Unfold Slider ONLY when in 3D mode */}
          {viewportMode === '3d_unfold' && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-[#161B22] border border-slate-800 rounded-md">
              <span className="text-[11px] text-slate-400">Otklopi:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={unfoldAmount}
                onChange={(e) => setUnfoldAmount(parseFloat(e.target.value))}
                className="w-20 accent-sky-500 cursor-pointer"
              />
              <span className="font-mono text-[11px] text-slate-300 w-8 text-right tabular-nums">
                {Math.round(unfoldAmount * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Right: Quiet Telemetry + View Options Popover Trigger */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
            <span
              className="cursor-pointer hover:text-slate-200 flex items-center gap-1"
              onClick={() => setActiveDrawer('trosila_krugovi')}
            >
              {socketBalance.isBalanced && overloadedCircuitsCount === 0 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>
                {appliances.length} trošila /{' '}
                {socketBalance.totalAvailableOutlets1P +
                  socketBalance.totalAvailableOutlets3P}{' '}
                utičnica
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Kabeli: {bom.totalEstimatedLengthMeters.toFixed(1)}m</span>
          </div>

          {/* Popover for secondary CAD display toggles */}
          <div className="relative">
            <button
              onClick={() => setShowViewOptionsPopover((v) => !v)}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                showViewOptionsPopover
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-[#161B22] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Opcije prikaza
            </button>

            {showViewOptionsPopover && (
              <div className="absolute right-0 mt-2 w-60 p-3 bg-[#161B22] border border-slate-700 rounded-lg shadow-xl z-40 space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-slate-800 pb-1.5">
                  <span>Slojevi nacrta</span>
                  <button
                    onClick={() => setShowViewOptionsPopover(false)}
                    className="text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-300">Sve žice (L, N, PE)</span>
                  <input
                    type="checkbox"
                    checked={showWireConductors}
                    onChange={(e) => setShowWireConductors(e.target.checked)}
                    className="accent-sky-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-300">Sve kote (Pod / Strop)</span>
                  <input
                    type="checkbox"
                    checked={showAllDimensions}
                    onChange={(e) => setShowAllDimensions(e.target.checked)}
                    className="accent-sky-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-300">Instalacijske zone (30cm)</span>
                  <input
                    type="checkbox"
                    checked={showInstallZones}
                    onChange={(e) => setShowInstallZones(e.target.checked)}
                    className="accent-sky-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-1">
                  <span className="text-slate-300">Magnetni snap na pravce</span>
                  <input
                    type="checkbox"
                    checked={enableSnap}
                    onChange={(e) => setEnableSnap(e.target.checked)}
                    className="accent-sky-500"
                  />
                </label>

                <div className="pt-1.5 border-t border-slate-800">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Filtriraj po strujnom krugu:
                  </label>
                  <select
                    value={activeCircuitFilter}
                    onChange={(e) => setActiveCircuitFilter(e.target.value)}
                    className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded text-xs text-slate-200"
                  >
                    <option value="all">Svi krugovi ({circuits.length})</option>
                    {circuits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. FULL-WIDTH UNOBSTRUCTED CANVAS + CONTEXTUAL FLOATING PANELS */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        {/* CONTEXTUAL LEFT DRAWER 1: PROSTORIJA I OTVORI (Only when activeDrawer === 'prostorija') */}
        {activeDrawer === 'prostorija' && (
          <aside className="w-72 bg-[#131922] border-r border-slate-800 p-4 overflow-y-auto z-20 space-y-5 shrink-0 no-print">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-sky-400" />
                Dimenzije i otvori prostorije
              </h2>
              <button
                onClick={() => setActiveDrawer('none')}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Dužina (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={room.length}
                  onChange={(e) =>
                    handleRoomChange('length', parseFloat(e.target.value))
                  }
                  className="w-full px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Širina (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={room.width}
                  onChange={(e) =>
                    handleRoomChange('width', parseFloat(e.target.value))
                  }
                  className="w-full px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Visina (m)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={room.height}
                  onChange={(e) =>
                    handleRoomChange('height', parseFloat(e.target.value))
                  }
                  className="w-full px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs font-mono text-white"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <div className="text-xs font-semibold text-slate-200">
                Dodaj vrata ili prozor
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <select
                  value={newOpWall}
                  onChange={(e) => setNewOpWall(e.target.value as WallId)}
                  className="px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs"
                >
                  <option value="north">Sjeverni zid</option>
                  <option value="east">Istočni zid</option>
                  <option value="south">Južni zid</option>
                  <option value="west">Zapadni zid</option>
                </select>
                <select
                  value={newOpType}
                  onChange={(e) => {
                    const t = e.target.value as OpeningType;
                    setNewOpType(t);
                    setNewOpSill(t === 'door' ? 0 : 0.9);
                    setNewOpHeight(t === 'door' ? 2.05 : 1.3);
                    setNewOpWidth(t === 'door' ? 0.9 : 1.4);
                  }}
                  className="px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs"
                >
                  <option value="window">Prozor</option>
                  <option value="door">Vrata</option>
                </select>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    Od kuta (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newOpOffset}
                    onChange={(e) => setNewOpOffset(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    Širina (m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newOpWidth}
                    onChange={(e) => setNewOpWidth(parseFloat(e.target.value) || 0.9)}
                    className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono"
                  />
                </div>
              </div>
              <button
                onClick={handleAddOpening}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded text-xs font-medium flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Dodaj na zid
              </button>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-1.5">
              <div className="text-[11px] text-slate-400">
                Aktivni otvori ({openings.length})
              </div>
              {openings.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between py-1.5 px-2 bg-[#0D1117] rounded text-xs"
                >
                  <span className="truncate">
                    {op.label} · {WALL_META[op.wall].short} ({op.width}m)
                  </span>
                  <button
                    onClick={() =>
                      setOpenings((prev) => prev.filter((o) => o.id !== op.id))
                    }
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* CONTEXTUAL LEFT DRAWER 2: COMPACT ELEMENT PALETTE (Only when activeDrawer === 'elementi') */}
        {activeDrawer === 'elementi' && (
          <aside className="w-60 bg-[#131922] border-r border-slate-800 p-3 overflow-y-auto z-20 space-y-2.5 shrink-0 no-print">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Dodaj element (povuci na zid)
              </span>
              <button
                onClick={() => setActiveDrawer('none')}
                className="text-slate-500 hover:text-white"
                title="Sakrij paletu"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {(Object.keys(ELEMENT_CATALOG) as ElementCategory[]).map((cat) => {
                const item = ELEMENT_CATALOG[cat];
                return (
                  <div
                    key={cat}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', cat);
                      setDraggingPaletteCategory(cat);
                    }}
                    onDragEnd={() => setDraggingPaletteCategory(null)}
                    onClick={() => handleAddNode(cat, activeSurface)}
                    className="px-2.5 py-2 bg-[#0D1117] hover:bg-slate-800/80 border border-slate-800/80 rounded-md cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded bg-slate-800 text-[10px] font-mono font-bold text-slate-200 flex items-center justify-center shrink-0">
                        {item.shortCode}
                      </span>
                      <span className="text-xs text-slate-200 truncate">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {item.defaultHeightMeters}m
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* CONTEXTUAL LEFT DRAWER 3: TROŠILA I STRUJNI KRUGOVI (Only when activeDrawer === 'trosila_krugovi') */}
        {activeDrawer === 'trosila_krugovi' && (
          <aside className="w-80 bg-[#131922] border-r border-slate-800 p-4 overflow-y-auto z-20 space-y-4 shrink-0 no-print">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-100">
                Trošila i opterećenje krugova
              </h2>
              <button
                onClick={() => setActiveDrawer('none')}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Balance Status & Auto-Adapt Button */}
            <div className="p-3 bg-[#0D1117] border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Utičnice vs. Trošila</span>
                <span className="font-mono font-semibold text-slate-100 tabular-nums">
                  {appliances.length} trošila /{' '}
                  {socketBalance.totalAvailableOutlets1P +
                    socketBalance.totalAvailableOutlets3P}{' '}
                  mjesta
                </span>
              </div>
              {(!socketBalance.isBalanced || overloadedCircuitsCount > 0) && (
                <p className="text-[11px] text-amber-300">
                  Nedostaje utičnica ili je krug preopterećen.
                </p>
              )}
              <button
                onClick={handleAutoAdaptNetwork}
                className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Automatski prilagodi mrežu
              </button>
            </div>

            {/* Quick Add Appliance Dropdown / Buttons */}
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                Dodaj uređaj iz kataloga:
              </div>
              <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-1">
                {APPLIANCE_CATALOG_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => handleAddApplianceFromCatalog(tpl)}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-[#0D1117] hover:bg-slate-800 rounded text-xs text-left transition-colors"
                  >
                    <span className="text-slate-200 truncate pr-2">
                      + {tpl.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0 tabular-nums">
                      {tpl.powerWatts}W
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Appliance */}
            <form
              onSubmit={handleAddCustomAppliance}
              className="flex items-center gap-1.5 pt-1"
            >
              <input
                type="text"
                placeholder="Vlastiti uređaj..."
                value={customAppName}
                onChange={(e) => setCustomAppName(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs"
              />
              <input
                type="number"
                step="50"
                value={customAppWatts}
                onChange={(e) => setCustomAppWatts(parseInt(e.target.value) || 0)}
                className="w-16 px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs font-mono"
              />
              <button
                type="submit"
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs font-medium shrink-0"
              >
                +
              </button>
            </form>

            {/* Added Appliances */}
            <div className="pt-3 border-t border-slate-800 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-400">
                Aktivna trošila ({appliances.length})
              </div>
              {appliances.map((app) => {
                const availableSockets = nodes.filter((n) =>
                  n.category.startsWith('socket_')
                );
                return (
                  <div
                    key={app.id}
                    className="p-2 bg-[#0D1117] border border-slate-800/80 rounded text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-200 font-medium truncate">
                        {app.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {app.powerWatts}W
                        </span>
                        <button
                          onClick={() =>
                            setAppliances((prev) =>
                              prev.filter((a) => a.id !== app.id)
                            )
                          }
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <select
                      value={app.assignedNodeId || ''}
                      onChange={(e) => {
                        const sockId = e.target.value || undefined;
                        const sockNode = nodes.find((n) => n.id === sockId);
                        setAppliances((prev) =>
                          prev.map((a) =>
                            a.id === app.id
                              ? {
                                  ...a,
                                  assignedNodeId: sockId,
                                  circuitId: sockNode
                                    ? sockNode.circuitId
                                    : a.circuitId,
                                }
                              : a
                          )
                        );
                      }}
                      className="w-full px-2 py-1 bg-[#131922] border border-slate-800 rounded text-[11px] text-slate-300"
                    >
                      <option value="">— Nije vezano uz utičnicu</option>
                      {availableSockets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} (
                          {s.surface === 'ceiling'
                            ? 'Strop'
                            : WALL_META[s.surface].short}
                          )
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Compact Circuit Load List */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-[11px] font-medium text-slate-400">
                Opterećenje po krugovima
              </div>
              {circuitAnalyses.map((ca) => (
                <div
                  key={ca.circuit.id}
                  className="p-2 bg-[#0D1117] border border-slate-800/80 rounded text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">
                      {ca.circuit.code} · {ca.circuit.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {ca.totalPowerWatts}W / {ca.circuit.breakerAmps}A
                    </span>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        ca.status === 'overload'
                          ? 'bg-rose-500'
                          : ca.status === 'warning'
                          ? 'bg-amber-500'
                          : 'bg-sky-500'
                      }`}
                      style={{
                        width: `${Math.min(100, ca.utilizationPercent)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* MAIN FULL-WIDTH VIEWPORT (2D Strip of 4 Walls + Ceiling OR 3D View) */}
        <main className="flex-1 relative flex flex-col min-w-0 min-h-0">
          {viewportMode === '3d_unfold' ? (
            <UnfoldedRoom3D
              room={room}
              openings={openings}
              nodes={nodes}
              circuits={circuits}
              segments={segments}
              unfoldTarget={unfoldAmount}
              showWireConductors={showWireConductors}
              showInstallZones={showInstallZones}
              selectedNodeId={selectedNodeId}
              activeCircuitFilter={activeCircuitFilter}
              onSelectNode={(id) => setSelectedNodeId(id)}
              onSelectSurface={(s) => setActiveSurface(s)}
            />
          ) : (
            <Blueprint2DCanvas
              room={room}
              openings={openings}
              nodes={nodes}
              circuits={circuits}
              segments={segments}
              appliances={appliances}
              activeSurface={activeSurface}
              layoutMode={
                viewportMode === '2d_single' ? 'single_surface' : 'strip_all'
              }
              showWireConductors={showWireConductors}
              showInstallZones={showInstallZones}
              showAllDimensions={showAllDimensions}
              enableSnap={enableSnap}
              selectedNodeId={selectedNodeId}
              activeCircuitFilter={activeCircuitFilter}
              draggingPaletteCategory={draggingPaletteCategory}
              onSelectSurface={(s) => setActiveSurface(s)}
              onSelectNode={(id) => setSelectedNodeId(id)}
              onUpdateNodePosition={handleUpdateNodePosition}
              onDropNewNode={(cat, surf, x, y) => handleAddNode(cat, surf, x, y)}
              onInspectWiring={(id) => {
                setSelectedNodeId(id);
                setShowWiringModal(true);
              }}
            />
          )}

          {/* CONTEXTUAL FLOATING ELEMENT INSPECTOR (Appears ONLY when a node is selected!) */}
          {selectedNode && (
            <div className="absolute top-4 right-4 z-30 w-72 bg-[#161B22]/95 border border-slate-700/90 rounded-xl shadow-2xl p-3.5 space-y-3 text-xs no-print">
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-sky-400">
                    {ELEMENT_CATALOG[selectedNode.category]?.name}
                  </div>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, label: e.target.value }
                            : n
                        )
                      )
                    }
                    className="mt-0.5 w-full bg-transparent font-semibold text-slate-100 focus:outline-none border-b border-transparent focus:border-sky-500"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded"
                    title="Obriši element"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSelectedNodeId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded"
                    title="Zatvori"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Exact Kote od Poda, Stropa i Lijevog Kuta */}
              {selectedNode.surface !== 'ceiling' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Od poda (m)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedNode.y}
                      onChange={(e) =>
                        handleUpdateNodePosition(
                          selectedNode.id,
                          selectedNode.surface,
                          selectedNode.x,
                          Math.max(
                            0.05,
                            Math.min(
                              room.height - 0.05,
                              parseFloat(e.target.value) || 0
                            )
                          )
                        )
                      }
                      className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Od stropa (m)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={Number((room.height - selectedNode.y).toFixed(2))}
                      onChange={(e) => {
                        const fromCeil = parseFloat(e.target.value) || 0;
                        handleUpdateNodePosition(
                          selectedNode.id,
                          selectedNode.surface,
                          selectedNode.x,
                          Math.max(
                            0.05,
                            Math.min(room.height - 0.05, room.height - fromCeil)
                          )
                        );
                      }}
                      className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Od kuta (m)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedNode.x}
                      onChange={(e) => {
                        const w = getSurfaceSize(selectedNode.surface, room).width;
                        handleUpdateNodePosition(
                          selectedNode.id,
                          selectedNode.surface,
                          Math.max(
                            0.05,
                            Math.min(w - 0.05, parseFloat(e.target.value) || 0)
                          ),
                          selectedNode.y
                        );
                      }}
                      className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono text-white"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      X (m)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedNode.x}
                      onChange={(e) =>
                        handleUpdateNodePosition(
                          selectedNode.id,
                          'ceiling',
                          parseFloat(e.target.value) || 0,
                          selectedNode.y
                        )
                      }
                      className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Y (m)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      value={selectedNode.y}
                      onChange={(e) =>
                        handleUpdateNodePosition(
                          selectedNode.id,
                          'ceiling',
                          selectedNode.x,
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1 bg-[#0D1117] border border-slate-700 rounded font-mono text-white"
                    />
                  </div>
                </div>
              )}

              {/* Circuit Selector (for non-RO elements) */}
              {selectedNode.category !== 'distribution_board' && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    Strujni krug (Osigurač u RO)
                  </label>
                  <select
                    value={selectedNode.circuitId}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, circuitId: e.target.value }
                            : n
                        )
                      )
                    }
                    className="w-full px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs text-slate-200"
                  >
                    {circuits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name} ({c.breakerCurve}
                        {c.breakerAmps}A)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 1. If Selected Node is Razvodni ormar s osiguračima (RO): Show Circuit Breakers & Main Feeders */}
              {selectedNode.category === 'distribution_board' && (
                <div className="p-2.5 bg-[#0D1117] border border-amber-500/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-amber-300">
                      Osigurači u ormaru ({circuits.length})
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      FID 40A/30mA
                    </span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {circuitAnalyses.map((ca) => {
                      const rkCount = nodes.filter(
                        (n) =>
                          n.category === 'junction_box' &&
                          n.circuitId === ca.circuit.id
                      ).length;
                      return (
                        <div
                          key={ca.circuit.id}
                          className="flex items-center justify-between text-[11px] py-1 px-1.5 bg-[#131922] rounded"
                        >
                          <span className="text-slate-200 truncate">
                            <span
                              className="inline-block w-2 h-2 rounded-full mr-1.5"
                              style={{ backgroundColor: ca.circuit.color }}
                            />
                            {ca.circuit.code} ({ca.circuit.breakerCurve}
                            {ca.circuit.breakerAmps}A)
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">
                            {rkCount > 0 ? `${rkCount}× RK` : 'Direktni vod'} ·{' '}
                            {ca.totalPowerWatts}W
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. If Selected Node is Razvodna kutija (RK): Show 1 Main Feeder from RO + Checkboxes for Connected Devices */}
              {selectedNode.category === 'junction_box' && (
                <div className="p-2.5 bg-[#0D1117] border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-sky-300">
                      1 glavni vod iz RO → više uređaja
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Odaberite uređaje koji se granaju iz ove razvodne kutije:
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {nodes
                      .filter(
                        (n) =>
                          n.category !== 'distribution_board' &&
                          n.category !== 'junction_box' &&
                          n.circuitId === selectedNode.circuitId
                      )
                      .map((dev) => {
                        const resolvedParent = resolveNodeParentBox(
                          dev,
                          nodes,
                          circuits
                        );
                        const isAttached =
                          resolvedParent?.id === selectedNode.id;
                        const mainRo = nodes.find(
                          (n) => n.category === 'distribution_board'
                        );
                        return (
                          <label
                            key={dev.id}
                            className="flex items-center justify-between gap-2 py-1 px-1.5 bg-[#131922] hover:bg-slate-800/70 rounded cursor-pointer text-[11px]"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isAttached}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setNodes((prev) =>
                                    prev.map((item) =>
                                      item.id === dev.id
                                        ? {
                                            ...item,
                                            parentBoxId: checked
                                              ? selectedNode.id
                                              : mainRo?.id,
                                          }
                                        : item
                                    )
                                  );
                                }}
                                className="rounded border-slate-600 text-sky-500 focus:ring-0"
                              />
                              <span className="text-slate-200 truncate">
                                {dev.label}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {dev.surface === 'ceiling'
                                ? 'Strop'
                                : WALL_META[dev.surface].short}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* 3. If Selected Node is a Device (Socket, Switch, Light): Choose Feeder Source (RK or Direct RO) + Quick Add RK */}
              {selectedNode.category !== 'distribution_board' &&
                selectedNode.category !== 'junction_box' && (
                  <div className="space-y-2 pt-1 border-t border-slate-800">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">
                        Napajanje vodiča (Izvor voda)
                      </label>
                      <select
                        value={
                          resolveNodeParentBox(selectedNode, nodes, circuits)
                            ?.id || ''
                        }
                        onChange={(e) => {
                          const newParentId = e.target.value || undefined;
                          const boxNode = nodes.find(
                            (n) => n.id === newParentId
                          );
                          setNodes((prev) =>
                            prev.map((n) =>
                              n.id === selectedNode.id
                                ? {
                                    ...n,
                                    parentBoxId: newParentId,
                                    circuitId:
                                      boxNode &&
                                      boxNode.category === 'junction_box'
                                        ? boxNode.circuitId
                                        : n.circuitId,
                                  }
                                : n
                            )
                          );
                        }}
                        className="w-full px-2 py-1.5 bg-[#0D1117] border border-slate-700 rounded text-xs text-slate-200"
                      >
                        {nodes
                          .filter((n) => n.category === 'distribution_board')
                          .map((ro) => (
                            <option key={ro.id} value={ro.id}>
                              ⚡ Direktno iz: {ro.label.split(' (')[0]} (Razvodni ormar)
                            </option>
                          ))}
                        {nodes
                          .filter((n) => n.category === 'junction_box')
                          .map((rk) => (
                            <option key={rk.id} value={rk.id}>
                              📦 Preko kutije: {rk.label} (1 vod za više uređaja)
                            </option>
                          ))}
                      </select>
                    </div>

                    <button
                      onClick={() =>
                        handleGroupCircuitDevicesWithNewRk(
                          selectedNode.circuitId,
                          selectedNode.surface
                        )
                      }
                      className="w-full py-1.5 px-2.5 bg-sky-950/60 hover:bg-sky-900/70 border border-sky-700/50 text-sky-200 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-sky-400" />
                      Dodaj razvodnu kutiju (1 vod za više uređaja)
                    </button>
                  </div>
                )}

              {/* Wiring Schematic Trigger */}
              <button
                onClick={() => setShowWiringModal(true)}
                className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Prikaži spajanje vodiča (L, N, PE)
              </button>
            </div>
          )}
        </main>
      </div>

      {/* WIRING SCHEMATIC MODAL */}
      {showWiringModal && (
        <WiringSchematicModal
          node={selectedNode}
          circuit={selectedNodeCircuit}
          segments={segments}
          onClose={() => setShowWiringModal(false)}
        />
      )}

      {/* BOM & PRINTABLE REPORT MODAL */}
      {showBomModal && (
        <BomAndPrintModal
          room={room}
          nodes={nodes}
          appliances={appliances}
          circuitAnalyses={circuitAnalyses}
          socketBalance={socketBalance}
          bom={bom}
          onClose={() => setShowBomModal(false)}
          onExportJson={handleExportJson}
        />
      )}
    </div>
  );
}
