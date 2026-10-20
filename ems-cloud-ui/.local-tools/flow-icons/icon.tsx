import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { ReactNode } from "react";

// ── Types (exported so other views can share) ─────────────────────────────────
export type DeviceType = "tower" | "factory" | "pcs" | "solar" | "battery";
export type EnergyMetrics = Record<DeviceType, { value: string; unit: string }>;
const ignoreChange = () => {};
type EditTool = "move" | "connect";

export interface DeviceConfig { id: string; type: DeviceType; pos: [number, number, number]; }
export interface EdgeConfig   { id: string; from: string; to: string; animate?: boolean; }

export const META: Record<DeviceType, { label: string; emoji: string; color: string; labelY: number }> = {
  tower:   { label: "电网", emoji: "⚡", color: "#1f7a68", labelY: 5.0  },
  factory: { label: "负荷", emoji: "🏭", color: "#f97316", labelY: 3.2  },
  pcs:     { label: "PCS",  emoji: "🔌", color: "#2a806e", labelY: 2.65 },
  solar:   { label: "光伏", emoji: "☀️", color: "#f59e0b", labelY: 2.4  },
  battery: { label: "电池", emoji: "🔋", color: "#10b981", labelY: 2.0  },
};

// Legend colors: destination type wins for factory/battery, otherwise source type
export function getEdgeColor(fromType: DeviceType, toType: DeviceType): string {
  if (toType === "factory") return "#f97316"; // 负荷用电
  if (toType === "battery") return "#10b981"; // 储能充放
  return META[fromType].color;               // 电网输入 / 光伏发电 / PCS
}

export const INIT_DEVICES: DeviceConfig[] = [
  { id: "tower",   type: "tower",   pos: [-4.5, 0, -3.2] },
  { id: "factory", type: "factory", pos: [ 4.2, 0, -3.0] },
  { id: "pcs",     type: "pcs",     pos: [ 0,   0,  0  ] },
  { id: "solar",   type: "solar",   pos: [-4.4, 0,  3.0] },
  { id: "battery", type: "battery", pos: [ 4.0, 0,  2.8] },
];

export const INIT_EDGES: EdgeConfig[] = [
  { id: "e1", from: "tower",   to: "pcs"     },
  { id: "e2", from: "solar",   to: "pcs"     },
  { id: "e3", from: "pcs",     to: "factory" },
  { id: "e4", from: "pcs",     to: "battery" },
];

