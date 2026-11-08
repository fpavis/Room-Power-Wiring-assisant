import {
  ApplianceCategory,
  ApplianceItem,
  ElectricalCircuit,
  ElectricalNode,
  ElementCategory,
  FurnitureItem,
  RoomDimensions,
  WallId,
  WallOpening,
} from '../types/electrical';

export const WALL_META: Record<
  WallId,
  { name: string; short: string; angleLabel: string; description: string }
> = {
  north: {
    name: 'Sjeverni zid (S)',
    short: 'Zid S',
    angleLabel: '1. u nizu',
    description: 'Glavni čelni zid (dužina prostorije)',
  },
  east: {
    name: 'Istočni zid (I)',
    short: 'Zid I',
    angleLabel: '2. u nizu',
    description: 'Desni bočni zid (širina prostorije)',
  },
  south: {
    name: 'Južni zid (J)',
    short: 'Zid J',
    angleLabel: '3. u nizu',
    description: 'Stražnji zid (dužina prostorije)',
  },
  west: {
    name: 'Zapadni zid (Z)',
    short: 'Zid Z',
    angleLabel: '4. u nizu',
    description: 'Lijevi bočni zid (širina prostorije)',
  },
};

export interface ElementMetaInfo {
  category: ElementCategory;
  name: string;
  shortCode: string;
  defaultHeightMeters: number; // Standard installation height from floor
  outletsProvided: number;
  isThreePhase?: boolean;
  defaultPowerWatts?: number;
  description: string;
  symbolText: string;
}

export const ELEMENT_CATALOG: Record<ElementCategory, ElementMetaInfo> = {
  distribution_board: {
    category: 'distribution_board',
    name: 'Razvodni ormar s osiguračima',
    shortCode: 'RO',
    defaultHeightMeters: 1.65, // Standardna visina razvodnog ormara u razini očiju
    outletsProvided: 0,
    description: 'Glavni razvodni ormar s automatskim osiguračima i FID sklopkom od kojeg kreću strujni krugovi',
    symbolText: 'RO⚡',
  },
  junction_box: {
    category: 'junction_box',
    name: 'Razvodna kutija Ø80/100',
    shortCode: 'RK',
    defaultHeightMeters: 2.30, // 30 cm ispod stropa (DIN VDE 0100 gornja zona)
    outletsProvided: 0,
    description: 'Grananje 1 glavnog voda iz ormara na više utičnica, prekidača ili rasvjetnih tijela (WAGO spojnice)',
    symbolText: 'RK',
  },
  socket_single: {
    category: 'socket_single',
    name: 'Jednostruka Šuko utičnica',
    shortCode: 'U1',
    defaultHeightMeters: 0.30, // 30 cm od poda
    outletsProvided: 1,
    description: 'Standardna 1P+N+PE utičnica 16A / 230V (1 priključno mjesto)',
    symbolText: '⊶',
  },
  socket_double: {
    category: 'socket_double',
    name: 'Dvostruka Šuko utičnica',
    shortCode: 'U2',
    defaultHeightMeters: 0.30,
    outletsProvided: 2,
    description: 'Dvostruka 1P+N+PE utičnica 16A / 230V (2 priključna mjesta)',
    symbolText: '⊶⊶',
  },
  socket_shuko_3p: {
    category: 'socket_shuko_3p',
    name: 'Trofazna priključnica (5P)',
    shortCode: 'U3P',
    defaultHeightMeters: 0.60,
    outletsProvided: 1,
    isThreePhase: true,
    description: 'Trofazni priključak 400V (3L+N+PE) za indukciju, pećnicu ili jaču klimu',
    symbolText: '3~',
  },
  socket_fixed_1p: {
    category: 'socket_fixed_1p',
    name: 'Fiksni priključak (priključna kutija)',
    shortCode: 'FP',
    defaultHeightMeters: 0.60,
    outletsProvided: 1,
    description: 'Izravni priključak jačeg jednofaznog trošila, za krugove iznad 16 A gdje Šuko utičnica nije dopuštena',
    symbolText: '⊞',
  },
  switch_single: {
    category: 'switch_single',
    name: 'Jednopolni prekidač',
    shortCode: 'P1',
    defaultHeightMeters: 1.05,
    outletsProvided: 0,
    description: 'Prekida fazu (L → L\') za paljenje/gašenje jednog rasvjetnog kruga',
    symbolText: '⏻1',
  },
  switch_double: {
    category: 'switch_double',
    name: 'Serijski (dvostruki) prekidač',
    shortCode: 'P2',
    defaultHeightMeters: 1.05,
    outletsProvided: 0,
    description: 'Dva neovisna prekidača u jednom okviru (L → L1\', L2\') za dvije grupe svjetala',
    symbolText: '⏻2',
  },
  switch_two_way: {
    category: 'switch_two_way',
    name: 'Izmjenični prekidač',
    shortCode: 'PI',
    defaultHeightMeters: 1.05,
    outletsProvided: 0,
    description: 'Upravljanje rasvjetom s 2 mjesta pomoću 2 korespondentna vodiča',
    symbolText: '⇄',
  },
  switch_cross: {
    category: 'switch_cross',
    name: 'Križni prekidač (Međuprekidač)',
    shortCode: 'PK',
    defaultHeightMeters: 1.05,
    outletsProvided: 0,
    description: 'Umeće se između dva izmjenična prekidača za paljenje s 3 ili više mjesta',
    symbolText: '✕',
  },
  light_ceiling: {
    category: 'light_ceiling',
    name: 'Stropno rasvjetno mjesto',
    shortCode: 'RS',
    defaultHeightMeters: 2.60,
    outletsProvided: 0,
    defaultPowerWatts: 60,
    description: 'Glavno stropno rasvjetno tijelo (luster / LED panel) s fazom, nulom i uzemljenjem',
    symbolText: '⊗',
  },
  light_wall: {
    category: 'light_wall',
    name: 'Zidna lampa / Aplika',
    shortCode: 'RZ',
    defaultHeightMeters: 1.85,
    outletsProvided: 0,
    defaultPowerWatts: 40,
    description: 'Zidno ambijentalno ili radno rasvjetno tijelo',
    symbolText: '◐',
  },
};

