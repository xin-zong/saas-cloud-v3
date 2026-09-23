import { useEffect, useRef } from "react";
import L from "leaflet";
import { Station } from "../App";

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  fault: "#ef4444",
  offline: "#76857f",
  building: "#1f7a68",
};

const STATUS_LABEL: Record<string, string> = {
  online: "在线",
  fault: "故障",
  offline: "离线",
  building: "建设中",
};

// [lat, lng, zoom]
const REGION_VIEW: Record<string, [number, number, number]> = {
  "":        [35.0, 105.0, 5],
  "华东":    [31.5, 120.5, 7],
  "华南":    [23.0, 113.5, 7],
  "华北":    [39.9, 116.4, 7],
  "华中":    [30.5, 112.5, 7],
  "西南":    [28.0, 104.0, 6],
  "西北":    [36.0,  99.0, 5],
  "东北":    [43.5, 124.0, 6],
  "东南亚":  [ 5.0, 110.0, 4],
  "日韩":    [36.0, 128.0, 5],
  "南亚":    [23.0,  78.0, 5],
  "澳洲":    [-25.0, 134.0, 4],
  "西欧":    [48.0,   8.0, 4],
  "中东欧":  [50.0,  20.0, 4],
  "北欧":    [60.0,  15.0, 4],
  "北美":    [45.0, -95.0, 3],
  "拉丁美洲":[-15.0, -60.0, 3],
  "中东":    [27.0,  44.0, 4],
  "非洲":    [ 5.0,  20.0, 4],
};

const STATION_COORDS: Record<string, [number, number]> = {
  "1": [31.32, 120.62], // 苏州园区站  [lat, lng]
  "2": [32.03, 120.89], // 南通港口站
  "3": [31.77, 119.97], // 常州数据中心
  "4": [31.57, 120.31], // 无锡制造基地
  "5": [30.88, 121.89], // 上海临港站
};

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string;

function makeIcon(color: string, isFault: boolean) {
  const pulse = isFault
    ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};animation:markerPulse 1.8s ease-out infinite"></div>`
    : "";
  return L.divIcon({
    html: `<div style="position:relative;width:24px;height:24px">
      ${pulse}
      <div style="position:absolute;inset:3px;border-radius:50%;background:white;box-shadow:0 1px 4px rgba(0,0,0,0.25)"></div>
      <div style="position:absolute;inset:6px;border-radius:50%;background:${color}"></div>
    </div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

interface Props {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (s: Station) => void;
  region?: string;
}

export default function MapView({ stations, selectedStation, onSelectStation, region = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const onSelectRef = useRef(onSelectStation);
  useEffect(() => { onSelectRef.current = onSelectStation; }, [onSelectStation]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [31.6, 120.5],
      zoom: 8,
      zoomControl: false,
      attributionControl: false,
    });

    // 高德地图瓦片 — 标准地图（key 参数）
    L.tileLayer(
      `https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}&key=${AMAP_KEY}`,
      { subdomains: "1234", maxZoom: 18, tileSize: 256 }
    ).addTo(map);

    // 高德路网 + 注记叠加层
    L.tileLayer(
      `https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}&key=${AMAP_KEY}`,
      { subdomains: "1234", maxZoom: 18, tileSize: 256, opacity: 0.6 }
    ).addTo(map);

    mapRef.current = map;

    // Add markers
    stations.forEach((station) => {
      const coords = STATION_COORDS[station.id];
      if (!coords) return;

      const popupEl = document.createElement("div");
      popupEl.style.fontFamily = "Inter, sans-serif";
      popupEl.innerHTML = `
        <div style="font-weight:600;color:#1d2f2a;font-size:11px;margin-bottom:3px">${station.name}</div>
        <div style="display:flex;align-items:center;gap:5px;font-size:10px">
          <span style="width:6px;height:6px;border-radius:50%;background:${STATUS_COLOR[station.status]};display:inline-block;flex-shrink:0"></span>
          <span style="color:#61716b">${STATUS_LABEL[station.status]}</span>
        </div>
        ${station.alerts.length > 0
          ? `<div style="color:#ef4444;margin-top:3px;font-size:10px">⚠ ${station.alerts[0].msg}</div>`
          : ""}
      `;

      const marker = L.marker(coords, {
        icon: makeIcon(STATUS_COLOR[station.status], station.status === "fault"),
        zIndexOffset: station.status === "fault" ? 1000 : 0,
      })
        .addTo(map)
        .bindPopup(popupEl, { closeButton: false, offset: [0, -6], maxWidth: 180 });

      marker.on("click", () => onSelectRef.current(station));
      markersRef.current[station.id] = marker;
    });

    // Fit view
    const coords = Object.values(STATION_COORDS) as [number, number][];
    if (coords.length) map.fitBounds(L.latLngBounds(coords), { padding: [60, 60], maxZoom: 10 });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Pan to selected station
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStation) return;
    const coords = STATION_COORDS[selectedStation.id];
    if (coords) map.panTo(coords, { animate: true, duration: 0.5 });
  }, [selectedStation]);

  // Fly to region
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = REGION_VIEW[region] ?? REGION_VIEW[""];
    map.flyTo([view[0], view[1]], view[2], { animate: true, duration: 1.0 });
  }, [region]);

  const zoom = (dir: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    dir > 0 ? map.zoomIn() : map.zoomOut();
  };

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Zoom controls */}
      <div
        className="absolute flex flex-col rounded-lg overflow-hidden"
        style={{
          bottom: 20, right: 16, zIndex: 1200,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          border: "1px solid #d8e3dc",
        }}
      >
        {([1, -1] as const).map((dir, i) => (
          <button
            key={dir}
            onClick={() => zoom(dir)}
            style={{
              width: 28, height: 28,
              background: "rgba(255,255,255,0.95)",
              borderBottom: i === 0 ? "1px solid #d8e3dc" : "none",
              color: "#24423b", fontSize: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", lineHeight: 1,
            }}
          >
            {dir > 0 ? "+" : "−"}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div
        className="absolute flex items-center gap-4 px-4 py-1.5 rounded-lg"
        style={{
          bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #d8e3dc",
          backdropFilter: "blur(8px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          zIndex: 1200, whiteSpace: "nowrap",
        }}
      >
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="rounded-full" style={{ width: 7, height: 7, background: STATUS_COLOR[status] }} />
            <span style={{ fontSize: 10, color: "#61716b" }}>{label}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes markerPulse {
          0%   { transform: scale(1);   opacity: 0.45; }
          70%  { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
          border: 1px solid #d8e3dc !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 8px 12px !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-container { font-family: 'Inter', sans-serif; }
        .leaflet-control-attribution { display: none; }
      `}</style>
    </div>
  );
}