// ── Geometry helpers ──────────────────────────────────────────────────────────
function Beam({
  a, b, r = 0.022, color = "#8fa5b8", metalness = 0.5, roughness = 0.4,
}: { a: THREE.Vector3; b: THREE.Vector3; r?: number; color?: string; metalness?: number; roughness?: number }) {
  const { mid, len, q } = useMemo(() => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const mid = a.clone().lerp(b, 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { mid, len, q };
  }, [a.x, a.y, a.z, b.x, b.y, b.z]);
  return (
    <mesh position={mid} quaternion={q}>
      <cylinderGeometry args={[r, r, len, 4]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── TRANSMISSION TOWER ────────────────────────────────────────────────────────
function TransmissionTower() {
  const HEIGHT_LEVELS = [0, 0.48, 0.96, 1.44, 1.92, 2.48, 3.04, 3.55];
  const BASE_R = 0.92, TOP_R = 0.12;
  const legR = (y: number) => y <= 2.48 ? THREE.MathUtils.lerp(BASE_R, TOP_R, y / 2.48) : TOP_R;
  const LP = (h: number, leg: number) => {
    const r = legR(h);
    const a = [Math.PI/4, -Math.PI/4, -3*Math.PI/4, 3*Math.PI/4][leg];
    return V(r * Math.cos(a), h, r * Math.sin(a));
  };
  const elements = useMemo(() => {
    const out: { a: THREE.Vector3; b: THREE.Vector3; r: number; color: string }[] = [];
    for (let i = 0; i < HEIGHT_LEVELS.length - 1; i++) {
      const y0 = HEIGHT_LEVELS[i], y1 = HEIGHT_LEVELS[i + 1];
      const thick = 0.040 * (1 - i * 0.055);
      for (let leg = 0; leg < 4; leg++) out.push({ a: LP(y0, leg), b: LP(y1, leg), r: thick, color: "#8fa5b8" });
      for (let leg = 0; leg < 4; leg++) out.push({ a: LP(y0, leg), b: LP(y0, (leg + 1) % 4), r: 0.017, color: "#7a9ab5" });
      for (let face = 0; face < 4; face++) {
        out.push({ a: LP(y0, face), b: LP(y1, (face + 1) % 4), r: 0.012, color: "#6e92ab" });
        out.push({ a: LP(y0, (face + 1) % 4), b: LP(y1, face), r: 0.012, color: "#6e92ab" });
      }
    }
    for (let leg = 0; leg < 4; leg++) out.push({ a: LP(3.55, leg), b: LP(3.55, (leg + 1) % 4), r: 0.017, color: "#7a9ab5" });
    return out;
  }, []);
  const ARM_HEIGHTS = [3.82, 3.52], ARM_SPANS = [2.10, 1.55];
  return (
    <group>
      {elements.map((el, i) => <Beam key={i} {...el} />)}
      <mesh position={[0, 4.05, 0]}><cylinderGeometry args={[0.030, 0.052, 1.0, 6]} /><meshStandardMaterial color="#8fa5b8" metalness={0.5} roughness={0.35} /></mesh>
      {ARM_HEIGHTS.map((armY, ai) => (
        <group key={ai}>
          <mesh position={[0, armY, 0]}><boxGeometry args={[ARM_SPANS[ai], 0.038, 0.038]} /><meshStandardMaterial color="#8fa5b8" metalness={0.5} roughness={0.35} /></mesh>
          <mesh position={[0, armY - 0.025, -0.18]}><boxGeometry args={[ARM_SPANS[ai] * 0.7, 0.025, 0.025]} /><meshStandardMaterial color="#7a9ab5" metalness={0.5} roughness={0.4} /></mesh>
          {([-1, 1]).map(sx => <Beam key={sx} a={V(0, armY - 0.45, 0)} b={V(sx * ARM_SPANS[ai] * 0.5, armY, 0)} r={0.014} color="#7a9ab5" />)}
          {([-1, 1]).map(sx => [0, 1, 2, 3].map(ball => (
            <mesh key={`${sx}-${ball}`} position={[sx * ARM_SPANS[ai] * 0.5, armY - 0.09 - ball * 0.095, 0]}>
              <sphereGeometry args={[0.034, 8, 6]} /><meshStandardMaterial color="#dde5f0" roughness={0.8} />
            </mesh>
          )))}
        </group>
      ))}
      <mesh position={[0, 4.65, 0]}><coneGeometry args={[0.022, 0.30, 4]} /><meshStandardMaterial color="#61716b" metalness={0.75} roughness={0.2} /></mesh>
      <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.055, 0.07, 0.16, 8]} /><meshStandardMaterial color="#7a9ab5" metalness={0.55} roughness={0.45} /></mesh>
    </group>
  );
}

// ── FACTORY ───────────────────────────────────────────────────────────────────
function Factory() {
  const MW = 2.6, MH = 1.5, MD = 1.9, OW = 1.05, OH = 1.15, OD = 1.5;
  const offX = -(MW + OW) / 2;
  const mainRoofGeo = useMemo(() => new THREE.ExtrudeGeometry(
    new THREE.Shape([new THREE.Vector2(-MW/2 - 0.22, 0), new THREE.Vector2(0, 0.88), new THREE.Vector2(MW/2 + 0.22, 0)]),
    { depth: MD + 0.30, bevelEnabled: false },
  ), []);
  const officeRoofGeo = useMemo(() => new THREE.ExtrudeGeometry(
    new THREE.Shape([new THREE.Vector2(-OW/2 - 0.12, 0), new THREE.Vector2(0, 0.58), new THREE.Vector2(OW/2 + 0.12, 0)]),
    { depth: OD + 0.18, bevelEnabled: false },
  ), []);
  const wall  = <meshStandardMaterial color="#eef2f7" roughness={0.88} />;
  const roof  = <meshStandardMaterial color="#d8e0eb" roughness={0.82} />;
  const glass = <meshPhysicalMaterial color="#b8d4f0" roughness={0.06} transmission={0.55} thickness={0.35} />;
  const frame = <meshStandardMaterial color="#b8c8d8" roughness={0.75} metalness={0.1} />;
  const slab  = <meshStandardMaterial color="#c8d5e0" roughness={0.94} />;
  const metal = <meshStandardMaterial color="#76857f" roughness={0.5} metalness={0.4} />;
  return (
    <group>
      <mesh position={[0, 0.04, 0]}><boxGeometry args={[MW + OW + 0.14, 0.08, MD + 0.14]} />{slab}</mesh>
      <mesh position={[OW*0.3, MH/2 + 0.08, 0]}><boxGeometry args={[MW, MH, MD]} />{wall}</mesh>
      <mesh geometry={mainRoofGeo} position={[OW*0.3, MH + 0.08, -(MD + 0.30) / 2]}>{roof}</mesh>
      {([[1,1],[1,-1],[-1,1],[-1,-1]] as [number,number][]).map(([sx, sz], i) => (
        <mesh key={i} position={[OW*0.3 + sx*(MW/2 - 0.01), MH/2 + 0.08, sz*(MD/2 - 0.01)]}>
          <boxGeometry args={[0.085, MH + 0.06, 0.085]} />{frame}
        </mesh>
      ))}
      {([-0.85, 0.85]).map((dx, i) => (
        <group key={i} position={[OW*0.3 + dx, MH*0.56 + 0.08, MD/2 + 0.005]}>
          <mesh><boxGeometry args={[0.50, 0.60, 0.042]} />{frame}</mesh>
          <mesh position={[0, 0, 0.026]}><boxGeometry args={[0.40, 0.50, 0.018]} />{glass}</mesh>
          <mesh position={[0, 0, 0.038]}><boxGeometry args={[0.018, 0.50, 0.010]} />{frame}</mesh>
          <mesh position={[0, 0.08, 0.038]}><boxGeometry args={[0.40, 0.014, 0.010]} />{frame}</mesh>
          <mesh position={[0, -0.32, 0.025]}><boxGeometry args={[0.56, 0.032, 0.08]} />{slab}</mesh>
        </group>
      ))}
      <group position={[OW*0.3 - 0.04, 0.46 + 0.08, MD/2 + 0.005]}>
        <mesh><boxGeometry args={[0.48, 0.88, 0.042]} />{frame}</mesh>
        {([-0.11, 0.11]).map((dx, i) => <mesh key={i} position={[dx, 0, 0.026]}><boxGeometry args={[0.19, 0.78, 0.016]} />{glass}</mesh>)}
        {([-0.05, 0.05]).map((dx, i) => <mesh key={i} position={[dx, -0.04, 0.04]}><boxGeometry args={[0.010, 0.22, 0.020]} />{metal}</mesh>)}
      </group>
      <mesh position={[OW*0.3 - 0.04, MH*0.72 + 0.08, MD/2 + 0.24]}><boxGeometry args={[0.82, 0.040, 0.52]} />{slab}</mesh>
      <group position={[OW*0.3 + 0.6, 0.58 + 0.08, -MD/2 - 0.005]}>
        <mesh><boxGeometry args={[0.78, 1.12, 0.036]} />{frame}</mesh>
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[0, 0.44 - i * 0.115, 0.025]}><boxGeometry args={[0.74, 0.026, 0.018]} /><meshStandardMaterial color="#76857f" roughness={0.55} metalness={0.2} /></mesh>)}
      </group>
      <mesh position={[offX + OW/2, OH/2 + 0.08, (MD - OD)/2]}><boxGeometry args={[OW, OH, OD]} />{wall}</mesh>
      <mesh geometry={officeRoofGeo} position={[offX + OW/2, OH + 0.08, (MD - OD)/2 - (OD + 0.18) / 2]}>{roof}</mesh>
      {([OH*0.62, OH*0.38]).map((y, i) => <mesh key={i} position={[offX + OW/2, y + 0.08, (MD - OD)/2 + OD/2 + 0.005]}><boxGeometry args={[0.32, 0.24, 0.036]} />{glass}</mesh>)}
      <mesh position={[OW*0.3 - 0.55, MH + 0.08 + 0.58, -0.35]}><boxGeometry args={[0.60, 0.24, 0.52]} /><meshStandardMaterial color="#d0dae6" roughness={0.78} metalness={0.1} /></mesh>
      <mesh position={[OW*0.3 - 0.55, MH + 0.08 + 0.72, -0.35]}><cylinderGeometry args={[0.17, 0.17, 0.04, 16]} />{metal}</mesh>
      {([0.55, 0.80]).map((x, i) => (
        <group key={i} position={[OW*0.3 + x, MH + 0.08 + 0.58, 0.45]}>
          <mesh><cylinderGeometry args={[0.060, 0.070, 0.72, 10]} /><meshStandardMaterial color="#bcc8d4" roughness={0.82} /></mesh>
          <mesh position={[0, 0.40, 0]}><cylinderGeometry args={[0.095, 0.062, 0.085, 10]} />{metal}</mesh>
        </group>
      ))}
    </group>
  );
}

