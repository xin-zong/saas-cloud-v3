import { DEMO_MODE } from "@/api/client"
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Station } from "@/App";

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
  "1": [31.2989, 120.7153],
  "2": [39.47, -0.38],
};

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string;
const MAP_MIN_ZOOM = 2;
const MAP_MAX_ZOOM = 18;

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

function getStationCoords(station: Station): [number, number] | null {
  const parse = (value: string, negative: RegExp) => {
    const number = Number.parseFloat(value);
    return negative.test(value) ? -Math.abs(number) : number;
  };
  const lat = parse(station.lat, /S/i);
  const lng = parse(station.lng, /W/i);
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
    return [lat, lng];
  return DEMO_MODE ? STATION_COORDS[station.id] ?? null : null;
}

function makePopupElement(station: Station) {
  const root = document.createElement("div");
  root.style.fontFamily = "Inter, sans-serif";

  const name = document.createElement("div");
  name.textContent = station.name;
  name.style.fontWeight = "600";
  name.style.color = "#1d2f2a";
  name.style.fontSize = "11px";
  name.style.marginBottom = "3px";
  root.appendChild(name);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "5px";
  row.style.fontSize = "10px";

  const dot = document.createElement("span");
  dot.style.width = "6px";
  dot.style.height = "6px";
  dot.style.borderRadius = "50%";
  dot.style.background = STATUS_COLOR[station.status];
  dot.style.display = "inline-block";
  dot.style.flexShrink = "0";
  row.appendChild(dot);

  const status = document.createElement("span");
  status.textContent = (DEMO_MODE ? STATUS_LABEL[station.status] : station.runStatus);
  status.style.color = "#61716b";
  row.appendChild(status);
  root.appendChild(row);

  const firstAlert = station.alerts[0];
  if (firstAlert) {
    const alert = document.createElement("div");
    alert.textContent = `! ${firstAlert.msg}`;
    alert.style.color = "#ef4444";
    alert.style.marginTop = "3px";
    alert.style.fontSize = "10px";
    root.appendChild(alert);
  }

  return root;
}

interface Props {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (s: Station, pos?: { x: number; y: number }) => void;
  region?: string;
}

