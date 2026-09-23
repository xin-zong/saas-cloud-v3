import { DEMO_MODE } from "@/api/client"
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Station } from "@/App";

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string;

const STATUS_COLOR: Record<string, string> = {
  online: "#1f7a68",
  fault: "#f97316",
  offline: "#76857f",
  building: "#a78bfa",
};

const STATUS_LABEL: Record<string, string> = {
  online: "在线",
  fault: "告警",
  offline: DEMO_MODE ? "离线" : "未知",
  building: "建设中",
};

// [lat, lng, zoom]
const REGION_VIEW: Record<string, [number, number, number]> = {
  "":          [35.0, 105.0, 5],
  "华东":      [31.5, 120.5, 7],
  "华南":      [23.0, 113.5, 7],
  "华北":      [39.9, 116.4, 7],
  "华中":      [30.5, 112.5, 7],
  "西南":      [28.0, 104.0, 6],
  "西北":      [36.0,  99.0, 5],
  "东北":      [43.5, 124.0, 6],
  "东南亚":    [ 5.0, 110.0, 4],
  "日韩":      [36.0, 128.0, 5],
  "南亚":      [23.0,  78.0, 5],
  "澳洲":      [-25.0, 134.0, 4],
  "西欧":      [48.0,   8.0, 4],
  "中东欧":    [50.0,  20.0, 4],
  "北欧":      [60.0,  15.0, 4],
  "北美":      [45.0, -95.0, 3],
  "拉丁美洲":  [-15.0, -60.0, 3],
  "中东":      [27.0,  44.0, 4],
  "非洲":      [ 5.0,  20.0, 4],
};

// Real coords keyed by station id
const STATION_COORDS: Record<string, [number, number]> = {
  "1": [31.32, 120.62],
  "2": [32.03, 120.89],
  "3": [31.77, 119.97],
  "4": [31.57, 120.31],
  "5": [30.88, 121.89],
};