export interface CatalogApplianceTemplate {
  name: string;
  category: ApplianceCategory;
  powerWatts: number;
  requiresDedicatedCircuit: boolean;
  threePhase?: boolean;
  recommendedHeightMeters: number;
}

export const APPLIANCE_CATALOG_TEMPLATES: CatalogApplianceTemplate[] = [
  {
    name: 'Hladnjak sa zamrzivačem',
    category: 'kuhinja',
    powerWatts: 250,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 0.60,
  },
  {
    name: 'Ugradbena pećnica',
    category: 'kuhinja',
    powerWatts: 3200,
    requiresDedicatedCircuit: true,
    recommendedHeightMeters: 0.60,
  },
  {
    name: 'Indukcijska ploča za kuhanje (3P)',
    category: 'kuhinja',
    powerWatts: 7200,
    requiresDedicatedCircuit: true,
    threePhase: true,
    recommendedHeightMeters: 0.60,
  },
  {
    name: 'Perilica posuđa',
    category: 'kuhinja',
    powerWatts: 2200,
    requiresDedicatedCircuit: true,
    recommendedHeightMeters: 0.50,
  },
  {
    name: 'Klima uređaj (inverter 3,5 kW)',
    category: 'klima_grijanje',
    powerWatts: 1350,
    requiresDedicatedCircuit: true,
    recommendedHeightMeters: 2.20,
  },
  {
    name: 'Električni bojler (80L)',
    category: 'klima_grijanje',
    powerWatts: 2000,
    requiresDedicatedCircuit: true,
    recommendedHeightMeters: 1.80,
  },
  {
    name: 'Televizor 65" i zvučna traka',
    category: 'multimedija',
    powerWatts: 320,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 0.45,
  },
  {
    name: 'Računalo i 2 monitora',
    category: 'multimedija',
    powerWatts: 650,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 0.30,
  },
  {
    name: 'Wi-Fi usmjerivač i mrežni preklopnik',
    category: 'multimedija',
    powerWatts: 45,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 0.30,
  },
  {
    name: 'Samostojeća lampa',
    category: 'rasvjeta',
    powerWatts: 75,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 0.30,
  },
  {
    name: 'Mikrovalna pećnica',
    category: 'kuhinja',
    powerWatts: 1200,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 1.15,
  },
  {
    name: 'Kuhinjska napa',
    category: 'kuhinja',
    powerWatts: 180,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 1.95,
  },
  {
    name: 'Kuhalo za vodu / Espresso aparat',
    category: 'kuhinja',
    powerWatts: 1850,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 1.15,
  },
  {
    name: 'Perilica rublja',
    category: 'ostalo',
    powerWatts: 2100,
    requiresDedicatedCircuit: true,
    recommendedHeightMeters: 0.60,
  },
  {
    name: 'Usisavač ili pomoćno trošilo',
    category: 'ostalo',
    powerWatts: 900,
    requiresDedicatedCircuit: false,
    recommendedHeightMeters: 0.30,
  },
];