// ── PCS CABINET ───────────────────────────────────────────────────────────────
function PCSCabinet() {
  const glass  = <meshPhysicalMaterial color="#7ab8f0" roughness={0.05} transmission={0.55} thickness={0.3} />;
  const body   = <meshStandardMaterial color="#3d4f60" metalness={0.38} roughness={0.58} />;
  const front  = <meshStandardMaterial color="#2d3d4d" metalness={0.28} roughness={0.68} />;
  const chrome = <meshStandardMaterial color="#90a8bf" metalness={0.82} roughness={0.18} />;
  const dark   = <meshStandardMaterial color="#1a2433" roughness={0.25} metalness={0.45} />;
  function MainSection() {
    return (
      <group position={[-0.30, 0, 0]}>
        <mesh position={[0, 1.16, 0]}><boxGeometry args={[0.56, 2.30, 0.52]} />{body}</mesh>
        {([-1, 1]).map(sx => <mesh key={sx} position={[sx * 0.29, 1.16, 0]}><boxGeometry args={[0.018, 2.28, 0.54]} />{chrome}</mesh>)}
        <mesh position={[0, 1.16, 0.272]}><boxGeometry args={[0.50, 2.18, 0.018]} />{front}</mesh>
        <mesh position={[0, 1.16, 0.283]}><boxGeometry args={[0.003, 2.18, 0.003]} /><meshStandardMaterial color="#111" /></mesh>
        <group position={[0, 1.68, 0.282]}>
          <mesh><boxGeometry args={[0.33, 0.225, 0.014]} />{dark}</mesh>
          <mesh position={[0, 0, 0.01]}><boxGeometry args={[0.28, 0.185, 0.010]} />{glass}</mesh>
        </group>
        {([1.25, 1.05, 0.85]).map((y, i) => (
          <group key={i} position={[0, y, 0.282]}>
            <mesh><boxGeometry args={[0.34, 0.068, 0.014]} />{dark}</mesh>
            <mesh position={[0, 0, 0.010]}><boxGeometry args={[0.30, 0.044, 0.008]} /><meshStandardMaterial color={i===0?"#10b981":"#1f7a68"} emissive={i===0?"#10b981":"#1f7a68"} emissiveIntensity={0.8} toneMapped={false} /></mesh>
          </group>
        ))}
        {([-0.10, 0, 0.10]).map((x, i) => (
          <mesh key={i} position={[x, 0.65, 0.285]}>
            <cylinderGeometry args={[0.026, 0.026, 0.022, 12]} />
            <meshStandardMaterial color={i===0?"#ef4444":i===1?"#10b981":"#f59e0b"} emissive={i===0?"#ef4444":i===1?"#10b981":"#f59e0b"} emissiveIntensity={1.0} toneMapped={false} />
          </mesh>
        ))}
        {Array.from({ length: 10 }, (_, i) => <mesh key={i} position={[0, 2.04 + i * 0.032, 0.274]}><boxGeometry args={[0.46, 0.013, 0.022]} /><meshStandardMaterial color="#0f1a25" roughness={0.4} /></mesh>)}
        <mesh position={[0.19, 1.16, 0.290]}><boxGeometry args={[0.028, 0.17, 0.022]} />{chrome}</mesh>
        <mesh position={[0, 0.048, 0]}><boxGeometry args={[0.60, 0.095, 0.56]} /><meshStandardMaterial color="#1e2d3d" metalness={0.35} roughness={0.6} /></mesh>
        <mesh position={[0, 0.085, 0.275]}><boxGeometry args={[0.32, 0.065, 0.025]} />{chrome}</mesh>
      </group>
    );
  }
  function AuxSection() {
    return (
      <group position={[0.34, 0, 0]}>
        <mesh position={[0, 0.86, 0]}><boxGeometry args={[0.40, 1.70, 0.52]} />{body}</mesh>
        {([-1, 1]).map(sx => <mesh key={sx} position={[sx * 0.21, 0.86, 0]}><boxGeometry args={[0.018, 1.68, 0.54]} />{chrome}</mesh>)}
        <mesh position={[0, 0.86, 0.272]}><boxGeometry args={[0.34, 1.58, 0.018]} />{front}</mesh>
        {([0.5, 0.72, 0.94]).map((y, i) => (
          <group key={i} position={[0, y, 0.281]}>
            <mesh><cylinderGeometry args={[0.060, 0.060, 0.018, 20]} /><meshStandardMaterial color="#0f1a25" roughness={0.15} metalness={0.4} /></mesh>
            <mesh position={[0, 0, 0.012]}><cylinderGeometry args={[0.048, 0.048, 0.008, 20]} /><meshStandardMaterial color="#1e3050" roughness={0.1} /></mesh>
          </group>
        ))}
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[0, 1.38 + i * 0.03, 0.273]}><boxGeometry args={[0.30, 0.012, 0.020]} /><meshStandardMaterial color="#0f1a25" roughness={0.4} /></mesh>)}
        <mesh position={[0, 0.048, 0]}><boxGeometry args={[0.44, 0.095, 0.56]} /><meshStandardMaterial color="#1e2d3d" metalness={0.35} roughness={0.6} /></mesh>
      </group>
    );
  }
  return <group><MainSection /><AuxSection /></group>;
}

