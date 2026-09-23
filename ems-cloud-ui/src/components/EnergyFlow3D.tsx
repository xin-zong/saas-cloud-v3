import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { Station } from "@/App";

// ── Types (exported so other views can share) ─────────────────────────────────
export type DeviceType = "tower" | "factory" | "pcs" | "solar" | "battery";
type EditTool = "move" | "connect";

export interface DeviceConfig { id: string; type: DeviceType; pos: [number, number, number]; }
export interface EdgeConfig   { id: string; from: string; to: string; }

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
function FlowParticles({ curve, color, count = 7, speed = 0.13 }: {
  curve: THREE.CatmullRomCurve3; color: string; count?: number; speed?: number;
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      if (!m) return;
      const t = ((clock.elapsedTime * speed) + i / count) % 1;
      m.position.copy(curve.getPoint(t));
      m.scale.setScalar(0.3 + Math.sin(t * Math.PI) * 0.7);
    });
  });
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <sphereGeometry args={[0.060, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function EnergyTube({ from, to, color, animate = true }: {
  from: THREE.Vector3; to: THREE.Vector3; color: string; animate?: boolean;
}) {
  const { curve, geo, arrowPos, arrowQuat } = useMemo(() => {
    const mid = V((from.x+to.x)/2, (from.y+to.y)/2 + 0.55, (from.z+to.z)/2);
    const curve = new THREE.CatmullRomCurve3([from.clone(), mid, to.clone()]);
    const geo = new THREE.TubeGeometry(curve, 24, 0.036, 7, false);
    // Arrow at 60% along the tube, oriented along the tangent
    const arrowPos = curve.getPoint(0.6);
    const tangent = curve.getTangent(0.6).normalize();
    const arrowQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    return { curve, geo, arrowPos, arrowQuat };
  }, [from.x, from.y, from.z, to.x, to.y, to.z]);
  return (
    <group>
      <mesh geometry={geo}><meshStandardMaterial color={color} transparent opacity={0.32} /></mesh>
      {/* Direction arrow */}
      <mesh position={arrowPos} quaternion={arrowQuat}>
        <coneGeometry args={[0.11, 0.26, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} transparent opacity={0.88} />
      </mesh>
      {animate && <FlowParticles curve={curve} color={color} />}
    </group>
  );
}

// Pulsing pending line for connect mode
function PendingLine({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.45, 0));
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    return new THREE.TubeGeometry(curve, 12, 0.030, 6, false);
  }, [from.x, from.y, from.z, to.x, to.y, to.z]);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 5) * 0.25;
  });
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial ref={matRef} color="#fff" transparent opacity={0.55} />
    </mesh>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────
interface SceneProps {
  station: Station;
  devices: DeviceConfig[];
  edges: EdgeConfig[];
  editMode: boolean;
  editTool: EditTool;
  selected: string | null;
  pendingFrom: string | null;
  draggingId: string | null;
  mousePos3D: THREE.Vector3;
  onDevicePointerDown: (id: string) => void;
  onDeviceClick: (id: string) => void;
  onEdgeClick: (id: string) => void;
  onEdgeDelete: (id: string) => void;
  onDragMove: (p: THREE.Vector3) => void;
  onDragEnd: () => void;
  onGroundMove: (p: THREE.Vector3) => void;
}

