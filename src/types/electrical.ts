export type WallId = 'north' | 'east' | 'south' | 'west';
export type SurfaceId = WallId | 'ceiling';

export interface RoomDimensions {
  length: number; // North & South wall width (X axis, meters)
  width: number;  // East & West wall width (Z axis, meters)
  height: number; // Wall height from floor to ceiling (Y axis, meters)
}

export type OpeningType = 'door' | 'window';

export interface WallOpening {
  id: string;
  wall: WallId;
  type: OpeningType;
  label: string;
  offsetFromLeft: number; // meters from left corner of the wall (looking from inside)
  width: number;          // meters
  height: number;         // meters
  sillHeight: number;     // 0 for doors, e.g. 0.90m for windows
}

export type ElementCategory =
  | 'distribution_board'
  | 'junction_box'
  | 'socket_single'
  | 'socket_double'
  | 'socket_shuko_3p'
  | 'switch_single'
  | 'switch_double'
  | 'switch_two_way'
  | 'switch_cross'
  | 'light_ceiling'
  | 'light_wall';

export interface ElectricalNode {
  id: string;
  surface: SurfaceId;
  category: ElementCategory;
  label: string;
  /**
   * For walls: horizontal distance from left edge of wall (0 .. wallWidth)
   * For ceiling: distance along length (0 .. room.length)
   */
  x: number;
  /**
   * For walls: height from floor (0 .. room.height). Note: kota od poda = y, kota od stropa = room.height - y
   * For ceiling: distance along width (0 .. room.width)
   */
  y: number;
  circuitId: string;
  /**
   * Optional ID of the Junction Box (`junction_box` RK) or Distribution Board (`distribution_board` RO)
   * that feeds this element. Allows 1 main feeder line (RO -> RK) to branch to multiple devices (RK -> devices).
   */
  parentBoxId?: string;
  /** For switches: IDs of light nodes or other switches connected in the switching group */
  controlledTargetIds?: string[];
  /** Optional custom note */
  notes?: string;
}

export type ApplianceCategory =
  | 'kuhinja'
  | 'klima_grijanje'
  | 'multimedija'
  | 'rasvjeta'
  | 'ostalo';

export interface ApplianceItem {
  id: string;
  name: string;
  category: ApplianceCategory;
  powerWatts: number;
  requiresDedicatedCircuit: boolean;
  threePhase?: boolean;
  /** Optional assignment to a specific socket (or switch/light) node ID */
  assignedNodeId?: string;
  /** Target circuit ID (used when not assigned to a specific socket, or derived from socket) */
  circuitId: string;
}

export interface ElectricalCircuit {
  id: string;
  code: string; // e.g., "SK-1", "SK-2"
  name: string;
  breakerAmps: 10 | 16 | 20;
  breakerCurve: 'B' | 'C';
  phaseType: '1P' | '3P';
  cableCrossSection: 1.5 | 2.5 | 4.0;
  color: string;
  mainJunctionBoxId: string;
}

export type WireConductor =
  | 'L'             // Faza (Smeđa - Brown)
  | 'L_switched'    // Prekidna / komutirana faza 1 (Narančasta/Crna)
  | 'L_switched_2'  // Prekidna faza 2 kod serijskog prekidača (Ljubičasta/Siva)
  | 'L_traveler_1'  // Korespondentni vodič 1 kod izmjeničnog/križnog (Siva)
  | 'L_traveler_2'  // Korespondentni vodič 2 kod izmjeničnog/križnog (Crna)
  | 'L1'            // Faza L1 kod trofaznog (Smeđa)
  | 'L2'            // Faza L2 kod trofaznog (Crna)
  | 'L3'            // Faza L3 kod trofaznog (Siva)
  | 'N'             // Nula (Plava - Blue)
  | 'PE';           // Zaštitno uzemljenje (Žuto-zelena - Green/Yellow)

export interface RoutedSegment {
  id: string;
  circuitId: string;
  fromNodeId: string;
  toNodeId: string;
  surface: SurfaceId;
  points: { x: number; y: number }[];
  lengthMeters: number;
  conduitDiameterMm: 16 | 20 | 25 | 32;
  conductors: WireConductor[];
  cableSpec: string; // e.g. "NYM-J 3x2.5 mm²" or "NYM-J 5x1.5 mm²"
  crossSectionMm2: 1.5 | 2.5 | 4.0;
  description: string;
  /** True if this segment is a main feeder from Razvodni ormar (RO) to a Razvodna kutija (RK) */
  isMainFeeder?: boolean;
  /** Number of downstream devices served by this feeder */
  fedDevicesCount?: number;
}

export interface CircuitAnalysis {
  circuit: ElectricalCircuit;
  nodesCount: number;
  socketOutletsCount: number;
  switchesCount: number;
  lightsCount: number;
  assignedAppliances: ApplianceItem[];
  totalPowerWatts: number;
  currentAmps: number;
  maxCapacityWatts: number;
  utilizationPercent: number;
  status: 'nominal' | 'warning' | 'overload';
  recommendedBreakerAmps: 10 | 16 | 20;
  recommendedCrossSection: 1.5 | 2.5 | 4.0;
  totalCableLengthMeters: number;
  conduitLengthsByDiameter: Record<16 | 20 | 25 | 32, number>;
  warnings: string[];
}

export interface SocketBalanceSummary {
  totalSingleSockets: number;
  totalDoubleSockets: number;
  totalThreePhaseSockets: number;
  totalAvailableOutlets1P: number; // single * 1 + double * 2
  totalAvailableOutlets3P: number;
  totalPlugAppliances1P: number;
  totalPlugAppliances3P: number;
  assignedAppliancesCount: number;
  unassignedAppliancesCount: number;
  freeOutlets1P: number;
  missingOutlets1P: number;
  missingOutlets3P: number;
  isBalanced: boolean;
}

export interface BomSummary {
  cablesBySpec: Record<string, number>; // spec -> total meters (including 10% reserve + box slack)
  conduitsByDiameter: Record<number, number>; // diameter mm -> total meters
  countsByCategory: Record<ElementCategory, number>;
  breakersBySpec: Record<string, number>;
  wagoConnectorsCount: number;
  totalEstimatedLengthMeters: number;
}