// ── SOLAR PANELS ──────────────────────────────────────────────────────────────
function SolarPanels() {
  const COLS = 6, ROWS = 10, CELL_W = 0.155, CELL_H = 0.095, CELL_GAP = 0.008;
  const PW = COLS * (CELL_W + CELL_GAP) - CELL_GAP + 0.055;
  const PH = ROWS * (CELL_H + CELL_GAP) - CELL_GAP + 0.055;
  const cells = useMemo(() => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => [(c-(COLS-1)/2)*(CELL_W+CELL_GAP), (r-(ROWS-1)/2)*(CELL_H+CELL_GAP)] as [number,number])).flat(), []);
  function Panel({ xOff }: { xOff: number }) {
    return (
      <group position={[xOff, 0, 0]}>
        <mesh><boxGeometry args={[PW, PH, 0.042]} /><meshStandardMaterial color="#8fa5b8" metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[0, 0, 0.024]}><boxGeometry args={[PW-0.048, PH-0.048, 0.006]} /><meshStandardMaterial color="#0f2040" roughness={0.2} /></mesh>
        {cells.map(([cx, cy], i) => <mesh key={i} position={[cx, cy, 0.030]}><boxGeometry args={[CELL_W, CELL_H, 0.005]} /><meshStandardMaterial color="#1a3a8a" metalness={0.05} roughness={0.15} /></mesh>)}
        {Array.from({ length: ROWS+1 }, (_, r) => <mesh key={r} position={[0, (r-ROWS/2)*(CELL_H+CELL_GAP)-CELL_GAP/2, 0.035]}><boxGeometry args={[PW-0.048, 0.010, 0.003]} /><meshStandardMaterial color="#b0c8d8" metalness={0.85} roughness={0.15} /></mesh>)}
        {Array.from({ length: COLS+1 }, (_, c) => <mesh key={c} position={[(c-COLS/2)*(CELL_W+CELL_GAP)-CELL_GAP/2, 0, 0.035]}><boxGeometry args={[0.006, PH-0.048, 0.003]} /><meshStandardMaterial color="#b0c8d8" metalness={0.85} roughness={0.15} /></mesh>)}
        <mesh position={[0.06, -PH*0.3, -0.038]}><boxGeometry args={[0.14, 0.09, 0.04]} /><meshStandardMaterial color="#1d2f2a" roughness={0.7} /></mesh>
      </group>
    );
  }
  const SPACING = PW + 0.14;
  return (
    <group>
      <group rotation={[-0.58, 0, 0]} position={[0, 1.35, 0.08]}>
        <Panel xOff={-SPACING/2} /><Panel xOff={SPACING/2} />
      </group>
      <mesh position={[0, 0.95, 0.28]} rotation={[-0.58, 0, 0]}><boxGeometry args={[SPACING+PW+0.12, 0.048, 0.048]} /><meshStandardMaterial color="#6a8fa8" metalness={0.65} roughness={0.35} /></mesh>
      {([-SPACING/2, 0, SPACING/2]).map((x, i) => (
        <group key={i} position={[x, 0.50, -0.15]}>
          <mesh><boxGeometry args={[0.050, 1.02, 0.050]} /><meshStandardMaterial color="#6a8fa8" metalness={0.65} roughness={0.35} /></mesh>
          <Beam a={V(0,0.30,0)} b={V(0,0.45,0.55)} r={0.022} color="#5a7f9a" />
          <mesh position={[0, -0.54, 0]}><boxGeometry args={[0.155, 0.040, 0.155]} /><meshStandardMaterial color="#5a7080" metalness={0.5} roughness={0.5} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.50, -0.08]} rotation={[0, 0, Math.PI/2]}><cylinderGeometry args={[0.022, 0.022, SPACING+PW+0.08, 8]} /><meshStandardMaterial color="#2d3d4d" roughness={0.6} metalness={0.3} /></mesh>
    </group>
  );
}