function EnergyScene(p: SceneProps) {
  const { station, devices, edges, editMode, editTool, selected, pendingFrom, draggingId, mousePos3D } = p;

  const getInfo = (type: DeviceType) => {
    const socCol = station.soc >= 60 ? "#10b981" : station.soc >= 30 ? "#f97316" : "#ef4444";
    const loadMW = Math.max(0, station.activePower / 1000);
    const gridMW = Math.max(0, loadMW - station.pvOutput - station.generator);
    const pcsMW = Math.max(0, station.storageCapacity * station.soc / 100);
    switch (type) {
      case "tower":   return { value: gridMW.toFixed(2), unit: "MW",  color: META.tower.color };
      case "factory": return { value: loadMW.toFixed(2), unit: "MW",  color: META.factory.color };
      case "pcs":     return { value: pcsMW.toFixed(2),  unit: "MW",  color: META.pcs.color };
      case "solar":   return { value: Math.max(0, station.pvOutput).toFixed(2), unit: "MWp", color: META.solar.color };
      case "battery": return { value: Math.max(0, station.storageCapacity).toFixed(2), unit: "MWh", color: socCol };
    }
  };

  const devicePos = (id: string) => {
    const d = devices.find(x => x.id === id);
    return d ? V(d.pos[0], 0.16, d.pos[2]) : V(0, 0.16, 0);
  };

  function Ring({ pos, color }: { pos: [number,number,number]; color: string }) {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(({ clock }) => {
      if (!ref.current) return;
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.06;
      ref.current.scale.set(s, 1, s);
      (ref.current.material as THREE.MeshStandardMaterial).opacity = 0.3 + Math.sin(clock.elapsedTime * 3) * 0.1;
    });
    return (
      <mesh ref={ref} position={[pos[0], 0, pos[2]]} rotation={[-Math.PI/2, 0, 0]}>
        <ringGeometry args={[1.2, 1.5, 36]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    );
  }

  const pendingDevice = pendingFrom ? devices.find(d => d.id === pendingFrom) : null;

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[-6, 12, 6]} intensity={1.7} color="#fff5ee" />
      <directionalLight position={[ 5,  8, -4]} intensity={0.55} color="#ddeeff" />
      <hemisphereLight args={["#e8f0ff", "#f4f8f5", 0.45]} />

      {/* Visible ground */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[28, 18]} />
        <meshStandardMaterial color="#f0f4f8" roughness={1.0} />
      </mesh>
      <gridHelper args={[28, 28, "#dde5f0", "#e8eef5"]} position={[0, 0.001, 0]} />

      {/* Large invisible event plane — drag tracking + connect mouse tracking */}
      <mesh
        rotation={[-Math.PI/2, 0, 0]} position={[0, 0.002, 0]} visible={false}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (draggingId) p.onDragMove(e.point);
          if (editMode && editTool === "connect" && pendingFrom) p.onGroundMove(e.point);
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); p.onDragEnd(); }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Energy tubes */}
      {edges.map(edge => {
        const from = devices.find(d => d.id === edge.from);
        const to   = devices.find(d => d.id === edge.to);
        if (!from || !to) return null;
        const color = getEdgeColor(from.type, to.type);
        const fV = V(from.pos[0], 0.16, from.pos[2]);
        const tV = V(to.pos[0],   0.16, to.pos[2]);
        // Midpoint of the arc (matches EnergyTube's arc peak)
        const midV = V((fV.x+tV.x)/2, (fV.y+tV.y)/2 + 0.55, (fV.z+tV.z)/2);
        return (
          <group key={edge.id}>
            <EnergyTube from={fV} to={tV} color={color} animate={!editMode} />

            {/* Delete button — visible in any edit mode tool */}
            {editMode && (
              <Html center position={midV} distanceFactor={9} style={{ pointerEvents: "auto" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); p.onEdgeDelete(edge.id); }}
                  style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "1.5px solid #ef4444",
                    background: "rgba(255,255,255,0.95)",
                    color: "#ef4444", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", lineHeight: "15px", padding: 0,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >×</button>
              </Html>
            )}

            {/* Wider invisible hit area for edge clicks in connect mode */}
            {editMode && editTool === "connect" && (() => {
              const hitCurve = new THREE.CatmullRomCurve3([fV, midV, tV]);
              const hitGeo = new THREE.TubeGeometry(hitCurve, 24, 0.22, 6, false);
              return (
                <mesh geometry={hitGeo} visible={false}
                  onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); p.onEdgeClick(edge.id); }}
                />
              );
            })()}
          </group>
        );
      })}

      {/* Pending connection line */}
      {pendingDevice && editTool === "connect" && (
        <PendingLine from={V(pendingDevice.pos[0], 0.3, pendingDevice.pos[2])} to={mousePos3D} />
      )}

      {/* Devices */}
      {devices.map(dev => {
        const meta = META[dev.type];
        const info = getInfo(dev.type);
        const isSel = selected === dev.id;
        const isPend = pendingFrom === dev.id;
        const isDrag = draggingId === dev.id;
        const ringColor = isPend ? "#fff" : meta.color;

        return (
          <group key={dev.id} position={dev.pos}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (editMode && editTool === "move") { e.stopPropagation(); p.onDevicePointerDown(dev.id); }
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); p.onDeviceClick(dev.id); }}
            onPointerOver={() => { document.body.style.cursor = editMode && editTool === "move" ? "grab" : "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = "default"; }}
          >
            {(isSel || isPend) && <Ring pos={dev.pos} color={ringColor} />}

            {/* Edit mode ground indicator */}
            {editMode && (
              <mesh position={[0, 0.005, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <ringGeometry args={[1.1, 1.26, 36]} />
                <meshStandardMaterial color={meta.color} transparent opacity={isDrag ? 0.55 : 0.18} side={THREE.DoubleSide} />
              </mesh>
            )}

            <DeviceModel type={dev.type} />

            <Html center position={[0, meta.labelY, 0]} distanceFactor={9} style={{ pointerEvents: "none" }}>
              <div style={{ textAlign: "center", whiteSpace: "nowrap", fontFamily: "Inter, sans-serif" }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{meta.emoji}</div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#24423b",
                  background: (isSel||isPend) ? `${meta.color}22` : "rgba(255,255,255,0.94)",
                  padding: "2px 8px", borderRadius: 4, marginBottom: 1,
                  border: `1px solid ${(isSel||isPend) ? meta.color : "#d8e4f0"}`,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                }}>{meta.label}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: info.color, fontFamily: "'JetBrains Mono',monospace" }}>
                  {info.value}<span style={{ fontSize: 9, fontWeight: 400, color: "#76857f", marginLeft: 2 }}>{info.unit}</span>
                </div>
              </div>
            </Html>
          </group>
        );
      })}

      <OrbitControls
        enabled={!draggingId}
        enablePan={false} minDistance={7} maxDistance={26}
        maxPolarAngle={Math.PI/2.15} dampingFactor={0.07} enableDamping target={[0, 0.8, 0]}
      />
    </>
  );
}