export default function MapView({ stations, selectedStation, onSelectStation, region = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const onSelectRef = useRef(onSelectStation);
  const stationsRef = useRef(stations);
  const regionRef = useRef(region);
  const coordinateKeyRef = useRef("");
  const [zoomLevel, setZoomLevel] = useState(MAP_MIN_ZOOM);
  useEffect(() => { onSelectRef.current = onSelectStation; }, [onSelectStation]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { regionRef.current = region; }, [region]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [31.6, 120.5],
      zoom: 8,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    // 高德地图瓦片 — 标准地图（key 参数）
    L.tileLayer(
      `https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}&key=${AMAP_KEY}`,
      { subdomains: "1234", minZoom: MAP_MIN_ZOOM, maxZoom: MAP_MAX_ZOOM, tileSize: 256 }
    ).addTo(map);

    // 高德路网 + 注记叠加层
    L.tileLayer(
      `https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}&key=${AMAP_KEY}`,
      { subdomains: "1234", minZoom: MAP_MIN_ZOOM, maxZoom: MAP_MAX_ZOOM, tileSize: 256, opacity: 0.6 }
    ).addTo(map);

    mapRef.current = map;

    const syncZoomLevel = () => setZoomLevel(map.getZoom());
    let wasVisible = false;
    const syncVisibleSize = () => {
      const container = containerRef.current;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        wasVisible = false;
        return;
      }
      map.invalidateSize({ pan: false });
      if (!wasVisible) {
        const view = REGION_VIEW[regionRef.current] ?? REGION_VIEW[""];
        map.setView([view[0], view[1]], view[2], { animate: false });
      }
      wasVisible = true;
      syncZoomLevel();
    };
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncVisibleSize())
        : null;
    resizeObserver?.observe(containerRef.current);
    syncVisibleSize();
    map.on("zoomend", syncZoomLevel);

    return () => {
      resizeObserver?.disconnect();
      map.off("zoomend", syncZoomLevel);
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Keep Leaflet markers aligned with the latest station data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const visibleIds = new Set<string>();

    stations.forEach((station) => {
      const coords = getStationCoords(station);
      if (!coords) return;

      visibleIds.add(station.id);
      let marker = markersRef.current[station.id];

      if (!marker) {
        marker = L.marker(coords, {
          icon: makeIcon(STATUS_COLOR[station.status], station.status === "fault"),
          zIndexOffset: station.status === "fault" ? 1000 : 0,
        }).addTo(map);
        marker.on("click", () => {
          const latestStation = stationsRef.current.find((item) => item.id === station.id);
          if (!latestStation) return;
          const latestCoords = getStationCoords(latestStation);
          if (!latestCoords) return;
          const pt = map.latLngToContainerPoint(latestCoords);
          onSelectRef.current(latestStation, { x: pt.x, y: pt.y });
        });
        markersRef.current[station.id] = marker;
      }

      marker.setLatLng(coords);
      marker.setIcon(makeIcon(STATUS_COLOR[station.status], station.status === "fault"));
      marker.setZIndexOffset(station.status === "fault" ? 1000 : 0);

      const popup = marker.getPopup();
      if (popup) {
        popup.setContent(makePopupElement(station));
      } else {
        marker.bindPopup(makePopupElement(station), {
          closeButton: false,
          offset: [0, -6],
          maxWidth: 180,
        });
      }
    });

    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (visibleIds.has(id)) return;
      marker.remove();
      delete markersRef.current[id];
    });

    const coordinateKey = [...stations]
      .map((station) => {
        const coords = getStationCoords(station);
        return coords
          ? `${station.id}:${coords[0].toFixed(5)},${coords[1].toFixed(5)}`
          : `${station.id}:none`;
      })
      .sort()
      .join("|");
    if (coordinateKey !== coordinateKeyRef.current) {
      coordinateKeyRef.current = coordinateKey;
      const coords = stations
        .map(getStationCoords)
        .filter((point): point is [number, number] => point !== null);
      if (coords.length > 1) {
        map.fitBounds(L.latLngBounds(coords), {
          padding: [60, 60],
          maxZoom: 10,
          animate: false,
        });
      } else if (coords.length === 1) {
        map.setView(coords[0], Math.max(MAP_MIN_ZOOM, 8), {
          animate: false,
        });
      }
    }
  }, [stations]);

  // Pan to selected station
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStation) return;
    const coords = getStationCoords(selectedStation);
    if (coords) map.panTo(coords, { animate: true, duration: 0.5 });
  }, [selectedStation]);

  // Fly to region
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = REGION_VIEW[region] ?? REGION_VIEW[""];
    try {
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        map.flyTo([view[0], view[1]], view[2], { animate: true, duration: 1.0 });
      }
    } catch { /* map not ready yet */ }
  }, [region]);

  const zoom = (dir: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    const nextZoom = map.getZoom() + dir;
    if (nextZoom < MAP_MIN_ZOOM || nextZoom > MAP_MAX_ZOOM) return;
    dir > 0 ? map.zoomIn() : map.zoomOut();
  };

  return (
    <div className="map-green-base absolute inset-0">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="map-green-wash" />

      {/* Zoom controls */}
      <div
        className="absolute flex flex-col rounded-lg overflow-hidden"
        style={{
          bottom: 20, right: 16, zIndex: 1200,
          boxShadow: "0 8px 20px rgba(24,52,45,0.12)",
          border: "1px solid #d8e3dc",
        }}
      >
        {([1, -1] as const).map((dir, i) => {
          const disabled = dir > 0 ? zoomLevel >= MAP_MAX_ZOOM : zoomLevel <= MAP_MIN_ZOOM;
          const label = dir > 0 ? "放大地图" : "缩小地图";
          return (
            <button
              key={dir}
              type="button"
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={() => zoom(dir)}
              style={{
                width: 28, height: 28,
                background: "rgba(255,255,255,0.95)",
                borderBottom: i === 0 ? "1px solid #d8e3dc" : "none",
                color: "#24423b", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: disabled ? "not-allowed" : "pointer", lineHeight: 1,
                opacity: disabled ? 0.42 : 1,
              }}
            >
              {dir > 0 ? "+" : "−"}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div
        className="absolute flex items-center gap-4 px-4 py-1.5 rounded-lg"
        style={{
          bottom: 16, left: "50%", transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid #d8e3dc",
          backdropFilter: "blur(8px)",
          boxShadow: "0 8px 20px rgba(24,52,45,0.08)",
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
          box-shadow: 0 10px 26px rgba(24,52,45,0.12) !important;
          border: 1px solid #d8e3dc !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 8px 12px !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-container {
          background: #e6eee8;
          font-family: 'Inter', sans-serif;
        }
        .map-green-base .leaflet-tile-pane {
          filter: saturate(0.42) hue-rotate(-32deg) brightness(1.12) contrast(0.82);
        }
        .map-green-wash {
          position: absolute;
          inset: 0;
          z-index: 500;
          pointer-events: none;
          background:
            radial-gradient(circle at 48% 36%, rgba(255,255,255,0.28), transparent 38%),
            linear-gradient(90deg, rgba(240,248,245,0.24), rgba(255,255,255,0.12) 50%, rgba(240,248,245,0.2));
        }
        .leaflet-control-attribution { display: none; }
      `}</style>
    </div>
  );
}