function makeMarkerIcon(color: string, isFault: boolean, highlighted: boolean) {
  const size = highlighted ? 28 : 22;
  const innerSize = highlighted ? 10 : 8;
  const offset = (size - innerSize) / 2;
  const pulse = isFault
    ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;animation:mqPulse 1.8s ease-out infinite"></div>`
    : "";
  return L.divIcon({
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      ${pulse}
      <div style="position:absolute;inset:3px;border-radius:50%;background:white;box-shadow:0 1px 6px rgba(0,0,0,0.22)"></div>
      <div style="position:absolute;top:${offset}px;left:${offset}px;width:${innerSize}px;height:${innerSize}px;border-radius:50%;background:${color}"></div>
      ${highlighted ? `<div style="position:absolute;inset:-3px;border-radius:50%;border:2px solid ${color};opacity:0.6"></div>` : ""}
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

interface Props {
  stations: Station[];
  onOpenStation: (id: string) => void;
}

export default function MapQueryTab({ stations, onOpenStation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [clusterOpen, setClusterOpen] = useState(false);
  const [cluster, setCluster] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpenStation);
  useEffect(() => { onOpenRef.current = onOpenStation; }, [onOpenStation]);
  const setSelectedRef = useRef(setSelectedStation);
  useEffect(() => { setSelectedRef.current = setSelectedStation; }, []);
  const setPopupPosRef = useRef(setPopupPos);
  useEffect(() => { setPopupPosRef.current = setPopupPos; }, []);

  // Click outside closers
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (clusterRef.current && !clusterRef.current.contains(e.target as Node)) setClusterOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Derived counts
  const onlineCount = stations.filter((s) => s.status === "online").length;
  const faultCount = stations.filter((s) => s.status === "fault").length;
  const offlineCount = stations.filter((s) => s.status === "offline").length;
  const onlineRate = stations.length ? Math.round((onlineCount / stations.length) * 100) : 0;

  // Filtered visible stations
  const visible = stations.filter((s) => {
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.project.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    const matchRegion = !cluster || s.region === cluster;
    return matchSearch && matchStatus && matchRegion;
  });
  const visibleIds = new Set(visible.map((s) => s.id));

  const currentStatusLabel = statusFilter ? STATUS_LABEL[statusFilter] : "全部状态";

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [35.0, 105.0],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      `https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}&key=${AMAP_KEY}`,
      { subdomains: "1234", maxZoom: 18, tileSize: 256 }
    ).addTo(map);

    mapRef.current = map;

    stations.forEach((s) => {
      const coords: [number, number] | undefined = DEMO_MODE ? STATION_COORDS[s.id] : (s.lat && s.lng && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)) ? [Number(s.lat), Number(s.lng)] : undefined);
      if (!coords) return;

      const escape = (value: string) => value.replace(/[&<>"\']/g, char => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "\'":"&#39;", "\"":"&quot;"}[char]!));
      const popupEl = document.createElement("div");
      popupEl.innerHTML = `
        <div style="font-weight:600;color:#1d2f2a;font-size:12px;margin-bottom:4px">${escape(s.name)}</div>
        <div style="display:flex;align-items:center;gap:5px;font-size:11px">
          <span style="width:7px;height:7px;border-radius:50%;background:${STATUS_COLOR[s.status]};display:inline-block"></span>
          <span style="color:#61716b">${STATUS_LABEL[s.status]}</span>
          <span style="color:#76857f;margin-left:4px">${escape(s.region)} · ${escape(s.project)}</span>
        </div>
        ${s.alerts.length > 0 ? `<div style="color:#f97316;margin-top:4px;font-size:10px">⚠ ${escape(s.alerts[0].msg)}</div>` : ""}
      `;

      const marker = L.marker(coords, {
        icon: makeMarkerIcon(STATUS_COLOR[s.status], s.status === "fault", false),
        zIndexOffset: s.status === "fault" ? 1000 : 0,
      })
        .addTo(map)
        .bindPopup(popupEl, { closeButton: false, offset: [0, -4], maxWidth: 220 });

      marker.on("click", () => {
        setSelectedRef.current(s);
        const pt = map.latLngToContainerPoint(coords);
        setPopupPosRef.current({ x: pt.x, y: pt.y });
        map.panTo(coords, { animate: true, duration: 0.4 });
      });

      markersRef.current[s.id] = marker;
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Update marker visibility when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stations.forEach((s) => {
      const marker = markersRef.current[s.id];
      if (!marker) return;

      if (visibleIds.has(s.id)) {
        const highlighted = !!search && (s.name.toLowerCase().includes(search.toLowerCase()));
        marker.setIcon(makeMarkerIcon(STATUS_COLOR[s.status], s.status === "fault", highlighted));
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });
  }, [statusFilter, search, cluster, stations]);

  // Fly to selected region
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = REGION_VIEW[cluster] ?? REGION_VIEW[""];
    try {
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        map.flyTo([view[0], view[1]], view[2], { animate: true, duration: 1.0 });
      }
    } catch { /* map not ready yet */ }
  }, [cluster]);

  const REGION_MENU = [
    { label: "全部区域", value: "" },
    { group: "中国大陆" },
    { label: "华东", value: "华东" }, { label: "华南", value: "华南" },
    { label: "华北", value: "华北" }, { label: "华中", value: "华中" },
    { label: "西南", value: "西南" }, { label: "西北", value: "西北" },
    { label: "东北", value: "东北" },
    { group: "亚太" },
    { label: "东南亚", value: "东南亚" }, { label: "日韩", value: "日韩" },
    { label: "南亚", value: "南亚" },    { label: "澳洲", value: "澳洲" },
    { group: "欧洲" },
    { label: "西欧", value: "西欧" }, { label: "中东欧", value: "中东欧" }, { label: "北欧", value: "北欧" },
    { group: "美洲" },
    { label: "北美", value: "北美" }, { label: "拉丁美洲", value: "拉丁美洲" },
    { group: "中东 & 非洲" },
    { label: "中东", value: "中东" }, { label: "非洲", value: "非洲" },
  ];
  const currentClusterLabel = REGION_MENU.find((r) => "value" in r && r.value === cluster)?.label ?? "全部区域";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative", overflow: "hidden" }}>
      {/* ─── Top search bar ─────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 1200, display: "flex", alignItems: "center", gap: 8,
      }}>
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.97)", border: "1px solid #d8e3dc",
          borderRadius: 8, padding: "0 12px", height: 36,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)", backdropFilter: "blur(8px)",
          minWidth: 220,
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="5.5" cy="5.5" r="4.5" stroke="#76857f" strokeWidth="1.5" />
            <path d="M9 9l2.5 2.5" stroke="#76857f" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索场站或设备"
            style={{ border: "none", background: "none", fontSize: 12, color: "#24423b", outline: "none", width: 160 }}
          />
        </div>

        {/* Cluster picker */}
        <div ref={clusterRef} style={{ position: "relative" }}>
          <button
            onClick={() => setClusterOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: cluster ? "#eaf5ef" : "rgba(255,255,255,0.97)",
              border: `1px solid ${cluster ? "#1f7a68" : "#d8e3dc"}`,
              borderRadius: 8, padding: "0 12px", height: 36, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)", backdropFilter: "blur(8px)",
              fontSize: 12, fontWeight: cluster ? 600 : 500, color: cluster ? "#1f7a68" : "#24423b",
            }}
          >
            {currentClusterLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: clusterOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
              <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {clusterOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0,
              background: "#fff", border: "1px solid #d8e3dc", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 100,
              maxHeight: 320, overflowY: "auto", minWidth: 160,
            }}>
              {REGION_MENU.map((item, i) => {
                if ("group" in item) return (
                  <div key={i} style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: "#76857f", letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.group}</div>
                );
                const active = cluster === item.value;
                return (
                  <button key={i} onClick={() => { setCluster(item.value!); setClusterOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "7px 12px", fontSize: 12,
                      fontWeight: active ? 600 : 400, color: active ? "#1f7a68" : "#24423b",
                      background: active ? "#eaf5ef" : "none", border: "none", cursor: "pointer", textAlign: "left",
                    }}>
                    {item.label}
                    {active && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#1f7a68" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Status filter */}
        <div ref={statusRef} style={{ position: "relative" }}>
          <button
            onClick={() => setStatusOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: statusFilter ? "#eaf5ef" : "rgba(255,255,255,0.97)",
              border: `1px solid ${statusFilter ? "#1f7a68" : "#d8e3dc"}`,
              borderRadius: 8, padding: "0 12px", height: 36, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)", backdropFilter: "blur(8px)",
              fontSize: 12, fontWeight: statusFilter ? 600 : 500,
              color: statusFilter ? "#1f7a68" : "#24423b",
            }}
          >
            {statusFilter && (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[statusFilter], flexShrink: 0, display: "inline-block" }} />
            )}
            {currentStatusLabel}
            {statusFilter
              ? ` (${visible.length})`
              : ` (${stations.length})`}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: statusOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
              <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {statusOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              background: "#fff", border: "1px solid #d8e3dc", borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 100, overflow: "hidden", minWidth: 140,
            }}>
              {[
                { value: "", label: "全部状态", count: stations.length },
                { value: "online", label: "在线", count: onlineCount },
                { value: "fault", label: "告警", count: faultCount },
                { value: "offline", label: "离线", count: offlineCount },
              ].map(({ value, label, count }) => (
                <button key={value} onClick={() => { setStatusFilter(value); setStatusOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "8px 14px", textAlign: "left",
                    fontSize: 12, color: statusFilter === value ? "#1f7a68" : "#24423b",
                    fontWeight: statusFilter === value ? 600 : 400,
                    background: statusFilter === value ? "#eaf5ef" : "none", border: "none", cursor: "pointer",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {value && <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[value], display: "inline-block" }} />}
                    {label}
                  </div>
                  <span style={{ fontSize: 11, color: "#76857f", marginLeft: 8 }}>({count})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Left overlay panel ─────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 60, left: 12, zIndex: 1100,
        display: "flex", flexDirection: "column", gap: 10, width: 168,
      }}>
        {/* 站点运营概况 */}
        <div style={{
          background: "rgba(255,255,255,0.96)", border: "1px solid #dbe6df",
          borderRadius: 12, padding: "13px 14px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)", backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#1d2f2a" }}>站点运营概况</span>
            <span style={{ fontSize: 10, color: "#76857f", marginLeft: "auto" }}>
              {stations.length} 个
            </span>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#61716b" }}>在线场站率</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1d2f2a", lineHeight: 1, marginBottom: 6, fontFamily: "'JetBrains Mono',monospace" }}>
              {onlineRate}
            </div>
            {/* Segment bar */}
            <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", height: 5, gap: 2 }}>
              <div style={{ flex: onlineCount, background: "#10b981", borderRadius: 2 }} />
              <div style={{ flex: faultCount, background: "#f97316", borderRadius: 2 }} />
              <div style={{ flex: offlineCount, background: "#cbd8d0", borderRadius: 2 }} />
            </div>
          </div>

          {/* Status rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {[
              { label: "在线", count: onlineCount, color: "#10b981" },
              { label: "告警", count: faultCount, color: "#f97316" },
              { label: "离线", count: offlineCount, color: "#76857f" },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#61716b", flex: 1 }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 累计环保贡献 */}
        <div style={{
          background: "rgba(255,255,255,0.96)", border: "1px solid #dbe6df",
          borderRadius: 12, padding: "13px 14px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)", backdropFilter: "blur(12px)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1d2f2a", marginBottom: 10 }}>累计环保贡献</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981", lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>551.1</div>
              <div style={{ fontSize: 10, color: "#61716b", marginTop: 2 }}>CO₂减排(吨)</div>
            </div>
            <div style={{ height: 1, background: "#e8f0eb" }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1f7a68", lineHeight: 1, fontFamily: "'JetBrains Mono',monospace" }}>30,389</div>
              <div style={{ fontSize: 10, color: "#61716b", marginTop: 2 }}>等效植树(棵)</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Map canvas ─────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, width: "100%", height: "100%" }} />

      {/* ─── Station info popup ──────────────────────────────────────── */}
      {selectedStation && popupPos && (() => {
        const cardW = 272;
        const containerW = containerRef.current?.clientWidth ?? 800;
        const flipLeft = popupPos.x + 20 + cardW > containerW;
        const left = flipLeft ? popupPos.x - cardW - 16 : popupPos.x + 20;
        const top = Math.max(8, popupPos.y - 80);

        function onDragStart(e: React.MouseEvent) {
          e.preventDefault();
          const startX = e.clientX - popupPos!.x;
          const startY = e.clientY - popupPos!.y;
          function onMove(ev: MouseEvent) {
            setPopupPos({ x: ev.clientX - startX, y: ev.clientY - startY });
          }
          function onUp() {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          }
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }

        return (
        <div style={{
          position: "absolute", left, top,
          zIndex: 1300, width: cardW,
          background: "#fff", border: "1px solid #d8e3dc", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
          animation: "mqPopIn 0.16s ease",
        }}>
          <style>{`@keyframes mqPopIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

          {/* Header — drag handle */}
          <div
            onMouseDown={onDragStart}
            style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 14px 10px", borderBottom: "1px solid #e8f0eb", cursor: "grab", userSelect: "none" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1d2f2a" }}>{selectedStation.name}</div>
              <div style={{ fontSize: 10, color: "#76857f", fontFamily: "'JetBrains Mono',monospace", marginTop: 2 }}>{selectedStation.code}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[selectedStation.status], display: "inline-block" }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[selectedStation.status] }}>
                {STATUS_LABEL[selectedStation.status]}
              </span>
              <button onClick={() => { setSelectedStation(null); setPopupPos(null); }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#76857f", padding: 2, display: "flex", marginLeft: 4 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 14px", borderBottom: "1px solid #e8f0eb", gap: 6 }}>
            {[
              { label: "有功功率", value: selectedStation.activePower > 0 ? `${selectedStation.activePower} kW` : "—" },
              { label: "负载率", value: selectedStation.loadRate > 0 ? `${selectedStation.loadRate}%` : "—" },
              { label: "SOC", value: selectedStation.soc > 0 ? `${selectedStation.soc}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: "#76857f", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1d2f2a" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Location */}
          <div style={{ padding: "8px 14px", borderBottom: "1px solid #e8f0eb", fontSize: 11, color: "#61716b" }}>
            <span style={{ color: "#1f7a68", marginRight: 4 }}>📍</span>
            {selectedStation.region} · {selectedStation.project}
            {selectedStation.alerts.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#ef4444" }}>
                ⚠ {selectedStation.alerts[0].msg}
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ padding: "10px 14px" }}>
            <button
              onClick={() => { setSelectedStation(null); setPopupPos(null); onOpenRef.current(selectedStation.id); }}
              style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: "#1f7a68", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#176b5d"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1f7a68"; }}
            >
              进入站点详情 →
            </button>
          </div>
        </div>
        );
      })()}

      {/* ─── Bottom legend ───────────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 16,
        background: "rgba(255,255,255,0.95)", border: "1px solid #d8e3dc",
        borderRadius: 8, padding: "7px 18px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)", backdropFilter: "blur(8px)",
        zIndex: 1200,
      }}>
        {[
          { label: `在线 (${onlineCount})`, color: "#1f7a68" },
          { label: `告警 (${faultCount})`, color: "#f97316" },
          { label: `离线 (${offlineCount})`, color: "#76857f" },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 11, color: "#61716b" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Zoom controls */}
      <div style={{
        position: "absolute", bottom: 52, right: 16, zIndex: 1200,
        display: "flex", flexDirection: "column", borderRadius: 8, overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)", border: "1px solid #d8e3dc",
      }}>
        {([1, -1] as const).map((dir, i) => (
          <button key={dir} onClick={() => mapRef.current && (dir > 0 ? mapRef.current.zoomIn() : mapRef.current.zoomOut())}
            style={{
              width: 30, height: 30, background: "rgba(255,255,255,0.97)",
              borderBottom: i === 0 ? "1px solid #d8e3dc" : "none",
              color: "#24423b", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", border: "none", lineHeight: 1,
            }}>
            {dir > 0 ? "+" : "−"}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes mqPulse {
          0%   { transform: scale(1);   opacity: 0.4; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-popup-content-wrapper {
          border-radius: 9px !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.11) !important;
          border: 1px solid #d8e3dc !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 10px 13px !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-container { font-family: 'Inter', sans-serif; }
        .leaflet-control-attribution { display: none; }
      `}</style>
    </div>
  );
}
