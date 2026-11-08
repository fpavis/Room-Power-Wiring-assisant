import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Layers,
  Pencil,
  Printer,
  Redo2,
  Undo2,
  Wand2,
  Zap,
} from 'lucide-react';
import { ELEMENT_CATALOG, WALL_META } from '../data/presets';
import { analyzeProject, getPrimaryJunctionBoxWall } from '../engine/electricalEngine';
import { formatNumber } from '../engine/geometry';
import {
  addNode,
  autoAdaptNetwork,
  canPlaceOn,
  getOutsideNodes,
  moveNode,
  moveNodeInside,
  NetworkAdaptation,
  updateOpening,
} from '../engine/projectOps';
import { updateFurniture } from '../engine/furniture';
import { assignAppliance } from '../engine/projectOps';
import { checkInstallationRules } from '../engine/rules';
import { computeRoutedSegments } from '../engine/routing';
import {
  renameProject,
  saveProjectData,
  StoragePersistence,
  StoredProject,
  writePendingProject,
} from '../persistence/db';
import { FILE_EXTENSION, serializeProject } from '../persistence/projectFile';
import { commit, createHistory, History, redo, undo } from '../state/history';
import { ApplianceItem, ElementCategory, ProjectData, SurfaceId, WallId } from '../types/electrical';
import { BomContent } from './BomAndPrintModal';
import { Blueprint2DCanvas, CanvasHandle, CanvasLayers } from './Blueprint2DCanvas';
import { Inspector } from './Inspector';
import { LoadsPanel, socketSlots } from './LoadsPanel';
import { PrintSheets } from './PrintSheets';
import { RoomPanel } from './RoomPanel';
import { CollapsibleSection, Dialog, PanelHeader, useIsCompact } from './ui';
import { UnfoldedRoom3D } from './UnfoldedRoom3D';
import { WiringSchematicModal } from './WiringSchematicModal';

type Step = 'prostorija' | 'elementi' | 'trosila' | 'provjera';
type ViewMode = '2d_strip' | '2d_single' | '3d';
type SaveStatus = 'saved' | 'saving' | 'error';

const STEPS: { id: Step; label: string }[] = [
  { id: 'prostorija', label: 'Prostorija' },
  { id: 'elementi', label: 'Elementi' },
  { id: 'trosila', label: 'Trošila i krugovi' },
  { id: 'provjera', label: 'Provjera i ispis' },
];

const STORAGE_NOTICE_KEY = 'elektroplan:storage-notice-hidden';

const PALETTE_GROUPS: { id: string; title: string; categories: ElementCategory[] }[] = [
  { id: 'napajanje', title: 'Ormari i kutije', categories: ['distribution_board', 'junction_box'] },
  { id: 'uticnice', title: 'Utičnice', categories: ['socket_single', 'socket_double', 'socket_shuko_3p', 'socket_fixed_1p'] },
  { id: 'prekidaci', title: 'Prekidači', categories: ['switch_single', 'switch_double', 'switch_two_way', 'switch_cross'] },
  { id: 'rasvjeta', title: 'Rasvjeta', categories: ['light_ceiling', 'light_wall'] },
];