// ── BATTERY CONTAINERS ────────────────────────────────────────────────────────
function BatteryContainers() {
  const CW = 1.08, CH = 0.80, CD = 2.20;
  function CorruWall({ w, h, ribs = 20 }: { w: number; h: number; ribs?: number }) {
    return (
      <group>
        <mesh><boxGeometry args={[w, h, 0.030]} /><meshStandardMaterial color="#d4e0ec" metalness={0.18} roughness={0.70} /></mesh>
        {Array.from({ length: ribs }, (_, i) => (
          <mesh key={i} position={[((i+0.5)/ribs-0.5)*w, 0, 0.022]}>
            <boxGeometry args={[w/ribs*0.55, h-0.035, 0.026]} />
            <meshStandardMaterial color={i%2===0?"#c2d2e2":"#c8daec"} metalness={0.15} roughness={0.72} />
          </mesh>
        ))}
      </group>
    );
  }
  function Container({ pos }: { pos: [number, number, number] }) {
    const yC = CH/2 + 0.05;
    return (
      <group position={pos}>
        <group position={[0, yC, CD/2]}><CorruWall w={CW} h={CH} ribs={14} /></group>
        <group position={[0, yC, -CD/2]} rotation={[0, Math.PI, 0]}><CorruWall w={CW} h={CH} ribs={14} /></group>
        <group position={[CW/2, yC, 0]} rotation={[0, Math.PI/2, 0]}>
          <CorruWall w={CD} h={CH} ribs={22} />
          {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[0, -0.14+i*0.08, 0.035]}><boxGeometry args={[CD-0.10, 0.022, 0.016]} /><meshStandardMaterial color="#7a9ab5" metalness={0.4} roughness={0.5} /></mesh>)}
        </group>
        <group position={[-CW/2, yC, 0]} rotation={[0, -Math.PI/2, 0]}>
          <CorruWall w={CD} h={CH} ribs={22} />
          {([-0.5, 0.5]).map((x, di) => (
            <group key={di} position={[x*CD/2*0.9, 0, 0.028]}>
              <mesh><boxGeometry args={[CD/2-0.065, CH-0.08, 0.020]} /><meshStandardMaterial color="#c0d0e0" metalness={0.15} roughness={0.68} /></mesh>
              <mesh position={[di===0?(CD/4-0.03):-(CD/4-0.03), 0, 0.016]}><boxGeometry args={[0.022, CH-0.08, 0.018]} /><meshStandardMaterial color="#7a9ab5" metalness={0.7} roughness={0.3} /></mesh>
            </group>
          ))}
          <mesh position={[0, 0, 0.042]}><boxGeometry args={[0.022, CH-0.08, 0.022]} /><meshStandardMaterial color="#61716b" metalness={0.75} roughness={0.22} /></mesh>
        </group>
        <mesh position={[0, CH+0.05+0.020, 0]}><boxGeometry args={[CW+0.040, 0.035, CD+0.040]} /><meshStandardMaterial color="#bcc8d8" metalness={0.22} roughness={0.68} /></mesh>
        <mesh position={[0, CH+0.05+0.145, -CD/2+0.55]}><boxGeometry args={[CW*0.72, 0.19, 0.45]} /><meshStandardMaterial color="#d4e0ec" metalness={0.15} roughness={0.72} /></mesh>
        <mesh position={[0, CH+0.05+0.255, -CD/2+0.55]}><cylinderGeometry args={[CW*0.22, CW*0.22, 0.028, 16]} /><meshStandardMaterial color="#8fa5b8" metalness={0.45} roughness={0.45} /></mesh>
        {([[1,1],[1,-1],[-1,1],[-1,-1]] as [number,number][]).map(([sx,sz], i) => (
          <group key={i} position={[sx*(CW/2+0.012), yC, sz*(CD/2+0.012)]}>
            <mesh><boxGeometry args={[0.062, CH+0.02, 0.062]} /><meshStandardMaterial color="#8fa5b8" metalness={0.62} roughness={0.32} /></mesh>
            <mesh position={[0, (CH+0.02)/2+0.026, 0]}><boxGeometry args={[0.075, 0.050, 0.075]} /><meshStandardMaterial color="#7a9ab5" metalness={0.65} roughness={0.28} /></mesh>
            <mesh position={[0, -(CH+0.02)/2-0.026, 0]}><boxGeometry args={[0.075, 0.050, 0.075]} /><meshStandardMaterial color="#7a9ab5" metalness={0.65} roughness={0.28} /></mesh>
          </group>
        ))}
        <mesh position={[0, CH+0.046, CD/2+0.038]}><boxGeometry args={[CW*0.58, 0.028, 0.014]} /><meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2.0} toneMapped={false} /></mesh>
        {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[-CW/2+0.09+i*0.21, 0.058, CD/2+0.032]}><boxGeometry args={[0.1, 0.055, 0.008]} /><meshStandardMaterial color={i%2===0?"#f59e0b":"#111827"} /></mesh>)}
      </group>
    );
  }
  return (
    <group>
      <Container pos={[-CW/2-0.055, 0, 0]} />
      <Container pos={[ CW/2+0.055, 0, 0]} />
      <mesh position={[0, 0.028, 0]}><boxGeometry args={[CW*2+0.38, 0.055, CD+0.24]} /><meshStandardMaterial color="#d0dce8" roughness={0.94} /></mesh>
      <mesh position={[0, 0.84, CD/2+0.042]}><boxGeometry args={[CW*2+0.08, 0.042, 0.062]} /><meshStandardMaterial color="#8fa5b8" metalness={0.55} roughness={0.38} /></mesh>
    </group>
  );
}

// ── Device model dispatcher ───────────────────────────────────────────────────
function DeviceModel({ type }: { type: DeviceType }) {
  switch (type) {
    case "tower":   return <TransmissionTower />;
    case "factory": return <Factory />;
    case "pcs":     return <PCSCabinet />;
    case "solar":   return <SolarPanels />;
    case "battery": return <BatteryContainers />;
  }
}

// ── Flow ──────────────────────────────────────────────────────────────────────

import {createRoot} from 'react-dom/client';
import {Bounds,Center,ContactShadows} from '@react-three/drei';
function Ready(){let count=0;useFrame(()=>{count++;if(count>12)(window as any).__iconReady=true});return null}
const type=new URLSearchParams(location.search).get('type') as DeviceType;
createRoot(document.getElementById('root')!).render(<Canvas orthographic camera={{position:[7,5,7],zoom:55}} gl={{alpha:true,antialias:true,preserveDrawingBuffer:true}}><ambientLight intensity={1.5}/><directionalLight position={[5,9,5]} intensity={2}/><directionalLight position={[-4,4,-3]} intensity={1}/><Bounds fit clip observe margin={1.18}><Center><DeviceModel type={type}/></Center></Bounds><Ready/></Canvas>);
