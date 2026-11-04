import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONDUCTOR_META, ELEMENT_CATALOG, WALL_META } from '../data/presets';
import {
  ElectricalCircuit,
  ElectricalNode,
  RoomDimensions,
  RoutedSegment,
  SurfaceId,
  WallId,
  WallOpening,
} from '../types/electrical';

interface UnfoldedRoom3DProps {
  room: RoomDimensions;
  openings: WallOpening[];
  nodes: ElectricalNode[];
  circuits: ElectricalCircuit[];
  segments: RoutedSegment[];
  unfoldTarget: number; // 0 = 3D closed room, 1 = 4 walls in a row + ceiling above junction box wall
  showWireConductors: boolean;
  showInstallZones: boolean;
  selectedNodeId: string | null;
  activeCircuitFilter: string;
  onSelectNode: (nodeId: string | null) => void;
  onSelectSurface: (surface: SurfaceId) => void;
}

/**
 * In our lateral hinge chain, each wall group has its local origin (0, 0, 0)
 * at the bottom-left corner of that wall (looking from inside), or bottom-right for West.
 * To keep local coordinates uniform across all walls:
 * Inside each wall's `contentGroup`, local (0, 0, 0) is bottom-left corner of the wall:
 * - x in [0, wallWidth]
 * - y in [0, room.height]
 * - z = +0.025 (interior face)
 */
function wallPointToLocal3D(x: number, y: number, zOffset = 0.025): THREE.Vector3 {
  return new THREE.Vector3(x, y, zOffset);
}