// ── Edit overlay (DOM) ────────────────────────────────────────────────────────
function EditOverlay({
  editMode, setEditMode, editTool, setEditTool,
  selected, devices, pendingFrom,
  onDeleteSelected, onAddDevice, onCancelConnect,
}: {
  editMode: boolean; setEditMode: (v: boolean) => void;
  editTool: EditTool; setEditTool: (t: EditTool) => void;
  selected: string | null; devices?: DeviceConfig[]; pendingFrom: string | null;
  onDeleteSelected: () => void; onAddDevice: (t: DeviceType) => void; onCancelConnect: () => void;
}) {
  const base: React.CSSProperties = { fontFamily: "Inter, sans-serif", fontSize: 11 };
  const devList = devices ?? [];
  const selDev = devList.find(d => d.id === selected);
  const pendDev = devList.find(d => d.id === pendingFrom);

  return (
    <>
      {/* Toggle button */}
      <div style={{ position: "absolute", top: 10, left: 12, zIndex: 10 }}>
        <button
          onClick={() => setEditMode(!editMode)}
          style={{
            ...base, fontWeight: 700, padding: "5px 13px", borderRadius: 7, cursor: "pointer",
            border: `1.5px solid ${editMode ? "#2a806e" : "#d1d5db"}`,
            background: editMode ? "#2a806e" : "rgba(255,255,255,0.95)",
            color: editMode ? "#fff" : "#374151",
            boxShadow: "0 1px 6px rgba(0,0,0,0.10)",
          }}
        >
          {editMode ? "✓ 编辑模式" : "✏ 编辑布局"}
        </button>
      </div>

      {editMode && (
        <div style={{
          position: "absolute", top: 44, left: 12,
          background: "rgba(255,255,255,0.97)", border: "1px solid #d8e3dc",
          borderRadius: 10, padding: "10px 12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
          display: "flex", flexDirection: "column", gap: 8,
          zIndex: 20, fontFamily: "Inter, sans-serif", width: 152,
          maxHeight: "calc(100% - 56px)", overflowY: "auto",
        }}>

          {/* Tool selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 9, color: "#76857f", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>工具</span>
            {([
              { id: "move"    as EditTool, icon: "✥", label: "移动设备" },
              { id: "connect" as EditTool, icon: "⟷", label: "连线" },
            ]).map(tool => (
              <button key={tool.id} onClick={() => setEditTool(tool.id)}
                style={{
                  ...base, fontWeight: 600, padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                  textAlign: "left",
                  border: `1.5px solid ${editTool === tool.id ? "#2a806e" : "#d8e3dc"}`,
                  background: editTool === tool.id ? "#ede9fe" : "#f4f8f5",
                  color: editTool === tool.id ? "#2a806e" : "#465b53",
                }}
              >
                {tool.icon} {tool.label}
              </button>
            ))}
          </div>

          {/* Status hint */}
          <div style={{ fontSize: 9, color: "#61716b", lineHeight: 1.5, borderTop: "1px solid #e8f0eb", paddingTop: 6 }}>
            {editTool === "move" && !selected && "拖拽设备移动 · 点击选中后删除"}
            {editTool === "move" && selDev  && `已选中 ${META[selDev.type].emoji} ${META[selDev.type].label}`}
            {editTool === "connect" && !pendingFrom && "点起点 → 点终点 创建连线"}
            {editTool === "connect" && pendDev && `${META[pendDev.type].emoji} 为起点，点终点`}
          </div>

          {/* Delete / Cancel */}
          {selDev && editTool === "move" && (
            <button onClick={onDeleteSelected}
              style={{
                ...base, fontWeight: 700, padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                border: "1.5px solid #fca5a5", background: "#fff1f2", color: "#ef4444", textAlign: "left",
              }}
            >
              🗑 删除 {META[selDev.type].label}
            </button>
          )}
          {pendingFrom && editTool === "connect" && (
            <button onClick={onCancelConnect}
              style={{
                ...base, fontWeight: 600, padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                border: "1.5px solid #d8e3dc", background: "#f4f8f5", color: "#465b53", textAlign: "left",
              }}
            >
              ✕ 取消连线
            </button>
          )}

          {/* Add device */}
          <div style={{ borderTop: "1px solid #e8f0eb", paddingTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 9, color: "#76857f", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>添加设备</span>
            {(Object.entries(META) as [DeviceType, typeof META[DeviceType]][]).map(([type, meta]) => (
              <button key={type} onClick={() => onAddDevice(type)}
                style={{
                  ...base, fontWeight: 600, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                  textAlign: "left",
                  border: `1.5px solid ${meta.color}44`,
                  background: `${meta.color}0f`, color: meta.color,
                }}
              >
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function EnergyFlow3D({
  station,
  devices,
  edges,
  onEdgesChange,
  onDevicesChange,
  editable = false,
}: {
  station: Station;
  devices?: DeviceConfig[];
  edges?: EdgeConfig[];
  onEdgesChange: (e: EdgeConfig[]) => void;
  onDevicesChange: (d: DeviceConfig[]) => void;
  editable?: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<EditTool>("move");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mousePos3D, setMousePos3D] = useState(() => new THREE.Vector3());

  const safeDevices = devices ?? INIT_DEVICES;
  const safeEdges   = edges   ?? INIT_EDGES;

  // Stable refs so callbacks always see latest values without re-creating
  const devicesRef = useRef(safeDevices);
  devicesRef.current = safeDevices;
  const edgesRef = useRef(safeEdges);
  edgesRef.current = safeEdges;

  // Track whether a pointer-down actually moved (to distinguish drag vs click)
  const dragMoved = useRef(false);

  const handleDevicePointerDown = useCallback((id: string) => {
    setDraggingId(id);
    dragMoved.current = false;
  }, []);

  const handleDragMove = useCallback((point: THREE.Vector3) => {
    dragMoved.current = true;
    onDevicesChange(devicesRef.current.map(d =>
      d.id === draggingId ? { ...d, pos: [point.x, 0, point.z] as [number,number,number] } : d
    ));
  }, [draggingId, onDevicesChange]);

  const handleDragEnd = useCallback(() => { setDraggingId(null); }, []);

  const handleDeviceClick = useCallback((id: string) => {
    const moved = dragMoved.current;
    dragMoved.current = false;
    if (editTool === "move" && moved) return;
    if (editTool === "move") {
      setSelected(prev => prev === id ? null : id);
    } else if (editTool === "connect") {
      if (!pendingFrom) {
        setPendingFrom(id);
      } else if (pendingFrom === id) {
        setPendingFrom(null);
      } else {
        const cur = edgesRef.current;
        const existing = cur.find(e =>
          (e.from === pendingFrom && e.to === id) || (e.from === id && e.to === pendingFrom),
        );
        onEdgesChange(existing
          ? cur.filter(e => e.id !== existing.id)
          : [...cur, { id: `e${Date.now()}`, from: pendingFrom, to: id }]
        );
        setPendingFrom(null);
      }
    }
  }, [editTool, pendingFrom, onEdgesChange]);

  const handleEdgeClick = useCallback((edgeId: string) => {
    onEdgesChange(edgesRef.current.map(e =>
      e.id === edgeId ? { ...e, from: e.to, to: e.from } : e,
    ));
  }, [onEdgesChange]);

  const handleDeleteSelected = useCallback(() => {
    if (!selected) return;
    onDevicesChange(devicesRef.current.filter(d => d.id !== selected));
    onEdgesChange(edgesRef.current.filter(e => e.from !== selected && e.to !== selected));
    setSelected(null);
  }, [selected, onDevicesChange, onEdgesChange]);

  const handleAddDevice = useCallback((type: DeviceType) => {
    const id = `${type}_${Date.now()}`;
    const angle = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 2;
    onDevicesChange([...devicesRef.current, { id, type, pos: [Math.cos(angle)*r, 0, Math.sin(angle)*r] }]);
  }, [onDevicesChange]);

  const handleSetEditMode = useCallback((v: boolean) => {
    setEditMode(v);
    if (!v) { setSelected(null); setPendingFrom(null); setDraggingId(null); setEditTool("move"); }
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#f0f4f8", borderRadius: 10, overflow: "hidden" }}>
      <Canvas
        camera={{ position: [10, 8, 10], fov: 36 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        style={{ width: "100%", height: "100%" }}
        onPointerUp={() => { if (draggingId) setDraggingId(null); }}
      >
        <EnergyScene
          station={station}
          devices={safeDevices} edges={safeEdges}
          editMode={editMode} editTool={editTool}
          selected={selected} pendingFrom={pendingFrom}
          draggingId={draggingId} mousePos3D={mousePos3D}
          onDevicePointerDown={handleDevicePointerDown}
          onDeviceClick={handleDeviceClick}
          onEdgeClick={handleEdgeClick}
          onEdgeDelete={(id) => onEdgesChange(edgesRef.current.filter(e => e.id !== id))}
          onDragMove={handleDragMove} onDragEnd={handleDragEnd}
          onGroundMove={setMousePos3D}
        />
      </Canvas>

      {editable && (
        <EditOverlay
          editMode={editMode} setEditMode={handleSetEditMode}
          editTool={editTool} setEditTool={setEditTool}
          selected={selected} devices={safeDevices} pendingFrom={pendingFrom}
          onDeleteSelected={handleDeleteSelected}
          onAddDevice={handleAddDevice}
          onCancelConnect={() => setPendingFrom(null)}
        />
      )}

      {/* Legend (normal mode only) */}
      {!editMode && (
        <div style={{ position: "absolute", top: 10, right: 12, display: "flex", flexDirection: "column", gap: 4, pointerEvents: "none" }}>
          {[["#1f7a68","电网输入"],["#f59e0b","光伏发电"],["#f97316","负荷用电"],["#10b981","储能充放"]].map(([c,l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 3, borderRadius: 2, background: c, opacity: 0.75 }} />
              <span style={{ fontSize: 9, color: "#61716b", fontFamily: "Inter, sans-serif" }}>{l}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: "#76857f", fontFamily: "Inter, sans-serif", pointerEvents: "none" }}>
        {editMode ? "编辑模式 · 退出后恢复粒子动画" : "拖拽旋转 · 滚轮缩放"}
      </div>
    </div>
  );
}