export const CONDUCTOR_META: Record<
  string,
  { label: string; short: string; colorHex: string; iecColorName: string; role: string }
> = {
  L: {
    label: 'Faza (L)',
    short: 'L',
    colorHex: '#7A4A1E',
    iecColorName: 'Smeđa (IEC)',
    role: 'Stalni fazni vodič pod naponom 230V',
  },
  L_switched: {
    label: 'Komutirana faza (L\')',
    short: 'L\'',
    colorHex: '#C2410C',
    iecColorName: 'Crna (na shemi narančasta)',
    role: 'Prekinuta faza od prekidača prema trošilu (svjetlu)',
  },
  L_switched_2: {
    label: 'Komutirana faza 2 (L\'\')',
    short: 'L\'\'',
    colorHex: '#6D35B8',
    iecColorName: 'Siva (na shemi ljubičasta)',
    role: 'Druga grana serijskog (dvostrukog) prekidača',
  },
  L_traveler_1: {
    label: 'Korespondent 1 (K1)',
    short: 'K1',
    colorHex: '#6B6B6B',
    iecColorName: 'Siva',
    role: 'Prvi korespondentni vodič između izmjeničnih/križnih prekidača',
  },
  L_traveler_2: {
    label: 'Korespondent 2 (K2)',
    short: 'K2',
    colorHex: '#111111',
    iecColorName: 'Crna',
    role: 'Drugi korespondentni vodič između izmjeničnih/križnih prekidača',
  },
  L1: {
    label: 'Faza L1 (3P)',
    short: 'L1',
    colorHex: '#7A4A1E',
    iecColorName: 'Smeđa',
    role: 'Prva faza trofaznog sustava (400V)',
  },
  L2: {
    label: 'Faza L2 (3P)',
    short: 'L2',
    colorHex: '#111111',
    iecColorName: 'Crna',
    role: 'Druga faza trofaznog sustava (400V)',
  },
  L3: {
    label: 'Faza L3 (3P)',
    short: 'L3',
    colorHex: '#6B6B6B',
    iecColorName: 'Siva',
    role: 'Treća faza trofaznog sustava (400V)',
  },
  N: {
    label: 'Nula (N)',
    short: 'N',
    colorHex: '#0A5FC4',
    iecColorName: 'Svijetloplava (IEC)',
    role: 'Neutralni povratni vodič',
  },
  PE: {
    label: 'Uzemljenje (PE)',
    short: 'PE',
    colorHex: '#00753B',
    iecColorName: 'Žuto-zelena (IEC)',
    role: 'Zaštitni vodič uzemljenja',
  },
};

/**
 * Prostorija 2.90 x 5.90 m:
 * - Sjeverni i Južni zid (length): 2.90 m
 * - Zapadni i Istočni zid (width): 5.90 m (duži zidovi)
 * - Visina: 2.60 m
 */
export const INITIAL_ROOM: RoomDimensions = {
  length: 2.9,
  width: 5.9,
  height: 2.6,
};