function createTextLabelSprite(
  text: string,
  subText: string,
  bgColor = '#0F172A',
  borderColor = '#38BDF8'
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(6, 6, 244, 84, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text.slice(0, 16), 128, 44);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '20px "JetBrains Mono", monospace';
  ctx.fillText(subText.slice(0, 20), 128, 74);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.45, 0.17, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function buildProceduralNodeMesh(
  node: ElectricalNode,
  circuitColor: string,
  isSelected: boolean,
  kotaPoda: number,
  kotaStropa: number
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { nodeId: node.id, surface: node.surface };

  const frameColor = isSelected ? 0x38bdf8 : 0xf1f5f9;
  const accentHex = new THREE.Color(circuitColor).getHex();

  const isDistBoard = node.category === 'distribution_board';
  const isDouble =
    node.category === 'socket_double' || node.category === 'switch_double';
  const plateW = isDistBoard ? 0.30 : isDouble ? 0.15 : 0.09;
  const plateH = isDistBoard ? 0.22 : 0.09;
  const plateGeo = new THREE.BoxGeometry(
    plateW,
    plateH,
    isDistBoard ? 0.045 : 0.018
  );
  const plateMat = new THREE.MeshStandardMaterial({
    color: isDistBoard ? 0x1e293b : frameColor,
    roughness: 0.35,
    metalness: isDistBoard ? 0.45 : 0.1,
  });
  const plateMesh = new THREE.Mesh(plateGeo, plateMat);
  plateMesh.castShadow = true;
  plateMesh.userData = { nodeId: node.id };
  group.add(plateMesh);

  if (node.category === 'distribution_board') {
    // Amber safety border & DIN rail with 5 miniature circuit breakers (osigurači)
    const doorGeo = new THREE.BoxGeometry(0.26, 0.18, 0.05);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.5,
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.z = 0.005;
    door.userData = { nodeId: node.id };
    group.add(door);

    for (let i = 0; i < 5; i++) {
      const mcbGeo = new THREE.BoxGeometry(0.032, 0.075, 0.058);
      const mcbMat = new THREE.MeshStandardMaterial({
        color: i === 0 ? 0xf59e0b : 0xe2e8f0,
        roughness: 0.3,
        metalness: 0.2,
      });
      const mcb = new THREE.Mesh(mcbGeo, mcbMat);
      mcb.position.set(-0.08 + i * 0.04, 0, 0.008);
      mcb.userData = { nodeId: node.id };
      group.add(mcb);
    }
  } else if (node.category === 'junction_box') {
    const cylGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.028, 24);
    cylGeo.rotateX(Math.PI / 2);
    const cylMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      roughness: 0.4,
      metalness: 0.3,
    });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.z = 0.012;
    cyl.userData = { nodeId: node.id };
    group.add(cyl);

    const capGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.032, 24);
    capGeo.rotateX(Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.15,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.z = 0.015;
    cap.userData = { nodeId: node.id };
    group.add(cap);
  } else if (node.category.startsWith('socket_')) {
    const count = node.category === 'socket_double' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const offsetX = count === 2 ? (i === 0 ? -0.034 : 0.034) : 0;
      const wellGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.022, 20);
      wellGeo.rotateX(Math.PI / 2);
      const wellMat = new THREE.MeshStandardMaterial({
        color: node.category === 'socket_shuko_3p' ? 0xdc2626 : accentHex,
        roughness: 0.3,
        metalness: 0.2,
      });
      const well = new THREE.Mesh(wellGeo, wellMat);
      well.position.set(offsetX, 0, 0.01);
      well.userData = { nodeId: node.id };
      group.add(well);
    }
  } else if (node.category.startsWith('switch_')) {
    const rockers = node.category === 'switch_double' ? 2 : 1;
    for (let i = 0; i < rockers; i++) {
      const offsetX = rockers === 2 ? (i === 0 ? -0.022 : 0.022) : 0;
      const rockerW = rockers === 2 ? 0.032 : 0.056;
      const rockerGeo = new THREE.BoxGeometry(rockerW, 0.056, 0.022);
      const rockerMat = new THREE.MeshStandardMaterial({
        color: accentHex,
        roughness: 0.25,
        metalness: 0.35,
      });
      const rocker = new THREE.Mesh(rockerGeo, rockerMat);
      rocker.position.set(offsetX, 0, 0.01);
      rocker.rotation.x = 0.12;
      rocker.userData = { nodeId: node.id };
      group.add(rocker);
    }
  } else if (node.category.startsWith('light_')) {
    const baseGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.035, 24);
    baseGeo.rotateX(Math.PI / 2);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.7,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.z = 0.015;
    base.userData = { nodeId: node.id };
    group.add(base);

    const diffuserGeo = new THREE.SphereGeometry(0.095, 20, 16);
    diffuserGeo.scale(1, 1, 0.45);
    const diffuserMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.65,
      roughness: 0.15,
    });
    const diffuser = new THREE.Mesh(diffuserGeo, diffuserMat);
    diffuser.position.z = 0.03;
    diffuser.userData = { nodeId: node.id };
    group.add(diffuser);
  }

  if (isSelected) {
    const ringGeo = new THREE.RingGeometry(0.09, 0.115, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = 0.005;
    group.add(ring);

    const shortCode = ELEMENT_CATALOG[node.category]?.shortCode || 'EL';
    const subInfo =
      node.surface === 'ceiling'
        ? `X:${node.x.toFixed(2)}m Y:${node.y.toFixed(2)}m`
        : `↕Pod:${kotaPoda.toFixed(2)}m Strop:${kotaStropa.toFixed(2)}m`;
    const sprite = createTextLabelSprite(
      `${shortCode} · ${node.label.split(' ')[0]}`,
      subInfo,
      '#0C4A6E',
      '#38BDF8'
    );
    sprite.position.set(0, 0.16, 0.08);
    group.add(sprite);
  }

  return group;
}