type HistoryAction =
  | { type: 'commit'; update: (d: ProjectData) => ProjectData; key: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

function historyReducer(state: History<ProjectData>, action: HistoryAction): History<ProjectData> {
  switch (action.type) {
    case 'commit':
      return commit(state, action.update(state.present), action.key);
    case 'undo':
      return undo(state);
    case 'redo':
      return redo(state);
  }
}

function downloadProject(name: string, data: ProjectData) {
  const blob = new Blob([serializeProject(name, data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replace(/[\\/:*?"<>|]/g, '-')}${FILE_EXTENSION}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Editor({
  project,
  storage,
  onExit,
}: {
  project: StoredProject;
  storage: StoragePersistence;
  onExit: () => void;
}) {
  const compact = useIsCompact();
  const [history, dispatch] = useReducer(historyReducer, project.data, createHistory);
  const data = history.present;
  const { room, openings, nodes, circuits, appliances } = data;

  const [name, setName] = useState(project.name);
  const [step, setStep] = useState<Step>('elementi');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(compact ? '2d_single' : '2d_strip');
  const [unfold, setUnfold] = useState(0.5);
  const [activeSurface, setActiveSurface] = useState<SurfaceId>(() =>
    getPrimaryJunctionBoxWall(project.data.nodes)
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [circuitFilter, setCircuitFilter] = useState('all');
  const [layers, setLayers] = useState<CanvasLayers>({
    wires: false,
    zones: false,
    dimensions: false,
    snap: true,
    appliances: true,
    furniture: true,
  });
  const [applianceGhost, setApplianceGhost] = useState<{ name: string; x: number; y: number } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showWiring, setShowWiring] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [printHint, setPrintHint] = useState(false);
  const [printMounted, setPrintMounted] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [adaptation, setAdaptation] = useState<NetworkAdaptation | null>(null);
  const [storageNoticeHidden, setStorageNoticeHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_NOTICE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const apply = useCallback(
    (update: (d: ProjectData) => ProjectData, key: string | null = null) =>
      dispatch({ type: 'commit', update, key }),
    []
  );

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Autosave
  const latest = useRef(data);
  latest.current = data;
  const nameRef = useRef(name);
  nameRef.current = name;
  const lastSaved = useRef(project.data);
  useEffect(() => {
    if (data === lastSaved.current) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(async () => {
      const snapshot = latest.current;
      try {
        await saveProjectData(project.id, snapshot);
        lastSaved.current = snapshot;
        if (snapshot === latest.current) setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [data, project.id]);

  useEffect(() => {
    const flush = () => {
      if (latest.current === lastSaved.current) return;
      const snapshot = latest.current;
      try {
        writePendingProject({
          ...project,
          name: nameRef.current,
          data: snapshot,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        setSaveStatus('error');
      }
      void saveProjectData(project.id, snapshot)
        .then(() => {
          lastSaved.current = snapshot;
        })
        .catch(() => setSaveStatus('error'));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [project]);

  const segments = useMemo(
    () => computeRoutedSegments(room, nodes, circuits, openings),
    [room, nodes, circuits, openings]
  );
  const { socketBalance, circuitAnalyses, bom } = useMemo(
    () => analyzeProject(nodes, appliances, circuits, segments),
    [nodes, appliances, circuits, segments]
  );
  const outsideNodes = useMemo(() => getOutsideNodes(data), [data]);
  const ruleHints = useMemo(
    () =>
      checkInstallationRules(
        data,
        segments,
        new Map(circuitAnalyses.map((c) => [c.circuit.id, c.totalPowerWatts]))
      ),
    [data, segments, circuitAnalyses]
  );

  const openAdaptation = () => setAdaptation(autoAdaptNetwork(data));
  const canAdapt = useMemo(() => autoAdaptNetwork(data).changes.length > 0, [data]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedCircuit = circuits.find((c) => c.id === selectedNode?.circuitId) ?? null;

  const outlets = socketBalance.totalAvailableOutlets1P + socketBalance.totalAvailableOutlets3P;
  const warnedCircuits = circuitAnalyses.filter((c) => c.status !== 'nominal');
  const networkOk = socketBalance.isBalanced && !circuitAnalyses.some((c) => c.status === 'overload');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if ((e.ctrlKey || e.metaKey) && !typing) {
        const key = e.key.toLowerCase();
        if (key === 'z' || key === 'y') {
          e.preventDefault();
          dispatch({ type: key === 'y' || e.shiftKey ? 'redo' : 'undo' });
        }
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') setSelectedNodeId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sheets also mount for the browser's own Ctrl+P, which fires beforeprint.
  useEffect(() => {
    const before = () => flushSync(() => setPrintMounted(true));
    const after = () => setPrintMounted(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  useEffect(() => {
    if (!printRequested) return;
    const frame = window.requestAnimationFrame(() => {
      setPrintRequested(false);
      window.print();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printRequested]);

  const canvasRef = useRef<CanvasHandle | null>(null);

  const placeNode = useCallback(
    (category: ElementCategory, surface: SurfaceId, position?: { x: number; y: number }) => {
      if (!canPlaceOn(category, surface)) {
        notify(
          category === 'light_ceiling'
            ? 'Stropno svjetlo ide samo na strop.'
            : 'Ovaj element ide na zid. Odaberi zid pa pokušaj ponovno.'
        );
        return;
      }
      let createdId: string | null = null;
      apply((d) => {
        const result = addNode(d, category, surface, position, circuitFilter === 'all' ? undefined : circuitFilter);
        createdId = result?.nodeId ?? null;
        return result?.data ?? d;
      });
      window.setTimeout(() => {
        if (createdId) setSelectedNodeId(createdId);
      });
      setActiveSurface(surface);
    },
    [apply, circuitFilter, notify]
  );

  const addByTap = (category: ElementCategory) => {
    placeNode(category, category === 'light_ceiling' ? 'ceiling' : activeSurface);
    if (compact) setSheetOpen(false);
  };

  const startPaletteDrag = (category: ElementCategory) => (e: React.PointerEvent) => {
    if (compact || e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      dragging = true;
      canvasRef.current?.previewPaletteDrop(ev.clientX, ev.clientY);
    };
    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      if (dragging) {
        suppressClick.current = true;
        canvasRef.current?.commitPaletteDrop(category, ev.clientX, ev.clientY);
      }
    };
    const cancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      canvasRef.current?.clearPreview();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  };
  const suppressClick = useRef(false);

  const startApplianceDrag = (app: ApplianceItem, e: React.PointerEvent) => {
    if (compact || e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      dragging = true;
      setApplianceGhost({ name: app.name, x: ev.clientX, y: ev.clientY });
      canvasRef.current?.highlightSocketAt(ev.clientX, ev.clientY);
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', stop);
      setApplianceGhost(null);
      canvasRef.current?.clearSocketHighlight();
    };
    const finish = (ev: PointerEvent) => {
      const socketId = dragging ? canvasRef.current?.highlightSocketAt(ev.clientX, ev.clientY) : null;
      stop();
      if (!socketId) return;
      const socket = nodes.find((n) => n.id === socketId)!;
      if (socketSlots(socket, appliances).free <= 0) {
        notify(`Utičnica ${socket.label.split(' ')[0]} je popunjena.`);
        return;
      }
      apply((d) => assignAppliance(d, app.id, socketId));
      setSelectedNodeId(socketId);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', stop);
  };

  const surfaceName =
    activeSurface === 'ceiling' ? 'Strop' : WALL_META[activeSurface].name;

  const paletteContent = (
    <div className="space-y-2">
      <p className="text-[12px] text-muted">
        {compact ? 'Dodirni za dodavanje na plohu: ' : 'Povuci na plohu ili klikni za dodavanje na: '}
        <b className="text-ink">{surfaceName}</b>
      </p>
      {PALETTE_GROUPS.map((group) => (
        <CollapsibleSection
          key={group.id}
          id={`elementi-${group.id}`}
          title={group.title}
          summary={String(group.categories.length)}
        >
          <div className="space-y-1">
            {group.categories.map((category) => {
              const item = ELEMENT_CATALOG[category];
              return (
                <button
                  key={category}
                  className="w-full flex items-center gap-2 px-2 py-1.5 bg-paper border border-line rounded text-left hover:border-ink cursor-grab"
                  style={{ touchAction: 'pan-y' }}
                  onPointerDown={startPaletteDrag(category)}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    addByTap(category);
                  }}
                >
                  <b className="w-8 text-[12px] shrink-0">{item.shortCode}</b>
                  <span className="truncate">{item.name}</span>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );

  const reviewContent = (
    <div className="space-y-2">
      <CollapsibleSection
        id="provjera-nalazi"
        title="Provjera"
        summary={String(
          outsideNodes.length +
            ruleHints.length +
            circuitAnalyses.reduce((sum, ca) => sum + ca.warnings.length, 0) +
            (socketBalance.isBalanced ? 0 : 1)
        )}
      >
        {outsideNodes.length === 0 &&
          socketBalance.isBalanced &&
          warnedCircuits.length === 0 &&
          ruleHints.length === 0 && (
          <p className="flex items-center gap-1.5 font-semibold text-ok">
            <CheckCircle2 className="w-4 h-4" /> Sve je u redu.
          </p>
        )}
        {outsideNodes.map((n) => (
          <div key={n.id} className="p-2 border border-err rounded space-y-1.5">
            <p className="font-semibold text-err">{n.label.split(' ')[0]} je izvan plohe.</p>
            <button className="btn w-full" onClick={() => apply((d) => moveNodeInside(d, n.id))}>
              Premjesti unutar zida
            </button>
          </div>
        ))}
        {!socketBalance.isBalanced && (
          <p className="p-2 border border-err rounded font-semibold text-err">
            Nedostaje utičnica: {socketBalance.missingOutlets1P + socketBalance.missingOutlets3P}
          </p>
        )}
        {ruleHints.map((hint) => (
          <p
            key={hint.id}
            className={`p-2 rounded text-[12.5px] ${
              hint.level === 'warning' ? 'bg-warn' : 'bg-paper border border-line'
            }`}
          >
            {hint.text}
          </p>
        ))}
        {circuitAnalyses.flatMap((ca) =>
          ca.warnings.map((warning) => (
            <p
              key={`${ca.circuit.id}-${warning}`}
              className={`p-2 rounded text-[12.5px] ${
                ca.status === 'overload' ? 'border border-err text-err font-semibold' : 'bg-warn'
              }`}
            >
              <b>{ca.circuit.code}:</b> {warning}
            </p>
          ))
        )}
      </CollapsibleSection>
      {canAdapt && (
        <button className="btn btn-primary w-full" onClick={openAdaptation}>
          <Wand2 className="w-4 h-4" /> Prikaži rješenja
        </button>
      )}
      <CollapsibleSection
        id="provjera-kabeli"
        title="Kabeli"
        summary={`${bom.totalPurchaseCableMeters} m`}
      >
        <div className="flex justify-between tabular-nums">
          <span>Stvarna trasa</span>
          <b>{formatNumber(bom.totalRouteLengthMeters, 1)} m</b>
        </div>
        <div className="flex justify-between tabular-nums">
          <span>Za nabavu s rezervom</span>
          <b>{bom.totalPurchaseCableMeters} m</b>
        </div>
      </CollapsibleSection>
      <CollapsibleSection id="provjera-dokumenti" title="Sheme i ispis">
        <button className="btn w-full" onClick={() => setShowWiring(true)}>
          <Zap className="w-4 h-4" /> Sheme spajanja
        </button>
        <button className="btn w-full" onClick={() => setShowBom(true)}>
          <FileSpreadsheet className="w-4 h-4" /> Troškovnik
        </button>
        <button className="btn btn-primary w-full" onClick={() => setPrintHint(true)}>
          <Printer className="w-4 h-4" /> Ispis na A4
        </button>
        <button className="btn w-full" onClick={() => downloadProject(name, data)}>
          <Download className="w-4 h-4" /> Izvezi datoteku projekta
        </button>
      </CollapsibleSection>
    </div>
  );

  const stepContent = {
    prostorija: <RoomPanel data={data} apply={apply} activeSurface={activeSurface} />,
    elementi: paletteContent,
    trosila: (
      <LoadsPanel
        data={data}
        apply={apply}
        circuitAnalyses={circuitAnalyses}
        socketBalance={socketBalance}
        onStartApplianceDrag={startApplianceDrag}
        onAutoAdapt={openAdaptation}
      />
    ),
    provjera: reviewContent,
  }[step];

  const stepTitle = STEPS.find((s) => s.id === step)!.label;
  const inspector = selectedNode && (
    <Inspector
      node={selectedNode}
      data={data}
      apply={apply}
      circuitAnalyses={circuitAnalyses}
      onClose={() => setSelectedNodeId(null)}
      onSelect={setSelectedNodeId}
      onShowWiring={() => setShowWiring(true)}
    />
  );

  const saveLabel = (
    <span
      role="status"
      data-testid="spremanje"
      className={`shrink-0 font-bold whitespace-nowrap ${
        saveStatus === 'error' ? 'text-err' : saveStatus === 'saved' ? 'text-ok' : 'text-muted'
      }`}
    >
      {saveStatus === 'saved' && '✓ Spremljeno'}
      {saveStatus === 'saving' && 'Spremanje…'}
      {saveStatus === 'error' && '⚠ Nije spremljeno'}
    </span>
  );

  const viewButton = (mode: ViewMode, label: string) => (
    <button
      aria-pressed={viewMode === mode}
      className={`px-2.5 py-1 rounded-sm text-[12px] font-semibold whitespace-nowrap ${
        viewMode === mode ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
      }`}
      onClick={() => setViewMode(mode)}
    >
      {label}
    </button>
  );

  const toggle = (key: keyof CanvasLayers, label: string) => (
    <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={layers[key]}
        onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
      />
    </label>
  );

  return (
    <div className="h-full flex flex-col bg-paper">
      <div className="no-print flex-1 min-h-0 flex flex-col">
        <header className="flex items-center gap-2 md:gap-4 px-3 py-1.5 border-b border-line shrink-0">
          <b className="text-[15px] hidden lg:block">ElektroPlan</b>
          <div className="relative min-w-0">
            {renaming ? (
              <input
                autoFocus
                className="field"
                aria-label="Naziv projekta"
                defaultValue={name}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  setRenaming(false);
                  if (value && value !== name) {
                    setName(value);
                    void renameProject(project.id, value).catch(() => setSaveStatus('error'));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setRenaming(false);
                }}
              />
            ) : (
              <button
                className="btn max-w-[46vw] md:max-w-64"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="truncate">{name}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 mt-1 z-40 w-56 bg-paper border border-line rounded shadow-lg p-1">
                  <button className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-desk text-left" onClick={onExit}>
                    <FolderOpen className="w-4 h-4" /> Moji projekti
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-desk text-left"
                    onClick={() => {
                      setMenuOpen(false);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" /> Preimenuj
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-desk text-left"
                    onClick={() => {
                      setMenuOpen(false);
                      downloadProject(name, data);
                    }}
                  >
                    <Download className="w-4 h-4" /> Izvezi datoteku
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center">
            <button className="icon-btn" aria-label="Poništi" disabled={history.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>
              <Undo2 className="w-4 h-4" />
            </button>
            <button className="icon-btn" aria-label="Ponovi" disabled={history.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {!compact && (
            <nav className="flex-1 flex items-center justify-center gap-3 lg:gap-6 min-w-0" aria-label="Koraci">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  aria-current={step === s.id ? 'step' : undefined}
                  className={`py-1 border-b-[3px] whitespace-nowrap ${
                    step === s.id ? 'font-bold border-ink' : 'font-medium text-muted border-transparent hover:text-ink'
                  }`}
                  onClick={() => setStep(s.id)}
                >
                  {i + 1} {s.label}
                </button>
              ))}
            </nav>
          )}
          {compact && <div className="flex-1" />}
          {saveLabel}
          {saveStatus === 'error' && (
            <button className="btn" onClick={() => downloadProject(name, data)}>
              Izvezi
            </button>
          )}
        </header>

        {storage === 'best-effort' && !storageNoticeHidden && (
          <div className="flex items-center gap-3 px-3 py-1 bg-warn text-[12.5px] shrink-0">
            <span className="flex-1">
              Preglednik nije odobrio trajnu pohranu. Povremeno izvezi datoteku projekta.
            </span>
            <button
              className="font-bold underline"
              onClick={() => {
                setStorageNoticeHidden(true);
                try {
                  localStorage.setItem(STORAGE_NOTICE_KEY, '1');
                } catch {
                  // The notice simply returns next time.
                }
              }}
            >
              U redu
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 flex relative">
          {!compact && (
            <aside className="w-[270px] shrink-0 bg-panel border-r border-line p-3 overflow-y-auto">
              <div className="mb-2">
                <PanelHeader title={stepTitle} />
              </div>
              {stepContent}
            </aside>
          )}

          <main className="flex-1 min-w-0 flex flex-col bg-desk">
            <div className="flex items-center gap-2 px-2 py-1.5 shrink-0 flex-wrap">
              <div className="flex gap-0.5 p-0.5 bg-panel border border-line rounded">
                {viewButton('2d_strip', 'Svi zidovi')}
                {viewButton('2d_single', 'Jedan zid')}
                {viewButton('3d', '3D')}
              </div>
              {viewMode === '2d_single' && (
                <div className="flex gap-0.5">
                  {(['north', 'east', 'south', 'west', 'ceiling'] as SurfaceId[]).map((s) => (
                    <button
                      key={s}
                      aria-pressed={activeSurface === s}
                      className={`px-2 py-1 rounded-sm text-[12px] font-semibold ${
                        activeSurface === s ? 'bg-ink text-paper' : 'bg-panel text-ink border border-line'
                      }`}
                      onClick={() => setActiveSurface(s)}
                    >
                      {s === 'ceiling' ? 'Strop' : WALL_META[s as WallId].short.replace('Zid ', '')}
                    </button>
                  ))}
                </div>
              )}
              {viewMode === '3d' && (
                <label className="flex items-center gap-2 text-[12px]">
                  Otvaranje
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={unfold}
                    className="w-24 accent-ink"
                    onChange={(e) => setUnfold(parseFloat(e.target.value))}
                  />
                </label>
              )}
              <div className="relative">
                <button className="btn" style={{ minHeight: 30, padding: '3px 9px' }} aria-expanded={layersOpen} onClick={() => setLayersOpen((v) => !v)}>
                  <Layers className="w-3.5 h-3.5" /> Slojevi
                </button>
                {layersOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setLayersOpen(false)} />
                    <div className="absolute left-0 mt-1 z-40 w-64 bg-paper border border-line rounded shadow-lg p-3 space-y-1">
                      {toggle('wires', 'Svi vodiči (L, N, PE)')}
                      {toggle('dimensions', 'Sve kote od poda')}
                      {toggle('zones', 'Instalacijske zone (30 cm)')}
                      {toggle('appliances', 'Trošila na nacrtu')}
                      {toggle('furniture', 'Namještaj')}
                      {toggle('snap', 'Magnetsko poravnanje')}
                      <label className="label pt-1" htmlFor="filter-kruga">Prikaži strujni krug</label>
                      <select id="filter-kruga" className="field" value={circuitFilter} onChange={(e) => setCircuitFilter(e.target.value)}>
                        <option value="all">Svi krugovi ({circuits.length})</option>
                        {circuits.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} · {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 relative">
              {viewMode === '3d' ? (
                <UnfoldedRoom3D
                  room={room}
                  openings={openings}
                  nodes={nodes}
                  circuits={circuits}
                  segments={segments}
                  furniture={data.furniture}
                  showFurniture={layers.furniture}
                  unfoldTarget={unfold}
                  showWireConductors={layers.wires}
                  showInstallZones={layers.zones}
                  selectedNodeId={selectedNodeId}
                  activeCircuitFilter={circuitFilter}
                  onSelectNode={setSelectedNodeId}
                  onSelectSurface={setActiveSurface}
                />
              ) : (
                <Blueprint2DCanvas
                  ref={canvasRef}
                  room={room}
                  openings={openings}
                  nodes={nodes}
                  circuits={circuits}
                  segments={segments}
                  appliances={appliances}
                  furniture={data.furniture}
                  onMoveFurniture={(id, wall, offsetFromLeft, bottom, key) =>
                    apply((d) => updateFurniture(d, id, { wall, offsetFromLeft, bottom }), key)
                  }
                  openingsEditable={step === 'prostorija'}
                  onMoveOpening={(id, wall, offsetFromLeft, sillHeight, key) =>
                    apply((d) => updateOpening(d, id, { wall, offsetFromLeft, sillHeight }), key)
                  }
                  activeSurface={activeSurface}
                  layoutMode={viewMode === '2d_single' ? 'single_surface' : 'strip_all'}
                  layers={layers}
                  selectedNodeId={selectedNodeId}
                  circuitFilter={circuitFilter}
                  canDrag={!compact}
                  onSelectSurface={setActiveSurface}
                  onSelectNode={setSelectedNodeId}
                  onMoveNode={(id, surface, x, y, key) => apply((d) => moveNode(d, id, surface, x, y), key)}
                  onDropNewNode={(category, surface, x, y) => placeNode(category, surface, { x, y })}
                  onBlockedDrop={notify}
                />
              )}
            </div>
          </main>

          {!compact && selectedNode && (
            <aside className="w-[250px] shrink-0 bg-panel border-l border-line p-3 overflow-y-auto">
              {inspector}
            </aside>
          )}

          {compact && (sheetOpen || selectedNode) && (
            <div className="absolute inset-x-0 bottom-0 max-h-[62%] bg-panel border-t-2 border-ink p-3 overflow-y-auto z-20">
              {selectedNode ? (
                inspector
              ) : (
                <div className="space-y-2">
                  <PanelHeader title={stepTitle} onClose={() => setSheetOpen(false)} />
                  {stepContent}
                </div>
              )}
            </div>
          )}

          {applianceGhost && (
            <div
              className="fixed z-50 px-2 py-1 bg-ink text-paper rounded font-semibold pointer-events-none"
              style={{ left: applianceGhost.x + 12, top: applianceGhost.y + 12 }}
            >
              {applianceGhost.name}
            </div>
          )}

          {toast && (
            <div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-2 bg-ink text-paper rounded font-semibold max-w-[90%]">
              {toast}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-3 md:gap-5 px-3 py-1.5 bg-panel border-t border-line shrink-0 overflow-x-auto whitespace-nowrap">
          <button className={`flex items-center gap-1 font-bold ${networkOk ? 'text-ok' : 'text-err'}`} onClick={() => setStep('provjera')}>
            {networkOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {appliances.length} trošila / {outlets} utičnica
          </button>
          {outsideNodes.length > 0 && (
            <button className="font-bold text-err" onClick={() => setStep('provjera')}>
              Izvan zida: {outsideNodes.length}
            </button>
          )}
          {warnedCircuits.slice(0, compact ? 1 : 3).map((c) => (
            <button
              key={c.circuit.id}
              className={`px-2 py-0.5 rounded-sm font-bold ${
                c.status === 'overload' ? 'bg-err text-paper' : 'bg-warn text-ink'
              }`}
              onClick={() => setStep('provjera')}
            >
              ⚠ {c.circuit.code} {formatNumber(c.utilizationPercent, 0)} %
            </button>
          ))}
          <span className="tabular-nums">
            Kabeli: trasa {formatNumber(bom.totalRouteLengthMeters, 1)} m · nabava {bom.totalPurchaseCableMeters} m
          </span>
        </footer>

        {compact && (
          <nav className="grid grid-cols-4 bg-paper border-t border-line shrink-0" aria-label="Koraci">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                aria-current={step === s.id ? 'step' : undefined}
                className={`py-2 px-1 text-[12px] leading-tight border-t-[3px] ${
                  step === s.id ? 'font-bold border-ink' : 'font-medium text-muted border-transparent'
                }`}
                onClick={() => {
                  setSelectedNodeId(null);
                  setSheetOpen(step === s.id ? !sheetOpen : true);
                  setStep(s.id);
                }}
              >
                {i + 1} {s.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {showWiring && (
        <WiringSchematicModal
          node={selectedNode}
          circuit={selectedCircuit}
          segments={segments}
          onClose={() => setShowWiring(false)}
        />
      )}

      {showBom && (
        <Dialog title="Troškovnik" wide onClose={() => setShowBom(false)}>
          <BomContent room={room} nodes={nodes} appliances={appliances} circuitAnalyses={circuitAnalyses} bom={bom} />
        </Dialog>
      )}

      {adaptation && (
        <Dialog title="Automatski prilagoditi mrežu?" onClose={() => setAdaptation(null)}>
          <div className="space-y-3">
            {adaptation.changes.length === 0 ? (
              <p className="font-semibold">Nema promjena koje se mogu napraviti automatski.</p>
            ) : (
              <div>
                <p className="font-semibold mb-1">Promijenit će se:</p>
                <ul className="list-disc pl-5 space-y-1" data-testid="promjene-mreze">
                  {adaptation.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </div>
            )}
            {adaptation.unresolved.length > 0 && (
              <div>
                <p className="font-semibold mb-1 text-err">Ne može se riješiti automatski:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {adaptation.unresolved.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setAdaptation(null)}>
                {adaptation.changes.length === 0 ? 'Zatvori' : 'Odustani'}
              </button>
              {adaptation.changes.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const next = adaptation.data;
                    apply(() => next);
                    setAdaptation(null);
                  }}
                >
                  Primijeni
                </button>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {printHint && (
        <Dialog title="Ispis na A4" onClose={() => setPrintHint(false)}>
          <div className="space-y-3">
            <p>
              U postavkama ispisa odaberi <b>veličinu 100 %</b>, bez prilagodbe stranici, a margine ostavi na{' '}
              <b>Zadano</b> ili <b>Bez</b>. Inače nacrt neće biti u mjerilu.
            </p>
            <p className="text-muted">
              Na svakoj stranici je mjerna traka od 5 cm. Ravnalom provjeri je li duga točno 5 cm.
            </p>
            <button
              className="btn btn-primary w-full"
              onClick={() => {
                setPrintHint(false);
                setPrintMounted(true);
                setPrintRequested(true);
              }}
            >
              <Printer className="w-4 h-4" /> Otvori ispis
            </button>
          </div>
        </Dialog>
      )}

      {printMounted && (
        <PrintSheets
          projectName={name}
          data={data}
          segments={segments}
          circuitAnalyses={circuitAnalyses}
          bom={bom}
          showFurniture={layers.furniture}
        />
      )}
    </div>
  );
}
