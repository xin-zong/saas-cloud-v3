import { calendarBounds } from "@/preferences/date"

import { useState } from "react"

import { send } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import {
  CheckList,
  DetailGrid,
  Field,
  Pagination,
  QueryState,
  TenantDialog,
  date,
  statusLabel,
  useTenantQuery,
} from "./shared"

import { companyTypes, businessScopes, type Row, type PageRows } from "./types"

export default function CompanyApprovalsPage() {
  const { user } = useAuth()

  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [address, setAddress] = useState(""),
    [more, setMore] = useState(false),
    [tag, setTag] = useState(""),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [offset, setOffset] = useState(0),
    [detail, setDetail] = useState<number | null>(null)

  const params = new URLSearchParams({
    query,

    address,

    status,

    type,

    offset: String(offset),
  })

  if (tag) params.set("tag", tag)

  if (from) params.set("from", calendarBounds(from, "D").start.toISOString())

  if (until)
    params.set(
      "until",

      new Date(calendarBounds(until, "D").end.getTime() + 1).toISOString(),
    )

  const list = useTenantQuery<PageRows>(
    `/platform/company-applications?${params}`,
  )

  const canReview = !!user?.permissions.includes("company.application.review")

  const filterOptions = useTenantQuery<Row>("/platform/company-options")

  return (
    <>
      <PageHeader
        title="企业审批"
        description="审核通过创建独立企业和受保护管理员，并发送一次性激活邀请。"
      />
      <div className="tenant-toolbar">
        <input
          aria-label="搜索企业申请"
          placeholder="企业 / 邮箱 / 联系人 / 申请编号"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)

            setOffset(0)
          }}
        />
        <select
          aria-label="申请状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)

            setOffset(0)
          }}
        >
          <option value="">全部状态</option>
          {["pending", "approved", "rejected"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="申请企业类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value)

            setOffset(0)
          }}
        >
          <option value="">全部类型</option>
          {companyTypes.map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => {
            setOffset(0)
            list.reload()
          }}
        >
          查询
        </Button>
        <Button
          onClick={() => {
            setQuery("")
            setStatus("")
            setType("")
            setAddress("")
            setTag("")
            setFrom("")
            setUntil("")
            setOffset(0)
          }}
        >
          重置
        </Button>
        <Button aria-expanded={more} onClick={() => setMore(!more)}>
          更多筛选
        </Button>
      </div>
      {more && (
        <div className="tenant-toolbar">
          <Field label="企业地址">
            <input
              aria-label="申请企业地址"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value)
                setOffset(0)
              }}
              placeholder="国家 / 省州 / 城市 / 地址"
            />
          </Field>
          <select
            aria-label="申请标签"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value)
              setOffset(0)
            }}
          >
            <option value="">全部标签</option>
            {filterOptions.data?.tags.map((tag: Row) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <Field label="提交开始日期">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)

                setOffset(0)
              }}
            />
          </Field>
          <Field label="提交结束日期">
            <input
              type="date"
              value={until}
              min={from}
              onChange={(e) => {
                setUntil(e.target.value)

                setOffset(0)
              }}
            />
          </Field>
        </div>
      )}
      <section className="tenant-card">
        <table className="tenant-table">
          <thead>
            <tr>
              {[
                "企业名称",

                "企业类型",

                "联系人 / 邮箱",

                "企业地址",

                "标签",

                "申请编号 / 时间",

                "状态",

                "审批人",

                "操作",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  {r.companyTypes
                    ?.map(
                      (c: string) =>
                        companyTypes.find(([v]) => v === c)?.[1] ?? c,
                    )
                    .join("、") || "—"}
                </td>
                <td>
                  {r.contact_name}
                  <small>{r.email}</small>
                </td>
                <td>
                  {[r.country, r.province, r.city].filter(Boolean).join(" / ")}
                  <small>{r.address}</small>
                </td>
                <td>
                  {r.tags?.map((t: Row) => <Badge key={t.id}>{t.name}</Badge>)}
                </td>
                <td>
                  {r.number}
                  <small>{date(r.submitted_at)}</small>
                </td>
                <td>
                  <Badge
                    tone={
                      r.status === "pending"
                        ? "warning"
                        : r.status === "approved"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {statusLabel(r.status)}
                  </Badge>
                </td>
                <td>{r.reviewer ?? "—"}</td>
                <td>
                  <Button variant="ghost" onClick={() => setDetail(r.id)}>
                    查看申请
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <QueryState
          loading={list.loading}
          error={list.error}
          empty={!list.data?.items.length}
        />
        {list.data && (
          <Pagination
            total={list.data.total}
            offset={offset}
            onChange={setOffset}
          />
        )}
      </section>
      {detail != null && (
        <ApprovalDetail
          id={detail}
          canReview={canReview}
          onClose={() => setDetail(null)}
          onChanged={list.reload}
        />
      )}
    </>
  )
}

function ApprovalDetail({
  id,

  canReview,

  onClose,

  onChanged,
}: {
  id: number

  canReview: boolean

  onClose: () => void

  onChanged: () => void
}) {
  const detail = useTenantQuery<Row>(`/platform/company-applications/${id}`),
    [action, setAction] = useState("")

  return (
    <TenantDialog title="企业申请详情" wide onClose={onClose}>
      <QueryState loading={detail.loading} error={detail.error} />
      {detail.data && (
        <>
          <DetailGrid
            row={detail.data}
            fields={[
              ["number", "申请编号"],

              ["name", "企业名称"],

              ["email", "申请邮箱"],

              ["contact_name", "联系人"],

              ["phone", "电话"],

              ["country", "国家"],

              ["province", "省 / 州"],

              ["city", "城市"],

              ["address", "地址"],

              ["postcode", "邮编"],

              ["system_scale", "系统规模"],

              ["service_description", "服务描述"],

              ["registration_no", "商业注册号"],

              ["taxId", "税号"],

              ["website", "官网"],
            ]}
          />
          <p>
            企业类型：
            {detail.data.companyTypes

              .map((c: string) => companyTypes.find(([v]) => v === c)?.[1] ?? c)

              .join("、")}
          </p>
          <p>
            业务范围：
            {detail.data.businessScopes

              .map(
                (c: string) => businessScopes.find(([v]) => v === c)?.[1] ?? c,
              )

              .join("、")}
          </p>
          <ul className="tenant-timeline">
            {detail.data.events.map((e: Row) => (
              <li key={e.id}>
                {statusLabel(e.action)} · {e.actor ?? "申请人"}
                <p>{e.reason}</p>
                <small>{date(e.occurred_at)}</small>
              </li>
            ))}
          </ul>
          {canReview && detail.data.status === "pending" && (
            <div className="tenant-toolbar">
              <Button variant="primary" onClick={() => setAction("approve")}>
                审批通过
              </Button>
              <Button onClick={() => setAction("reject")}>拒绝申请</Button>
            </div>
          )}
          {action && (
            <ReviewForm
              row={detail.data}
              kind={action}
              onClose={() => {
                setAction("")

                detail.reload()

                onChanged()
              }}
              onSaved={() => {
                detail.reload()

                onChanged()
              }}
            />
          )}
        </>
      )}
    </TenantDialog>
  )
}

function ReviewForm({
  row,

  kind,

  onClose,

  onSaved,
}: {
  row: Row

  kind: string

  onClose: () => void

  onSaved: () => void
}) {
  const options = useTenantQuery<{ packages: Row[] ;tags: Row[] }>(
    kind === "approve" ? "/platform/company-options" : null,
  )

  const [packages, setPackages] = useState<string[]>([]),
    [tags, setTags] = useState<string[]>([]),
    [types, setTypes] = useState<string[]>(row.companyTypes),
    [scopes, setScopes] = useState<string[]>(row.businessScopes),
    [scale, setScale] = useState(row.system_scale ?? ""),
    [reason, setReason] = useState("")

  return (
    <TenantDialog
      title={kind === "approve" ? "确认审批通过" : "拒绝企业申请"}
      onClose={onClose}
      onSave={async () => {
        if (kind === "approve" && !packages.length)
          throw new Error("至少选择一个启用权限包")

        try {
          await send(
            `/platform/company-applications/${row.id}/${kind}`,

            "POST",

            kind === "approve"
              ? {
                  packageIds: packages.map(Number),

                  tagIds: tags.map(Number),

                  companyTypes: types,

                  businessScopes: scopes,

                  systemScale: scale || null,
                }
              : { reason },
          )

          onSaved()
        } catch (e) {
          throw e
        }
      }}
    >
      {kind === "reject" ? (
        <Field label="拒绝原因 *">
          <textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      ) : (
        <>
          <QueryState loading={options.loading} error={options.error} />
          <CheckList
            label="权限包 *"
            options={
              options.data?.packages

                .filter((p) => p.enabled)

                .map((p) => [String(p.id), p.name] as const) ?? []
            }
            value={packages}
            onChange={setPackages}
          />
          <CheckList
            label="企业类型"
            options={companyTypes}
            value={types}
            onChange={setTypes}
          />
          <CheckList
            label="业务范围"
            options={businessScopes}
            value={scopes}
            onChange={setScopes}
          />
          <CheckList
            label="企业标签"
            options={
              options.data?.tags.map((t) => [String(t.id), t.name] as const) ??
              []
            }
            value={tags}
            onChange={setTags}
          />
          <Field label="系统规模">
            <select value={scale} onChange={(e) => setScale(e.target.value)}>
              <option value="">未填写</option>
              {["lt100", "100to1000", "1000to10000", "gt10000"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <p className="tenant-notice">
            只允许第一个审批提交生效。通过后不可撤销；后续资料和套餐变更在企业管理操作。激活邮件将加入投递队列。
          </p>
        </>
      )}
    </TenantDialog>
  )
}