export const UnfoldedRoom3D: React.FC<UnfoldedRoom3DProps> = ({
  room,
  openings,
  nodes,
  circuits,
  segments,
  unfoldTarget,
  showWireConductors,
  showInstallZones,
  selectedNodeId,
  activeCircuitFilter,
  onSelectNode,
  onSelectSurface,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const unfoldCurrentRef = useRef<number>(unfoldTarget);
  const unfoldTargetRef = useRef<number>(unfoldTarget);

  const propsRef = useRef({
    room,
    openings,
    nodes,
    circuits,
    segments,
    showWireConductors,
    showInstallZones,
    selectedNodeId,
    activeCircuitFilter,
    onSelectNode,
    onSelectSurface,
  });

  useEffect(() => {
    propsRef.current = {
      room,
      openings,
      nodes,
      circuits,
      segments,
      showWireConductors,
      showInstallZones,
      selectedNodeId,
      activeCircuitFilter,
      onSelectNode,
      onSelectSurface,
    };
  }, [
    room,
    openings,
    nodes,
    circuits,
    segments,
    showWireConductors,
    showInstallZones,
    selectedNodeId,
    activeCircuitFilter,
    onSelectNode,
    onSelectSurface,
  ]);

  useEffect(() => {
    unfoldTargetRef.current = unfoldTarget;
  }, [unfoldTarget]);

  const pivotsRef = useRef<{
    leftHinge?: THREE.Group;
    rightHinge?: THREE.Group;
    oppositeHinge?: THREE.Group;
    ceilingHinge?: THREE.Group;
    floorMesh?: THREE.Mesh;
    ceilingMat?: THREE.MeshStandardMaterial;
  }>({});

  const contentRootRef = useRef<THREE.Group | null>(null);
  const clickableMeshesRef = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.018);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 150);
    camera.position.set(0, 4.2, 11.5);

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.45);
    keyLight.position.set(6, 12, 10);
    keyLight.castShadow = !isHeadless;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(-8, 6, -7);
    scene.add(rimLight);

    const worldGrid = new THREE.GridHelper(32, 64, 0x1e293b, 0x111827);
    worldGrid.position.y = -0.02;
    scene.add(worldGrid);

    const contentRoot = new THREE.Group();
    scene.add(contentRoot);
    contentRootRef.current = contentRoot;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.5;
    controls.maxDistance = 32;
    controls.target.set(0, 1.8, 0);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (dist > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(clickableMeshesRef.current, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
          if (obj.userData?.nodeId) {
            propsRef.current.onSelectNode(obj.userData.nodeId);
            return;
          }
          if (obj.userData?.surfaceId) {
            propsRef.current.onSelectSurface(obj.userData.surfaceId);
            return;
          }
          obj = obj.parent;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);

      unfoldCurrentRef.current = THREE.MathUtils.damp(
        unfoldCurrentRef.current,
        unfoldTargetRef.current,
        5.5,
        dt
      );
      const u = unfoldCurrentRef.current;
      const halfPi = Math.PI / 2;

      const pivots = pivotsRef.current;
      // When u = 0 (closed 3D box), leftWall folds +90° and rightWall/oppositeWall fold -90°.
      // When u = 1 (unfolded strip), centerWall is in the middle, leftWall is on the left, rightWall & oppositeWall are on the right!
      if (pivots.leftHinge) {
        pivots.leftHinge.rotation.y = (1 - u) * halfPi;
      }
      if (pivots.rightHinge) {
        pivots.rightHinge.rotation.y = -(1 - u) * halfPi;
      }
      if (pivots.oppositeHinge) {
        pivots.oppositeHinge.rotation.y = -(1 - u) * halfPi;
      }
      if (pivots.ceilingHinge) {
        // When u = 0, ceiling folds 90 deg forward over the room (+halfPi around X).
        // When u = 1, ceiling unfolds straight up above the center wall containing the junction box!
        pivots.ceilingHinge.rotation.x = (1 - u) * halfPi;
      }
      if (pivots.ceilingMat) {
        pivots.ceilingMat.opacity = THREE.MathUtils.lerp(0.32, 0.92, u);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild 3D lateral wall chain: [leftWall, centerWall (with RK in middle), rightWall, oppositeWall] + Ceiling above centerWall
  useEffect(() => {
    const contentRoot = contentRootRef.current;
    if (!contentRoot) return;

    while (contentRoot.children.length > 0) {
      contentRoot.remove(contentRoot.children[0]);
    }
    clickableMeshesRef.current = [];

    const { length: L, width: W, height: H } = room;

    const centerWall: WallId = (() => {
      if (selectedNodeId) {
        const sel = nodes.find((n) => n.id === selectedNodeId);
        if (sel && sel.category === 'junction_box' && sel.surface !== 'ceiling') {
          return sel.surface;
        }
      }
      const firstRk = nodes.find(
        (n) => n.category === 'junction_box' && n.surface !== 'ceiling'
      );
      return (firstRk?.surface as WallId) || 'north';
    })();

    const cwWalls: WallId[] = ['north', 'east', 'south', 'west'];
    const cIdx = cwWalls.indexOf(centerWall);
    const leftWall = cwWalls[(cIdx + 3) % 4];
    const rightWall = cwWalls[(cIdx + 1) % 4];
    const oppositeWall = cwWalls[(cIdx + 2) % 4];

    const getWSize = (w: WallId) => (w === 'north' || w === 'south' ? L : W);
    const centerW = getWSize(centerWall);
    const leftW = getWSize(leftWall);
    const rightW = getWSize(rightWall);
    const oppW = getWSize(oppositeWall);
    const ceilDepth = centerWall === 'north' || centerWall === 'south' ? W : L;

    // Floor Slab
    const floorGeo = new THREE.BoxGeometry(centerW, 0.04, ceilDepth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.02, 0);
    contentRoot.add(floorMesh);

    // Helper that populates a wall group whose local origin (0,0,0) is at its bottom-left corner
    const populateWallContent = (
      wallId: WallId,
      wallWidth: number,
      wallHeight: number
    ): THREE.Group => {
      const group = new THREE.Group();

      const slabGeo = new THREE.BoxGeometry(wallWidth, wallHeight, 0.04);
      const slabMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.65,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.position.set(wallWidth / 2, wallHeight / 2, -0.02);
      slabMesh.userData = { surfaceId: wallId };
      group.add(slabMesh);
      clickableMeshesRef.current.push(slabMesh);

      const borderLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(slabGeo),
        new THREE.LineBasicMaterial({ color: 0x38bdf8 })
      );
      slabMesh.add(borderLines);

      // Wall header label sprite
      const wallLabel = createTextLabelSprite(
        WALL_META[wallId].name,
        `${wallWidth.toFixed(2)}m × ${wallHeight.toFixed(2)}m`,
        '#0F172A',
        '#475569'
      );
      wallLabel.scale.set(0.85, 0.28, 1);
      wallLabel.position.set(wallWidth / 2, wallHeight + 0.18, 0.02);
      group.add(wallLabel);

      if (showInstallZones) {
        const zoneMat = new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.09,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const upperZone = new THREE.Mesh(
          new THREE.PlaneGeometry(wallWidth - 0.04, 0.2),
          zoneMat
        );
        upperZone.position.set(
          wallWidth / 2,
          Math.max(0.3, wallHeight - 0.3),
          0.004
        );
        group.add(upperZone);

        const lowerZone = new THREE.Mesh(
          new THREE.PlaneGeometry(wallWidth - 0.04, 0.2),
          zoneMat
        );
        lowerZone.position.set(wallWidth / 2, 0.3, 0.004);
        group.add(lowerZone);
      }

      // Openings
      const wallOpenings = openings.filter((o) => o.wall === wallId);
      for (const op of wallOpenings) {
        const centerX = op.offsetFromLeft + op.width / 2;
        const centerY = op.sillHeight + op.height / 2;
        const opGeo = new THREE.BoxGeometry(op.width, op.height, 0.055);
        const isDoor = op.type === 'door';
        const opMat = new THREE.MeshPhysicalMaterial({
          color: isDoor ? 0x78350f : 0x38bdf8,
          roughness: isDoor ? 0.55 : 0.15,
          transmission: isDoor ? 0 : 0.7,
          transparent: true,
          opacity: isDoor ? 0.92 : 0.45,
        });
        const opMesh = new THREE.Mesh(opGeo, opMat);
        opMesh.position.set(centerX, centerY, 0);
        group.add(opMesh);
      }

      // Nodes
      const wallNodes = nodes.filter((n) => n.surface === wallId);
      for (const n of wallNodes) {
        if (activeCircuitFilter !== 'all' && n.circuitId !== activeCircuitFilter) {
          continue;
        }
        const cir = circuits.find((c) => c.id === n.circuitId);
        const cColor = cir?.color || '#38BDF8';
        const nodeGroup = buildProceduralNodeMesh(
          n,
          cColor,
          n.id === selectedNodeId,
          n.y,
          Number((wallHeight - n.y).toFixed(2))
        );
        nodeGroup.position.copy(wallPointToLocal3D(n.x, n.y, 0.015));
        group.add(nodeGroup);
        clickableMeshesRef.current.push(nodeGroup);
      }

      // Segments
      const wallSegments = segments.filter((s) => s.surface === wallId);
      for (const seg of wallSegments) {
        if (
          activeCircuitFilter !== 'all' &&
          seg.circuitId !== activeCircuitFilter
        ) {
          continue;
        }
        const cir = circuits.find((c) => c.id === seg.circuitId);
        const baseColor = cir?.color || '#38BDF8';

        if (!showWireConductors) {
          const pts3D = seg.points.map((p) =>
            wallPointToLocal3D(p.x, p.y, 0.014)
          );
          if (pts3D.length >= 2) {
            const path = new THREE.CurvePath<THREE.Vector3>();
            for (let i = 1; i < pts3D.length; i++) {
              path.add(new THREE.LineCurve3(pts3D[i - 1], pts3D[i]));
            }
            const radius = (seg.conduitDiameterMm / 1000) * 0.55;
            const tubeGeo = new THREE.TubeGeometry(
              path,
              pts3D.length * 6,
              radius,
              8,
              false
            );
            const tubeMat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(baseColor),
              roughness: 0.35,
              metalness: 0.25,
            });
            group.add(new THREE.Mesh(tubeGeo, tubeMat));
          }
        } else {
          const count = seg.conductors.length;
          seg.conductors.forEach((cond, idx) => {
            const offset = (idx - (count - 1) / 2) * 0.016;
            const condColor = CONDUCTOR_META[cond]?.colorHex || '#F8FAFC';
            const pts3D = seg.points.map((p) =>
              wallPointToLocal3D(p.x + offset, p.y + offset * 0.5, 0.018)
            );
            const lineGeo = new THREE.BufferGeometry().setFromPoints(pts3D);
            const lineMat = new THREE.LineBasicMaterial({
              color: new THREE.Color(condColor),
            });
            group.add(new THREE.Line(lineGeo, lineMat));
          });
        }
      }

      return group;
    };

    // 1. Center Wall (with Junction Box) anchored in the middle (X = -centerW/2, Z = -ceilDepth/2)
    const centerRoot = new THREE.Group();
    centerRoot.position.set(-centerW / 2, 0, -ceilDepth / 2);
    contentRoot.add(centerRoot);
    const centerContent = populateWallContent(centerWall, centerW, H);
    centerRoot.add(centerContent);

    // 2. Left Wall hinged at the LEFT edge (x = 0) of Center Wall — unfolds to the LEFT!
    const leftHinge = new THREE.Group();
    leftHinge.position.set(0, 0, 0);
    centerRoot.add(leftHinge);
    const leftContent = populateWallContent(leftWall, leftW, H);
    leftContent.position.set(-leftW, 0, 0);
    leftHinge.add(leftContent);

    // 3. Right Wall hinged at the RIGHT edge (x = centerW) of Center Wall — unfolds to the RIGHT!
    const rightHinge = new THREE.Group();
    rightHinge.position.set(centerW, 0, 0);
    centerRoot.add(rightHinge);
    const rightContent = populateWallContent(rightWall, rightW, H);
    rightHinge.add(rightContent);

    // 4. Opposite Wall hinged at the RIGHT edge (x = rightW) of Right Wall — continues to the RIGHT!
    const oppositeHinge = new THREE.Group();
    oppositeHinge.position.set(rightW, 0, 0);
    rightHinge.add(oppositeHinge);
    const oppositeContent = populateWallContent(oppositeWall, oppW, H);
    oppositeHinge.add(oppositeContent);

    // 5. Ceiling (Strop) hinged at top edge (y = H) of Center Wall (directly above the junction box wall)
    const ceilingHinge = new THREE.Group();
    ceilingHinge.position.set(0, H, 0);
    centerRoot.add(ceilingHinge);

    const ceilSlabGeo = new THREE.BoxGeometry(centerW, ceilDepth, 0.035);
    const ceilSlabMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
      metalness: 0.1,
      transparent: true,
      opacity: 0.35,
    });
    const ceilSlabMesh = new THREE.Mesh(ceilSlabGeo, ceilSlabMat);
    ceilSlabMesh.position.set(centerW / 2, ceilDepth / 2, -0.018);
    ceilSlabMesh.userData = { surfaceId: 'ceiling' };
    ceilingHinge.add(ceilSlabMesh);
    clickableMeshesRef.current.push(ceilSlabMesh);

    const ceilEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(ceilSlabGeo),
      new THREE.LineBasicMaterial({ color: 0x38bdf8 })
    );
    ceilSlabMesh.add(ceilEdges);

    const ceilLabel = createTextLabelSprite(
      'Strop',
      `${centerW.toFixed(2)}m × ${ceilDepth.toFixed(2)}m`,
      '#0F172A',
      '#475569'
    );
    ceilLabel.scale.set(0.85, 0.28, 1);
    ceilLabel.position.set(centerW / 2, ceilDepth + 0.18, 0.02);
    ceilingHinge.add(ceilLabel);

    const ceilingNodes = nodes.filter((n) => n.surface === 'ceiling');
    for (const n of ceilingNodes) {
      if (activeCircuitFilter !== 'all' && n.circuitId !== activeCircuitFilter) {
        continue;
      }
      const cir = circuits.find((c) => c.id === n.circuitId);
      const cColor = cir?.color || '#A855F7';
      const nodeGroup = buildProceduralNodeMesh(
        n,
        cColor,
        n.id === selectedNodeId,
        room.height,
        0
      );
      nodeGroup.position.set(n.x, n.y, 0.02);
      ceilingHinge.add(nodeGroup);
      clickableMeshesRef.current.push(nodeGroup);
    }

    const ceilingSegments = segments.filter((s) => s.surface === 'ceiling');
    for (const seg of ceilingSegments) {
      if (activeCircuitFilter !== 'all' && seg.circuitId !== activeCircuitFilter) {
        continue;
      }
      const cir = circuits.find((c) => c.id === seg.circuitId);
      const baseColor = cir?.color || '#A855F7';

      if (!showWireConductors) {
        const pts3D = seg.points.map(
          (p) => new THREE.Vector3(p.x, p.y, 0.014)
        );
        if (pts3D.length >= 2) {
          const path = new THREE.CurvePath<THREE.Vector3>();
          for (let i = 1; i < pts3D.length; i++) {
            path.add(new THREE.LineCurve3(pts3D[i - 1], pts3D[i]));
          }
          const radius = (seg.conduitDiameterMm / 1000) * 0.55;
          const tubeGeo = new THREE.TubeGeometry(
            path,
            pts3D.length * 6,
            radius,
            8,
            false
          );
          const tubeMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(baseColor),
            roughness: 0.35,
            metalness: 0.25,
          });
          ceilingHinge.add(new THREE.Mesh(tubeGeo, tubeMat));
        }
      } else {
        const count = seg.conductors.length;
        seg.conductors.forEach((cond, idx) => {
          const offset = (idx - (count - 1) / 2) * 0.016;
          const condColor = CONDUCTOR_META[cond]?.colorHex || '#F8FAFC';
          const pts3D = seg.points.map(
            (p) => new THREE.Vector3(p.x + offset, p.y + offset * 0.5, 0.018)
          );
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts3D);
          const lineMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(condColor),
          });
          ceilingHinge.add(new THREE.Line(lineGeo, lineMat));
        });
      }
    }

    pivotsRef.current = {
      leftHinge,
      rightHinge,
      oppositeHinge,
      ceilingHinge,
      floorMesh,
      ceilingMat: ceilSlabMat,
    };
  }, [
    room,
    openings,
    nodes,
    circuits,
    segments,
    showWireConductors,
    showInstallZones,
    selectedNodeId,
    activeCircuitFilter,
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0B1120]">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};
