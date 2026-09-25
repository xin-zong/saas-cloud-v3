import { useEffect, useState } from "react"
import type { Station } from "@/App"
import { Button } from "./ui/Workspace"
import StationEditPage from "./StationEditPage"
import MapQueryTab from "./MapQueryTab"
import SmartRulesTab from "./SmartRulesTab"
import StationProvisionPage from "./station-provision/StationProvisionPage"
import { Asset, EntryTabs, Modal } from "./station-provision/Common"
import { PROVISION_KEY, parseDraft } from "./station-provision/model"
import "./station-provision/station-entry.css"
interface Props {
  stations: Station[]
  onUpdateStation: (id: string, patch: Partial<Station>) => void | Promise<void>
  onCreateStation: (patch: Partial<Station>) => void
  onOpenStation: (id: string) => void
  canEdit?: boolean
  canEditStation?: (id: string) => boolean
  showRevenue?: boolean
}
const number = (value: number, suffix = "") =>
  Number.isFinite(value) ? String(value) + suffix : "—"
export default function AssetsPage({
  stations,
  onUpdateStation,
  onOpenStation,
  canEdit = true,
  canEditStation = () => canEdit,
  showRevenue = true,
}: Props) {
  const [tab, setTab] = useState("列表查询")
  const [search, setSearch] = useState("")
  const [region, setRegion] = useState("")
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(18)
  const [stars, setStars] = useState<Record<string, boolean>>(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem("enerlution_starred") ?? "{}",
      )
      return data && typeof data === "object" && !Array.isArray(data)
        ? data
        : {}
    } catch {
      return {}
    }
  })
  const [cancelStar, setCancelStar] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [editing, setEditing] = useState<Station | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [provision, setProvision] = useState<Station | "new" | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Station | null>(null)
  const [deleteName, setDeleteName] = useState("")
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(""), 3000)
    return () => clearTimeout(t)
  }, [notice])
  useEffect(() => {
    setPage(1)
  }, [search, region, tab, size])
  useEffect(() => {
    if (editing && (!stations.some(s => s.id === editing.id) || (!viewOnly && !canEditStation(editing.id)))) setEditing(null)
    if (provision && provision !== 'new' && !stations.some(s => s.id === provision.id)) setProvision(null)
    if (deleting && !canEditStation(deleting.id)) setDeleting(null)
  }, [stations, editing, viewOnly, canEditStation, provision, deleting])
  function favorite(id: string) {
    const next = { ...stars, [id]: !stars[id] }
    setStars(next)
    try {
      localStorage.setItem("enerlution_starred", JSON.stringify(next))
      setNotice(next[id] ? "已添加到收藏" : "已取消收藏")
    } catch {
      setNotice("本次收藏已更新，浏览器无法保存偏好")
    }
    setCancelStar(null)
  }
  function changeTab(t: string) {
    setTab(t)
    setMenu(null)
    setCancelStar(null)
  }
  const allowedEdit = editing && canEditStation(editing.id)
  if (provision) {
    if (
      (provision === "new" && !canEdit) ||
      (provision !== "new" && !canEditStation(provision.id))
    )
      return (
        <div className="station-entry-scope">
          <p>当前没有配置该站点的权限。</p>
          <Button onClick={() => setProvision(null)}>返回站点列表</Button>
        </div>
      )
    return (
      <StationProvisionPage
        station={provision === "new" ? undefined : provision}
        onBack={() => setProvision(null)}
      />
    )
  }
  if (editing)
    return (
      <StationEditPage
        key={editing.id}
        station={editing}
        isNew={false}
        readOnly={viewOnly || !allowedEdit}
        showRevenue={showRevenue}
        onBack={() => setEditing(null)}
        onSubmit={async (patch) => {
          if (!canEditStation(editing.id))
            throw new Error("没有编辑该站点的权限")
          await onUpdateStation(editing.id, patch)
        }}
      />
    )
  const query = search.trim().toLowerCase()
  const filtered = stations.filter(
    (s) =>
      (tab !== "收藏站点" || stars[s.id]) &&
      (!region || s.region === region) &&
      (!query ||
        [s.name, s.code, s.region, s.project].some((v) =>
          v.toLowerCase().includes(query),
        )),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const current = Math.min(page, pages)
  const rows = filtered.slice((current - 1) * size, current * size)
  let hasDraft = false
  try {
    hasDraft = !!parseDraft(localStorage.getItem(PROVISION_KEY))
  } catch {
    /* unavailable storage */
  }
  return (
    <div
      className="assets-workspace station-entry-scope station-assets"
      data-design-node="1114:8271"
    >
      <EntryTabs active={tab} onChange={changeTab} />
      {tab === "地图查询" ? (
        <MapQueryTab stations={stations} onOpenStation={onOpenStation} />
      ) : tab === "智能规则" ? (
        <SmartRulesTab stations={stations} onOpenStation={onOpenStation} />
      ) : (
        <div className="station-list-content">
          <div className="station-list-toolbar">
            {tab !== "收藏站点" && canEdit && (
              <Button variant="primary" onClick={() => setProvision("new")}>
                ＋ 新增站点
              </Button>
            )}
            <label className="station-search">
              <Asset name="list-imgSearch" />
              <input
                aria-label="搜索站点"
                placeholder="搜索站点名称、ID、区域"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {hasDraft && canEdit && (
              <button
                className="station-text-button"
                onClick={() => setProvision("new")}
              >
                继续本地建站草稿
              </button>
            )}
            <select
              className="station-region"
              aria-label="站点区域"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">区域</option>
              {[...new Set(stations.map((s) => s.region).filter(Boolean))].map(
                (r) => (
                  <option key={r}>{r}</option>
                ),
              )}
            </select>
          </div>
          <div
            className={
              "station-list-panel " + (!filtered.length ? "empty" : "")
            }
          >
            {!!filtered.length && (
              <table className="station-table">
                <thead>
                  <tr>
                    {[
                      "站点名称 / 状态",
                      "电池/能源",
                      "当前电量",
                      "运行时间",
                      ...(showRevenue ? ["累计收益"] : []),
                      "位置",
                      "负责人",
                      "操作",
                    ].map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} onClick={() => onOpenStation(s.id)}>
                      <td>
                        <div className="station-name-cell">
                          {s.imageUrl ? (
                            <img
                              className="station-thumbnail"
                              src={s.imageUrl}
                              alt=""
                            />
                          ) : (
                            <div className="station-thumbnail station-thumbnail-empty">
                              <Asset name="list-imgMapPin" />
                            </div>
                          )}
                          <div>
                            <button
                              className="station-name-button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onOpenStation(s.id)
                              }}
                            >
                              {s.name}
                            </button>
                            <small>
                              {s.code} · {s.type}
                            </small>
                            <div className="station-badges">
                              <span
                                data-tone={
                                  s.status === "fault"
                                    ? "danger"
                                    : s.status === "building"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {s.status === "building"
                                  ? "建设中"
                                  : s.status === "fault"
                                    ? "告警"
                                    : s.dataStatus === "connected"
                                      ? "已接入"
                                      : s.dataStatus === "partial"
                                        ? "部分接入"
                                        : "未接入"}
                              </span>
                              <span
                                data-tone={
                                  s.runStatus === "正常" ? "success" : "neutral"
                                }
                              >
                                {s.runStatus || "未知"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            "station-soc-dot " +
                            (Number.isFinite(s.soc) && s.soc < 30 ? "low" : "")
                          }
                        />
                        {number(s.soc, "%")}
                      </td>
                      <td>
                        <strong>{number(s.activePower, " kW")}</strong>
                        <small>实时负载</small>
                      </td>
                      <td>
                        <strong>{s.runtime || "—"}</strong>
                        <small>运行时长</small>
                      </td>
                      {showRevenue && (
                        <td>
                          <strong>{s.revenue || "—"}</strong>
                          <small>累计收益</small>
                        </td>
                      )}
                      <td>
                        <div className="station-location">
                          <Asset name="list-imgMapPin" />
                          <span>
                            {s.region || "—"} / {s.project || "—"}
                            {tab === "收藏站点" && (
                              <small>{s.address || "—"}</small>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="station-manager">
                          <span>{s.manager?.slice(0, 1) || "—"}</span>
                          <div>
                            {s.manager || "未设置"}
                            {tab === "收藏站点" && (
                              <small>{s.email || "—"}</small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div
                          className="station-row-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            aria-label={
                              (stars[s.id] ? "取消收藏" : "收藏") + s.name
                            }
                            onClick={() =>
                              stars[s.id] && tab === "收藏站点"
                                ? setCancelStar(s.id)
                                : favorite(s.id)
                            }
                          >
                            <Asset
                              name={
                                "list-imgState" +
                                (stars[s.id] ? "Filled" : "Unfilled")
                              }
                            />
                          </button>
                          {canEditStation(s.id) && (
                            <button
                              aria-label={"编辑" + s.name}
                              title="编辑站点"
                              onClick={() => { setViewOnly(false); setEditing(s) }}
                            >
                              <Asset name="list-imgEdit" />
                            </button>
                          )}
                          <button
                            aria-label={s.name + "更多操作"}
                            onClick={() => setMenu(menu === s.id ? null : s.id)}
                          >
                            ···
                          </button>
                          {cancelStar === s.id && (
                            <div
                              className="station-favorite-confirm"
                              role="dialog"
                              aria-label="确定取消收藏？"
                            >
                              <p>确定取消收藏？</p>
                              <Button onClick={() => setCancelStar(null)}>
                                取消
                              </Button>
                              <Button
                                variant="primary"
                                onClick={() => favorite(s.id)}
                              >
                                确认
                              </Button>
                            </div>
                          )}
                          {menu === s.id && (
                            <div className="station-row-menu">
                              <button
                                onClick={() => {
                                  setViewOnly(true)
                                  setEditing(s)
                                  setMenu(null)
                                }}
                              >
                                查看站点信息
                              </button>
                              {canEditStation(s.id) && (
                                <button
                                  onClick={() => {
                                    setProvision(s)
                                    setMenu(null)
                                  }}
                                >
                                  {s.status === "building"
                                    ? "建站配置与进度"
                                    : "新版本配置草稿"}
                                </button>
                              )}
                              {canEditStation(s.id) && (
                                <button
                                  onClick={() => {
                                    setDeleting(s)
                                    setDeleteName("")
                                    setMenu(null)
                                  }}
                                >
                                  删除站点
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!filtered.length && (
              <div className="station-list-empty">
                <div className="station-empty-star">
                  <Asset name="favorite-imgEmptyIconBg" />
                  <Asset name="favorite-imgEmptyStar" />
                </div>
                <h2>
                  {tab === "收藏站点" ? "暂无收藏站点" : "未找到匹配站点"}
                </h2>
                <p>
                  {tab === "收藏站点"
                    ? "前往站点列表，点击 ☆ 即可收藏常用站点"
                    : "调整搜索条件或区域后重试"}
                </p>
                <button
                  className="station-text-button"
                  onClick={() => {
                    changeTab("列表查询")
                    setSearch("")
                    setRegion("")
                  }}
                >
                  前往站点列表 →
                </button>
              </div>
            )}
          </div>
          <footer className="station-pagination">
            <label>
              每页显示{" "}
              <select
                aria-label="每页显示"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {[18, 36, 72].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <div>
              {pages > 1 && (
                <Button
                  disabled={current === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
              )}
              <span>{current}</span>
              {pages > 1 && (
                <Button
                  disabled={current === pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              )}
            </div>
            <small>{filtered.length} 个站点</small>
          </footer>
        </div>
      )}
      {notice && (
        <div className="station-toast" role="status">
          {notice}
        </div>
      )}
      {deleting && (
        <Modal
          title="确认删除站点"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button onClick={() => setDeleting(null)}>取消</Button>
              <Button
                disabled={deleteName !== deleting.name}
                onClick={() =>
                  setNotice("站点删除服务尚未接通，未删除任何数据。")
                }
              >
                确认删除（未接通）
              </Button>
            </>
          }
        >
          <p>删除后站点数据将无法恢复。请输入站点名称以核对操作对象。</p>
          <input
            aria-label="确认删除的站点名称"
            value={deleteName}
            onChange={(e) => setDeleteName(e.target.value)}
            placeholder={deleting.name}
          />
          <p className="station-subtle">
            当前未提供删除接口；确认仅检查输入，不会删除站点。
          </p>
        </Modal>
      )}
    </div>
  )
}
