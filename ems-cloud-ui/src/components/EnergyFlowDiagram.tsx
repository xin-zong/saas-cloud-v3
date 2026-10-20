import type { StationFlowModel } from "@/data/stationFlow";
import type { Station } from "@/App";
import type { DeviceConfig, EdgeConfig, DeviceType } from "./EnergyFlow3D";

const VB_W = 1063;
const VB_H = 582;
const FLOW_BLUE = "#4285f4";
const FLOW_IDLE = "#e5e7eb";
const INK = "#151b27";

interface Props {
  station: Station;
  /** Supplied even for missing data: bypasses all legacy synthetic power allocations. */
  measured?: StationFlowModel;
  selectedType?: DeviceType;
  onDeviceSelect?: (type:DeviceType)=>void;
  devices?: DeviceConfig[];
  edges?: EdgeConfig[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function powerParts(mw: number) {
  const value = Math.max(0, Math.abs(mw));
  if (value >= 1) return { value: value.toFixed(2), unit: "MW" };
  if (value >= 0.001) {
    const kw = value * 1000;
    return {
      value: kw < 10 && !Number.isInteger(kw) ? kw.toFixed(1) : `${Math.round(kw)}`,
      unit: "kW",
    };
  }
  return { value: `${Math.round(value * 1_000_000)}`, unit: "W" };
}

function formatPower(mw: number) {
  const parts = powerParts(mw);
  return `${parts.value} ${parts.unit}`;
}

function PowerText({
  x,
  y,
  mw,
  metric,
  size = 30,
  unitSize = 17,
  weight = 760,
  anchor = "start",
  fill = INK,
}: {
  x: number;
  y: number;
  mw: number;
  metric?: {value:string;unit:string};
  size?: number;
  unitSize?: number;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  fill?: string;
}) {
  const parts = metric ?? powerParts(mw);
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={fill}>
      <tspan>{parts.value}</tspan>
      <tspan dx="7" fontSize={unitSize} fontWeight="620">
        {parts.unit}
      </tspan>
    </text>
  );
}

function FlowPath({
  id,
  baseD,
  activeD,
  active,
  animate = false,
  width,
}: {
  id: string;
  baseD: string;
  activeD: string;
  active: boolean;
  animate?: boolean;
  width: number;
}) {
  return (
    <g data-flow={id} data-active={active}>
      <path
        d={baseD}
        fill="none"
        stroke={FLOW_IDLE}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={activeD}
        fill="none"
        stroke={FLOW_BLUE}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#flow-arrow)"
        opacity={active ? 1 : 0}
        className="energy-flow-segment"
      />
      {active && animate && <circle r="4" fill={FLOW_BLUE} className="energy-flow-particle">
        <animateMotion key={activeD} path={activeD} dur="2s" repeatCount="indefinite" />
      </circle>}
    </g>
  );
}

function GearIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke="#364152" strokeWidth="2.4">
      <circle r="8.5" />
      <circle r="2.6" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = index * 45;
        return (
          <line
            key={angle}
            x1="0"
            y1="-10.5"
            x2="0"
            y2="-14"
            strokeLinecap="round"
            transform={`rotate(${angle})`}
          />
        );
      })}
    </g>
  );
}

function LightningIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="11" fill="#fff" stroke="#364152" strokeWidth="2.6" />
      <path
        d="M1 -7 L-4 1 H0 L-2 7 L6 -2 H2 Z"
        fill="#364152"
        stroke="#364152"
        strokeLinejoin="round"
      />
    </g>
  );
}