export const INITIAL_OPENINGS: WallOpening[] = [
  // Zapadni zid (5.90 m): Vrata na sredini (2.50..3.40 m) i prozor 1x1 m lijevo od vrata (1.35..2.35 m)
  {
    id: 'op-door-west',
    wall: 'west',
    type: 'door',
    label: 'Ulazna vrata',
    offsetFromLeft: 2.5,
    width: 0.9,
    height: 2.05,
    sillHeight: 0,
  },
  {
    id: 'op-win-west',
    wall: 'west',
    type: 'window',
    label: 'Prozor 1×1m',
    offsetFromLeft: 1.35,
    width: 1.0,
    height: 1.0,
    sillHeight: 1.05,
  },
  // Južni zid (2.90 m - Kuhinja): Prozor 60x60 cm
  {
    id: 'op-win-south',
    wall: 'south',
    type: 'window',
    label: 'Prozor 60×60cm',
    offsetFromLeft: 0.35,
    width: 0.6,
    height: 0.6,
    sillHeight: 1.35,
  },
];

export const INITIAL_FURNITURE: FurnitureItem[] = [
  { id: 'fur-1', wall: 'south', name: 'Donji element', offsetFromLeft: 0, width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { id: 'fur-2', wall: 'south', name: 'Donji element', offsetFromLeft: 0.6, width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { id: 'fur-3', wall: 'south', name: 'Štednjak', offsetFromLeft: 1.2, width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { id: 'fur-4', wall: 'south', name: 'Perilica posuđa', offsetFromLeft: 1.8, width: 0.6, height: 0.85, depth: 0.6, bottom: 0 },
  { id: 'fur-5', wall: 'south', name: 'Viseći ormarić', offsetFromLeft: 1.8, width: 0.6, height: 0.7, depth: 0.35, bottom: 1.45 },
  { id: 'fur-6', wall: 'south', name: 'Napa', offsetFromLeft: 1.2, width: 0.6, height: 0.4, depth: 0.5, bottom: 1.6 },
  { id: 'fur-7', wall: 'east', name: 'Klima uređaj', offsetFromLeft: 4.25, width: 0.8, height: 0.3, depth: 0.25, bottom: 2.15 },
];

export const INITIAL_CIRCUITS: ElectricalCircuit[] = [
  {
    id: 'cir-1',
    code: 'SK-1',
    name: 'Utičnice boravak (Zapad, Sjever, Istok)',
    breakerAmps: 16,
    breakerCurve: 'B',
    phaseType: '1P',
    cableCrossSection: 2.5,
    color: '#0A5FC4',
    mainJunctionBoxId: 'node-rk-north',
  },
  {
    id: 'cir-2',
    code: 'SK-2',
    name: 'Kuhinja (Hladnjak, Napa, Radna ploha)',
    breakerAmps: 16,
    breakerCurve: 'B',
    phaseType: '1P',
    cableCrossSection: 2.5,
    color: '#00753B',
    mainJunctionBoxId: 'node-rk-south',
  },
  {
    id: 'cir-3',
    code: 'SK-3',
    name: 'Ugradbena pećnica (Zasebni vod)',
    breakerAmps: 16,
    breakerCurve: 'B',
    phaseType: '1P',
    cableCrossSection: 2.5,
    color: '#A85400',
    mainJunctionBoxId: 'node-ro-1',
  },
  {
    id: 'cir-4',
    code: 'SK-4',
    name: 'Perilica posuđa (Zasebni vod)',
    breakerAmps: 16,
    breakerCurve: 'B',
    phaseType: '1P',
    cableCrossSection: 2.5,
    color: '#6D35B8',
    mainJunctionBoxId: 'node-ro-1',
  },
  {
    id: 'cir-5',
    code: 'SK-5',
    name: 'Klima uređaj Istok (Zasebni vod)',
    breakerAmps: 16,
    breakerCurve: 'C',
    phaseType: '1P',
    cableCrossSection: 2.5,
    color: '#00707F',
    mainJunctionBoxId: 'node-ro-1',
  },
  {
    id: 'cir-6',
    code: 'SK-6',
    name: 'Rasvjeta prostorije',
    breakerAmps: 10,
    breakerCurve: 'B',
    phaseType: '1P',
    cableCrossSection: 1.5,
    color: '#5F5F00',
    mainJunctionBoxId: 'node-ro-1',
  },
];

export const INITIAL_NODES: ElectricalNode[] = [
  // ============================================================================
  // 1. SREDIŠNJI ZID U OTKLOPU: ZAPADNI ZID (5.90 m)
  // Gornji lijevi kut: Dolazni vod + Razvodni ormar s osiguračima (RO-1)
  // Lijevo od vrata: TV i prozor 1x1m | Sredina: Ulazna vrata | Desno: Prekidač i utičnica
  // ============================================================================
  {
    id: 'node-ro-1',
    surface: 'west',
    category: 'distribution_board',
    label: 'RO-1 (Razvodni ormar + Dolazni vod)',
    x: 0.35,
    y: 2.05,
    circuitId: 'cir-1',
  },
  {
    id: 'node-u-tv',
    surface: 'west',
    category: 'socket_double',
    label: 'U-1 (TV & Multimedija)',
    x: 0.90,
    y: 0.45,
    circuitId: 'cir-1',
    parentBoxId: 'node-ro-1',
  },
  {
    id: 'node-sw-ulaz',
    surface: 'west',
    category: 'switch_single',
    label: 'P1-1 (Prekidač uz vrata)',
    x: 3.65,
    y: 1.05,
    circuitId: 'cir-6',
    parentBoxId: 'node-ro-1',
    controlledTargetIds: ['node-light-main'],
  },
  {
    id: 'node-u-zapad-2',
    surface: 'west',
    category: 'socket_single',
    label: 'U-2 (Utičnica desno od vrata)',
    x: 4.85,
    y: 0.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-ro-1',
  },

  // ============================================================================
  // 2. LIJEVI ZID U OTKLOPU: JUŽNI ZID (2.90 m) — KUHINJA
  // Prozor 60x60cm + Hladnjak, Pećnica, Perilica posuđa, Napa + Radna ploha
  // ============================================================================
  {
    id: 'node-rk-south',
    surface: 'south',
    category: 'junction_box',
    label: 'RK-1 (Razvodna kutija kuhinja)',
    x: 1.55,
    y: 2.30,
    circuitId: 'cir-2',
    parentBoxId: 'node-ro-1',
  },
  {
    id: 'node-u-frizider',
    surface: 'south',
    category: 'socket_single',
    label: 'U-3 (Hladnjak)',
    x: 0.55,
    y: 0.45,
    circuitId: 'cir-2',
    parentBoxId: 'node-rk-south',
  },
  {
    id: 'node-u-radna',
    surface: 'south',
    category: 'socket_double',
    label: 'U-4 (Radna ploha kuhinje)',
    x: 1.55,
    y: 1.15,
    circuitId: 'cir-2',
    parentBoxId: 'node-rk-south',
  },
  {
    id: 'node-u-napa',
    surface: 'south',
    category: 'socket_single',
    label: 'U-5 (Kuhinjska napa)',
    x: 1.55,
    y: 1.95,
    circuitId: 'cir-2',
    parentBoxId: 'node-rk-south',
  },
  {
    id: 'node-u-perilica',
    surface: 'south',
    category: 'socket_single',
    label: 'U-6 (Perilica posuđa - direktni vod)',
    x: 2.05,
    y: 0.50,
    circuitId: 'cir-4',
    parentBoxId: 'node-ro-1',
  },
  {
    id: 'node-u-pecnica',
    surface: 'south',
    category: 'socket_single',
    label: 'U-7 (Pećnica - direktni vod)',
    x: 2.50,
    y: 0.55,
    circuitId: 'cir-3',
    parentBoxId: 'node-ro-1',
  },

  // ============================================================================
  // 3. DESNI ZID U OTKLOPU: SJEVERNI ZID (2.90 m) — PAR UTIČNICA
  // ============================================================================
  {
    id: 'node-rk-north',
    surface: 'north',
    category: 'junction_box',
    label: 'RK-2 (Razvodna kutija Sjever)',
    x: 0.85,
    y: 2.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-ro-1',
  },
  {
    id: 'node-u-sjever-1',
    surface: 'north',
    category: 'socket_single',
    label: 'U-8 (Utičnica Sjever 1)',
    x: 0.85,
    y: 0.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-rk-north',
  },
  {
    id: 'node-u-sjever-2',
    surface: 'north',
    category: 'socket_double',
    label: 'U-9 (Utičnica Sjever 2)',
    x: 2.05,
    y: 0.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-rk-north',
  },

  // ============================================================================
  // 4. SUPROTNI ZID (DESNO U NASTAVKU): ISTOČNI ZID (5.90 m) — KLIMA I PAR UTIČNICA
  // ============================================================================
  {
    id: 'node-rk-east',
    surface: 'east',
    category: 'junction_box',
    label: 'RK-3 (Razvodna kutija Istok)',
    x: 1.50,
    y: 2.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-ro-1',
  },
  {
    id: 'node-u-istok-1',
    surface: 'east',
    category: 'socket_double',
    label: 'U-10 (Utičnica Istok 1)',
    x: 1.50,
    y: 0.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-rk-east',
  },
  {
    id: 'node-u-istok-2',
    surface: 'east',
    category: 'socket_single',
    label: 'U-11 (Utičnica Istok 2)',
    x: 3.30,
    y: 0.30,
    circuitId: 'cir-1',
    parentBoxId: 'node-rk-east',
  },
  {
    id: 'node-u-klima',
    surface: 'east',
    category: 'socket_single',
    label: 'U-12 (Klima uređaj - direktni vod)',
    x: 4.65,
    y: 2.20,
    circuitId: 'cir-5',
    parentBoxId: 'node-ro-1',
  },

  // ============================================================================
  // 5. STROP (5.90 x 2.90 m IZNAD ZAPADNOG ZIDA)
  // ============================================================================
  {
    id: 'node-light-main',
    surface: 'ceiling',
    category: 'light_ceiling',
    label: 'RS-1 (Stropna rasvjeta)',
    x: 1.45,
    y: 2.95,
    circuitId: 'cir-6',
    parentBoxId: 'node-ro-1',
  },
];

export const INITIAL_APPLIANCES: ApplianceItem[] = [
  {
    id: 'app-tv',
    name: 'Televizor 65" i zvučna traka',
    category: 'multimedija',
    powerWatts: 320,
    requiresDedicatedCircuit: false,
    assignedNodeId: 'node-u-tv',
    circuitId: 'cir-1',
  },
  {
    id: 'app-frizider',
    name: 'Hladnjak sa zamrzivačem',
    category: 'kuhinja',
    powerWatts: 250,
    requiresDedicatedCircuit: false,
    assignedNodeId: 'node-u-frizider',
    circuitId: 'cir-2',
  },
  {
    id: 'app-napa',
    name: 'Kuhinjska napa',
    category: 'kuhinja',
    powerWatts: 180,
    requiresDedicatedCircuit: false,
    assignedNodeId: 'node-u-napa',
    circuitId: 'cir-2',
  },
  {
    id: 'app-perilica',
    name: 'Perilica posuđa',
    category: 'kuhinja',
    powerWatts: 2200,
    requiresDedicatedCircuit: true,
    assignedNodeId: 'node-u-perilica',
    circuitId: 'cir-4',
  },
  {
    id: 'app-pecnica',
    name: 'Ugradbena pećnica',
    category: 'kuhinja',
    powerWatts: 3200,
    requiresDedicatedCircuit: true,
    assignedNodeId: 'node-u-pecnica',
    circuitId: 'cir-3',
  },
  {
    id: 'app-klima',
    name: 'Klima uređaj (inverter 3,5 kW)',
    category: 'klima_grijanje',
    powerWatts: 1350,
    requiresDedicatedCircuit: true,
    assignedNodeId: 'node-u-klima',
    circuitId: 'cir-5',
  },
];