function SunIcon() {
  return (
    <g transform="translate(45 92)">
      <circle r="10.5" fill="#ff9818" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 8;
        return (
          <line
            key={index}
            x1={Math.cos(angle) * 15}
            y1={Math.sin(angle) * 15}
            x2={Math.cos(angle) * 21}
            y2={Math.sin(angle) * 21}
            stroke="#ff9818"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function SolarPanel() {
  return (
    <g transform="translate(397 66)" filter="url(#device-shadow)">
      <ellipse cx="68" cy="99" rx="52" ry="7" fill="#cfd4dc" opacity=".55" />
      <path d="M59 79 V99 M86 67 V91 M51 100 H69 M78 92 H95" fill="none" stroke="#939ca8" strokeWidth="5" />
      <path d="M52 100 H70 M78 92 H96" fill="none" stroke="#d9dde2" strokeWidth="2.3" />
      <polygon points="0,38 67,0 126,56 54,98" fill="#b8c0c9" />
      <polygon points="4,34 66,2 121,54 54,91" fill="#0b2d61" stroke="#eef3f7" strokeWidth="2.2" />
      <g fill="none" stroke="#edf3f8" strokeWidth="1.5" opacity=".95">
        <path d="M17 27 L70 79 M30 20 L84 72 M43 13 L98 66 M56 6 L112 59" />
        <path d="M16 45 L78 13 M29 57 L91 25 M42 69 L104 37 M54 81 L117 49" />
      </g>
      <path d="M54 91 L121 54 V60 L54 99 L4 41 V34 Z" fill="#101827" opacity=".42" />
      <path d="M4 34 L66 2 L121 54 L54 91 Z" fill="none" stroke="#f7fafc" strokeWidth="2" />
    </g>
  );
}

function BatteryStatusIcon({ soc }: { soc: number | null }) {
  const normalized = soc === null ? 0 : clamp(soc, 0, 100);
  const fillWidth = 37 * normalized / 100;
  return (
    <g transform="translate(89 418)">
      <rect width="42" height="23" rx="2.5" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="42" y="7" width="5" height="9" rx="1.5" fill="#cbd5e1" />
      <rect x="2.5" y="2.5" width={fillWidth} height="18" rx="1.5" fill="#19afe2" />
      <path d="M20 6.5 L15 12 H19 L17 17 L24 10.5 H20.5 Z" fill="#fff" />
    </g>
  );
}

function BatteryStack({ soc }: { soc: number | null }) {
  const activeLayers = soc === null ? 0 : Math.max(1, Math.round(clamp(soc, 0, 100) / 20));
  return (
    <g transform="translate(184 377)" filter="url(#device-shadow)">
      <ellipse cx="41" cy="102" rx="43" ry="7" fill="#d6dae0" opacity=".6" />
      {Array.from({ length: 5 }, (_, index) => {
        const y = 65 - index * 16;
        const active = index < activeLayers;
        return (
          <g key={index}>
            <polygon
              points={`5,${y + 10} 40,${y} 76,${y + 10} 40,${y + 23}`}
              fill={active ? "#f4f6f8" : "#fafbfc"}
              stroke="#c3c9d0"
              strokeWidth="1.4"
            />
            <polygon
              points={`5,${y + 10} 40,${y + 23} 40,${y + 36} 5,${y + 23}`}
              fill={active ? "#d6dbe1" : "#eceff2"}
              stroke="#c3c9d0"
              strokeWidth="1.4"
            />
            <polygon
              points={`76,${y + 10} 40,${y + 23} 40,${y + 36} 76,${y + 23}`}
              fill={active ? "#e8ebef" : "#f3f5f7"}
              stroke="#c3c9d0"
              strokeWidth="1.4"
            />
          </g>
        );
      })}
      <path d="M5 17 L40 30 L76 17" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
      <path d="M9 13 L40 4 L72 13" fill="none" stroke="#29b7e4" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function HouseScene() {
  return (
    <g filter="url(#device-shadow)">
      <ellipse cx="452" cy="371" rx="108" ry="11" fill="#d6dae0" opacity=".55" />

      <g fill="none" stroke="#9fdb7c" strokeWidth="3.2" strokeLinecap="round">
        <path d="M359 319 V287 M374 310 V272 M389 304 V259" />
      </g>
      <g fill="#99dc78">
        <circle cx="359" cy="286" r="7" />
        <ellipse cx="374" cy="272" rx="7" ry="11" />
        <ellipse cx="389" cy="258" rx="7" ry="12" />
      </g>

      <g transform="translate(394 247)">
        <polygon points="0,43 69,0 134,58 134,116 0,91" fill="#e4e7eb" stroke="#ccd1d7" strokeWidth="1.5" />
        <polygon points="69,0 156,48 142,70 134,58" fill="#f3f4f6" stroke="#d5d8dc" strokeWidth="1.5" />
        <polygon points="134,58 156,48 156,104 134,116" fill="#e8ebee" stroke="#cfd4d9" strokeWidth="1.5" />
        <polygon points="-12,43 69,-9 144,55 132,65 68,12 2,53" fill="#f4f5f7" stroke="#d7dadd" strokeWidth="1.5" />
        <polygon points="69,-9 162,42 144,55" fill="#eceef1" stroke="#d7dadd" strokeWidth="1.5" />
        <polygon points="2,53 68,12 132,65 132,72 68,21 2,61" fill="#d8dce0" />
        <rect x="17" y="51" width="13" height="25" fill="#7a8b9d" />
        <rect x="17" y="80" width="13" height="22" fill="#a9b4bf" />
        <rect x="81" y="60" width="14" height="25" fill="#71869a" />
        <rect x="81" y="89" width="14" height="21" fill="#a5b1bc" />
        <rect x="109" y="78" width="13" height="29" fill="#bdc5cc" />
        <path d="M0 91 L134 119 L157 105" fill="none" stroke="#1f252c" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <g transform="translate(326 322)">
        <ellipse cx="39" cy="40" rx="41" ry="7" fill="#d1d6dc" opacity=".62" />
        <path
          d="M3 25 C9 16 19 11 30 9 H49 C59 10 69 16 75 26 L78 34 C74 38 67 40 60 40 H16 C9 40 4 37 0 33 Z"
          fill="#f4f5f6"
          stroke="#b8c0c8"
          strokeWidth="1.5"
        />
        <path d="M20 12 H47 C56 13 62 18 67 26 H10 C13 20 16 15 20 12 Z" fill="#161d25" />
        <path d="M39 12 V26 M10 26 H68" fill="none" stroke="#bdc4cb" strokeWidth="1.4" />
        <circle cx="17" cy="36" r="6.5" fill="#161d25" stroke="#f5f6f7" strokeWidth="2" />
        <circle cx="62" cy="36" r="6.5" fill="#161d25" stroke="#f5f6f7" strokeWidth="2" />
      </g>
    </g>
  );
}

function GridTower() {
  return (
    <g transform="translate(640 337)" filter="url(#device-shadow)">
      <ellipse cx="54" cy="143" rx="59" ry="8" fill="#d6dae0" opacity=".55" />
      <path
        d="M54 8 L25 132 M54 8 L84 132 M38 75 H70 M31 102 H77 M44 48 H64"
        fill="none"
        stroke="#869fc6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M54 8 L9 42 M54 8 L100 42 M9 42 H100 M20 42 L4 53 M89 42 L105 53"
        fill="none"
        stroke="#869fc6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M25 132 L54 8 L84 132 M32 103 L76 75 M38 75 L70 103 M43 48 L70 75 M64 48 L38 75" fill="none" stroke="#6f89b2" strokeWidth="2.2" />
      <path d="M13 132 L54 149 L96 132" fill="none" stroke="#20262e" strokeWidth="6" strokeLinecap="square" />
      <circle cx="4" cy="54" r="2.5" fill="#6f89b2" />
      <circle cx="105" cy="54" r="2.5" fill="#6f89b2" />
    </g>
  );
}

export default function EnergyFlowDiagram({ station, measured,selectedType,onDeviceSelect,devices }: Props) {
  if(Boolean(measured))return <MeasuredFlowDiagram station={station} measured={measured!} selectedType={selectedType} onDeviceSelect={onDeviceSelect} devices={devices}/>;
  const displaySoc = measured ? measured.batterySoc : station.soc;
  const loadMw = measured ? (measured.values.loadKw ?? 0) / 1000 : Math.max(0, station.activePower / 1000);
  const pvMw = measured ? (measured.values.mpptKw ?? 0) / 1000 : Math.max(0, station.pvOutput);
  const batteryEnergyMwh = Math.max(0, station.storageCapacity * station.soc / 100);
  const pvToLoadMw = measured ? Math.abs(pvMw) : Math.max(0, Math.min(pvMw, loadMw));
  const pvSurplusMw = Math.max(0, pvMw - loadMw);
  const loadDeficitMw = Math.max(0, loadMw - pvMw);
  const chargeRoomMwh = Math.max(0, station.storageCapacity - batteryEnergyMwh);
  const batteryChargeLimitMw = Math.max(0, Math.min(station.storageCapacity * 0.35, chargeRoomMwh * 0.7));
  const batteryDischargeLimitMw = Math.max(0, Math.min(station.storageCapacity * 0.35, batteryEnergyMwh * 0.35));
  const pvToBatteryMw = measured ? 0 : Math.min(pvSurplusMw, batteryChargeLimitMw);
  const batteryPowerMw = measured ? Math.abs(measured.values.batteryKw ?? 0) / 1000 : Math.min(loadDeficitMw, batteryDischargeLimitMw);
  const gridImportMw = measured ? Math.max(0, measured.values.gridKw ?? 0) / 1000 : Math.max(0, loadDeficitMw - batteryPowerMw);
  const gridExportMw = measured ? Math.max(0, -(measured.values.gridKw ?? 0)) / 1000 : Math.max(0, pvSurplusMw - pvToBatteryMw);
  const batteryDisplayMw = pvToBatteryMw > 0 ? pvToBatteryMw : batteryPowerMw;
  const gridDisplayMw = gridImportMw > 0 ? gridImportMw : gridExportMw;
  const realtimeMw = Math.max(loadMw, pvMw + gridImportMw + batteryPowerMw);
  const auxiliaryLoadMw = measured ? 0 : Math.max(0, Math.min(loadMw, loadMw * 0.08));
  const maxFlowMw = Math.max(0.05, pvToLoadMw, pvToBatteryMw, batteryPowerMw, gridDisplayMw);
  const flowWidth = (mw: number) => Number((3.6 + clamp(mw / maxFlowMw, 0, 1) * 1.4).toFixed(2));
  const statusLabel = station.status === "online" ? "Normal" : station.runStatus || "Normal";
  const statusTone = station.status === "fault" ? "#c02e36" : station.status === "offline" ? "#75848b" : "#12b886";
  const gridActiveD = gridImportMw > 0
    ? "M611 449 H492 Q470 449 470 427 V394"
    : "M470 394 V427 Q470 449 492 449 H611";

  return (
    <div className="energy-flow-diagram">
      <style>{`
        .energy-flow-diagram {
          position: relative;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          background: #fff;
        }
        .energy-flow-diagram svg {
          display: block;
          width: 100%;
          height: 100%;
          max-width: 100%;
          min-width: 0;
        }
        .energy-flow-diagram text {
          font-variant-numeric: tabular-nums;
          letter-spacing: 0;
        }
        .energy-flow-segment {
          transition: stroke-width 180ms ease-out, opacity 180ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .energy-flow-particle { display: none; }
          .energy-flow-segment {
            transition: none;
          }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${station.name} 能源流向图`}
      >
        <title>{`${station.name} 实时能源流向`}</title>
        <defs>
          <filter id="device-shadow" x="-25%" y="-25%" width="150%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#76808d" floodOpacity=".22" />
          </filter>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill={FLOW_BLUE} />
          </marker>
        </defs>

        <rect width={VB_W} height={VB_H} fill="#fff" />

        <FlowPath
          id="pv-battery"
          baseD="M384 127 H247 Q223 127 223 151 V359"
          activeD="M384 127 H247 Q223 127 223 151 V359"
          active={pvToBatteryMw > 0.000001}
          width={flowWidth(pvToBatteryMw)}
        />
        <FlowPath
          id="solar"
          animate={!!measured}
          baseD="M456 168 V240"
          activeD="M456 168 V240"
          active={measured ? measured.solarDirection === "forward" : pvToLoadMw > 0.000001}
          width={flowWidth(pvToLoadMw)}
        />
        <FlowPath
          id="battery"
          animate={!!measured}
          baseD="M299 449 H414 Q441 449 441 422 V394"
          activeD={measured?.batteryDirection === "forward" ? "M441 394 V422 Q441 449 414 449 H299" : "M299 449 H414 Q441 449 441 422 V394"}
          active={measured ? ["forward","reverse"].includes(measured.batteryDirection) : batteryPowerMw > 0.000001}
          width={flowWidth(batteryPowerMw)}
        />
        <FlowPath
          id="grid"
          animate={!!measured}
          baseD="M470 394 V427 Q470 449 492 449 H611"
          activeD={gridActiveD}
          active={measured ? ["forward","reverse"].includes(measured.gridDirection) : gridDisplayMw > 0.000001}
          width={flowWidth(gridDisplayMw)}
        />
        <path
          d="M543 127 H669 Q692 127 692 150 V325"
          fill="none"
          stroke={FLOW_IDLE}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M299 475 H611" fill="none" stroke={FLOW_IDLE} strokeWidth="4" strokeLinecap="round" />

        <g fontFamily="Inter, Noto Sans SC, system-ui, sans-serif">
          <text x="28" y="49" fontSize="19" fontWeight="760" fill={INK}>Status:</text>
          <circle cx="118" cy="42" r="9" fill={statusTone} />
          {station.status === "online" && (
            <path d="M114 42 L117 45 L123 38" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          )}
          <text x="131" y="48" fontSize="17" fontWeight="700" fill={statusTone}>{statusLabel}</text>
          <GearIcon x={218} y={42} />

          <SunIcon />
          <circle cx="72" cy="92" r="3" fill={INK} />
          <text x="80" y="99" fontSize="19" fontWeight="760" fill={INK}>{measured ? "—" : "32°"}</text>
          <LightningIcon x={746} y={92} />
        </g>

        <SolarPanel />
        <HouseScene />
        <BatteryStatusIcon soc={displaySoc} />
        <BatteryStack soc={displaySoc} />
        <GridTower />

        <g fontFamily="Inter, Noto Sans SC, system-ui, sans-serif">
          <PowerText x={543} y={106} mw={pvMw} metric={measured?.metrics.solar} size={31} unitSize={17} />
          <PowerText x={537} y={292} mw={loadMw} metric={measured?.metrics.factory} size={31} unitSize={17} />

          <text x="235" y="171" fontSize="20" fontWeight="650" fill={INK}>
            {measured ? "—" : formatPower(pvToBatteryMw)}
          </text>
          <text x="467" y="221" fontSize="20" fontWeight="650" fill="#303746">
            {measured ? `${measured.metrics.solar.value} kW` : formatPower(pvToLoadMw)}
          </text>
          <text x="284" y="385" fontSize="19" fontWeight="650" fill="#303746">
            {measured ? "—" : formatPower(auxiliaryLoadMw)}
          </text>
          <text x="483" y="427" fontSize="19" fontWeight="650" fill="#303746">
            {measured ? `${measured.metrics.tower.value} kW` : formatPower(gridDisplayMw)}
          </text>

          <text x="89" y="471" fontSize="21" fontWeight="650" fill="#3e4654">
            {displaySoc === null ? "—" : `${clamp(displaySoc, 0, 100).toFixed(0)}%`}
          </text>
          <PowerText x={186} y={526} mw={batteryDisplayMw} metric={measured?.metrics.battery} size={31} unitSize={17} />
          <PowerText x={669} y={526} mw={gridDisplayMw} metric={measured?.metrics.tower} size={31} unitSize={17} />

          <text x="907" y="263" fontSize="22" fontWeight="520" fill="#7b8493">{measured ? "PCS Power" : "Build-in Power"}</text>
          <PowerText x={907} y={310} mw={realtimeMw} metric={measured?.metrics.pcs} size={35} unitSize={18} />
        </g>
      </svg>
    </div>
  );
}

export const flowDeviceNames:Record<DeviceType,string>={tower:'电网',factory:'工厂负荷',pcs:'PCS',solar:'光伏',battery:'电池'}
/** Uses the repository's original 2D tower, building and PV artwork; cabinets are native SVG. */
export function StationFlowDeviceArtwork({type,width=130,height=120}:{type:DeviceType;width?:number|string;height?:number|string}){
 const box=type==='tower'?'625 330 140 170':type==='factory'?'318 235 250 153':type==='solar'?'390 60 145 115':'0 0 150 160'
 return <svg viewBox={box} width={width} height={height} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" className="station-flow-device-artwork">{type==='tower'?<GridTower/>:type==='factory'?<HouseScene/>:type==='solar'?<SolarPanel/>:type==='pcs'?<g><ellipse cx="75" cy="150" rx="58" ry="7" fill="#dce5e9"/><path d="M24 18 81 9 106 25 49 35Z" fill="#90a6b4"/><path d="M24 18 49 35V146L24 130Z" fill="#637b8d"/><path d="M49 35 106 25V136L49 146Z" fill="#344e61"/><path d="M56 42 98 35V130L56 137Z" fill="#425e70" stroke="#8aa0ad"/><path d="M62 52 91 47V68L62 73Z" fill="#a2c8d7" stroke="#213d51" strokeWidth="3"/>{[0,1,2,3,4].map(n=><path key={n} d={`M62 ${86+n*5} 91 ${81+n*5}`} stroke="#1e394b" strokeWidth="2"/>)}<path d="M89 100V114" stroke="#bacbd2" strokeWidth="3"/><path d="M107 62 128 58 139 67 118 72Z" fill="#99acb9"/><path d="M107 62 118 72V141L107 135Z" fill="#6d8494"/><path d="M118 72 139 67V134L118 141Z" fill="#3c586a"/><circle cx="128" cy="94" r="5" fill="#a8bfcb"/><circle cx="128" cy="111" r="5" fill="#a8bfcb"/></g>:<g><ellipse cx="75" cy="151" rx="61" ry="7" fill="#dce5e9"/><path d="M18 34 63 15 129 30 84 51Z" fill="#e8eef0" stroke="#acbdc7"/><path d="M18 34 84 51V145L18 126Z" fill="#c8d6de" stroke="#99aebc"/><path d="M84 51 129 30V123L84 145Z" fill="#e4ebef" stroke="#a5b8c4"/>{[0,1,2,3,4,5,6].map(n=><path key={n} d={`M${25+n*8} ${39+n*2}V${121+n*2}`} stroke="#a5b8c4" strokeWidth="2"/>)}<path d="M93 58 120 45V116L93 130Z" fill="#d8e3e9" stroke="#a0b5c2"/><path d="M100 74 114 67V86L100 93Z" fill="#9cbdca" stroke="#8ca9b8"/><path d="M103 104V116" stroke="#718d9f" strokeWidth="3"/><path d="M24 126 84 144 126 125" fill="none" stroke="#5f7e91" strokeWidth="3"/></g>}</svg>
}
export function activateFlowDevice(type:DeviceType,onSelect:((type:DeviceType)=>void)|undefined,event?:{key:string;preventDefault:()=>void}){if(event&&!['Enter',' '].includes(event.key))return;if(!onSelect)return;event?.preventDefault();onSelect(type)}
const measuredBranches=[
 {id:'grid',base:'M320 150 H385 Q415 150 415 180 V270 H430',reverse:'M430 270 H415 V180 Q415 150 385 150 H320',direction:'gridDirection'},
 {id:'solar',base:'M320 432 H385 Q415 432 415 402 V310 H430',reverse:'',direction:'solarDirection'},
 {id:'load',base:'M635 270 H665 Q695 270 695 240 V150 H743',reverse:'',direction:'loadDirection'},
 {id:'battery',base:'M635 310 H665 Q695 310 695 340 V432 H743',reverse:'M743 432 H695 V340 Q695 310 665 310 H635',direction:'batteryDirection'},
] as const
function MeasuredFlowDiagram({station,measured,selectedType,onDeviceSelect,devices}:Props&{measured:StationFlowModel}){
 const visible=(type:DeviceType)=>!devices||devices.some(device=>device.type===type)
 const nodes:Array<{type:DeviceType;x:number;y:number;width:number;height:number}>=[{type:'tower',x:60,y:60,width:260,height:180},{type:'factory',x:743,y:60,width:260,height:180},{type:'solar',x:60,y:342,width:260,height:180},{type:'battery',x:743,y:342,width:260,height:180},{type:'pcs',x:430,y:196,width:205,height:192}]
 const state=(type:DeviceType)=>{const dir=type==='tower'?measured.gridDirection:type==='battery'?measured.batteryDirection:type==='solar'?measured.solarDirection:type==='factory'?measured.loadDirection:null;return dir==='unknown'?'方向未知':dir==='idle'?'无功率交换':type==='tower'?(dir==='forward'?'购电入站':'并网出站'):type==='battery'?(dir==='forward'?'充电':'放电'):type==='solar'?'发电出端':type==='factory'?'负荷消耗':'公共母线'}
 return <div className="energy-flow-diagram energy-flow-measured"><style>{`
 .energy-flow-measured{width:100%;height:100%;min-height:270px;overflow:hidden;background:#fff}.energy-flow-measured>svg{display:block;width:100%;height:100%;font-family:Inter,"Microsoft YaHei",sans-serif}.energy-flow-device{cursor:pointer;outline:none}.energy-flow-device-frame{fill:#fff;stroke:#e2eae6;stroke-width:1.5;transition:fill .16s,stroke .16s,filter .16s}.energy-flow-device:hover .energy-flow-device-frame{fill:#f5faf7;stroke:#a4d3bd;filter:drop-shadow(0 3px 5px #214f3712)}.energy-flow-device:focus-visible .energy-flow-device-frame{stroke:#278d6b;stroke-width:3}.energy-flow-device[data-selected=true] .energy-flow-device-frame{fill:#eef8f1;stroke:#36a77e;stroke-width:2.5}.energy-flow-device[aria-disabled=true]{cursor:default}.energy-flow-measured text{font-variant-numeric:tabular-nums}.energy-flow-particle{pointer-events:none}@media(prefers-reduced-motion:reduce){.energy-flow-particle{display:none}.energy-flow-device-frame{transition:none}}
 `}</style><svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="group" aria-label={`${station.name} 能源流向图`}><title>{`${station.name} 场站公共母线能流`}</title><defs><filter id="device-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#76808d" floodOpacity=".15"/></filter><marker id="flow-arrow" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10Z" fill={FLOW_BLUE}/></marker></defs><text x="65" y="30" fill="#8a9b91" fontSize="14">点击元件查看对应指标</text>{measuredBranches.filter(branch=>visible(branch.id==='grid'?'tower':branch.id==='load'?'factory':branch.id)).map(branch=>{const dir=measured[branch.direction];return <FlowPath key={branch.id} id={branch.id} baseD={branch.base} activeD={dir==='reverse'&&branch.reverse?branch.reverse:branch.base} active={dir==='forward'||dir==='reverse'} animate width={4}/>})}{nodes.filter(node=>visible(node.type)).map(node=>{const metric=measured.metrics[node.type],pcs=node.type==='pcs',labelX=node.x+(pcs?116:150);return <g key={node.type} className="energy-flow-device" data-device={node.type} role="button" tabIndex={onDeviceSelect?0:-1} aria-pressed={selectedType===node.type} aria-disabled={!onDeviceSelect} aria-label={`${flowDeviceNames[node.type]}，功率 ${metric.value} ${metric.unit}，查看对应指标`} data-selected={selectedType===node.type} onClick={()=>activateFlowDevice(node.type,onDeviceSelect)} onKeyDown={event=>activateFlowDevice(node.type,onDeviceSelect,event)}><rect className="energy-flow-device-frame" x={node.x} y={node.y} width={node.width} height={node.height} rx="16"/><svg x={node.x+12} y={node.y+20} width={pcs?98:132} height="130" viewBox="0 0 150 160"><StationFlowDeviceArtwork type={node.type} width="150" height="160"/></svg><text x={labelX} y={node.y+48} fill="#586d60" fontSize={pcs?18:20} fontWeight="500">{flowDeviceNames[node.type]}</text><PowerText x={labelX} y={node.y+83} mw={0} metric={metric} size={pcs?21:24} unitSize={13} weight={550}/><text x={labelX} y={node.y+111} fill="#91a296" fontSize="13">{state(node.type)}</text>{node.type==='battery'&&<text x={labelX} y={node.y+137} fill="#799184" fontSize="13">SOC {measured.batterySoc===null?'—':`${measured.batterySoc}%`}</text>}</g>})}<text x="532" y="563" textAnchor="middle" fill="#9aaba1" fontSize="13">能量流向根据采样功率显示</text></svg></div>
}
