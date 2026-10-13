import { useState } from "react"

import { send } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import {
  CheckList,
  Field,
  QueryState,
  TenantDialog,
  Pagination,
  DetailGrid,
  useTenantQuery,
  date,
} from "./shared"

import CompanyForm, { companyFrom } from "./CompanyForm"

import { companyTypes, type Row, type PageRows } from "./types"

export function CompanyProfilePage() {
  const { user } = useAuth()

  const profile = useTenantQuery<Row>("/company/profile"),
    [edit, setEdit] = useState(false)

  return (
    <>
      <PageHeader
        title="企业资料"
        description="管理员登录邮箱固定；联系人资料独立维护。"
        actions={
          user?.permissions.includes("company.profile.manage") && (
            <Button
              variant="primary"
              disabled={!profile.data}
              onClick={() => setEdit(true)}
            >
              编辑企业资料
            </Button>
          )
        }
      />
      <QueryState loading={profile.loading} error={profile.error} />
      {profile.data && (
        <section className="tenant-card">
          <CompanyDetails row={profile.data} />
        </section>
      )}
      {edit && profile.data && (
        <CompanyEditor
          row={profile.data}
          own
          onClose={() => setEdit(false)}
          onSaved={profile.reload}
        />
      )}
    </>
  )
}

export default function CompaniesPage() {
  const { user } = useAuth()

  const manage = !!user?.permissions.includes("company.manage")

  const [query, setQuery] = useState(""),
    [type, setType] = useState(""),
    [address, setAddress] = useState(""),
    [enabled, setEnabled] = useState(""),
    [tag, setTag] = useState(""),
    [offset, setOffset] = useState(0),
    [detail, setDetail] = useState<number | null>(null),
    [tags, setTags] = useState(false)

  const params = new URLSearchParams({
    query,
    type,
    address,
    offset: String(offset),
  })

  if (enabled) params.set("enabled", enabled)

  if (tag) params.set("tag", tag)

  const companies = useTenantQuery<PageRows>(`/platform/companies?${params}`),
    options = useTenantQuery<{ packages: Row[] ;tags: Row[] }>(
      "/platform/company-options",
    )

  return (
    <>
      <PageHeader
        title="企业管理"
        description="企业之间完全隔离，权限包变更会实时影响企业员工。"
        actions={
          manage && <Button onClick={() => setTags(true)}>管理标签</Button>
        }
      />
      <div className="tenant-toolbar">
        <input
          aria-label="搜索企业"
          placeholder="企业 ID / 名称 / 联系人 / 邮箱"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)

            setOffset(0)
          }}
        />
        <select
          aria-label="企业类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value)

            setOffset(0)
          }}
        >
          <option value="">全部企业类型</option>
          {companyTypes.map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        <select
          aria-label="企业状态"
          value={enabled}
          onChange={(e) => {
            setEnabled(e.target.value)

            setOffset(0)
          }}
        >
          <option value="">全部状态</option>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </select>
        <select
          aria-label="企业标签"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value)

            setOffset(0)
          }}
        >
          <option value="">全部标签</option>
          {options.data?.tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          aria-label="企业所在区域"
          placeholder="国家 / 省州 / 城市"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setOffset(0)
          }}
        />
        <Button variant="primary" onClick={companies.reload}>
          查询
        </Button>
      </div>
      <section className="tenant-card">
        <table className="tenant-table">
          <thead>
            <tr>
              {[
                "企业名称",

                "类型",

                "联系人 / 邮箱",

                "企业地址",

                "标签",

                "企业 ID / 入驻 / 修改",

                "状态",

                "操作",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.data?.items.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  {r.companyTypes

                    .map(
                      (c: string) =>
                        companyTypes.find(([v]) => v === c)?.[1] ?? c,
                    )

                    .join("、")}
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
                  {r.tags.map((t: Row) => (
                    <Badge key={t.id}>{t.name}</Badge>
                  ))}
                </td>
                <td>
                  ENT-{String(r.id).padStart(5, "0")}
                  <small>入驻 {date(r.created_at)}</small>
                  <small>修改 {date(r.updated_at)}</small>
                </td>
                <td>
                  <Badge tone={r.enabled ? "success" : "neutral"}>
                    {r.enabled ? "启用" : "停用"}
                  </Badge>
                </td>
                <td>
                  <Button variant="ghost" onClick={() => setDetail(r.id)}>
                    查看详情
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <QueryState
          loading={companies.loading}
          error={companies.error}
          empty={!companies.data?.items.length}
        />
        {companies.data && (
          <Pagination
            total={companies.data.total}
            offset={offset}
            onChange={setOffset}
          />
        )}
      </section>
      {detail != null && (
        <CompanyDetail
          id={detail}
          manage={manage}
          options={options.data ?? { packages: [], tags: [] }}
          onClose={() => setDetail(null)}
          onChanged={companies.reload}
        />
      )}{" "}
      {tags && (
        <TagsManager
          onClose={() => setTags(false)}
          onChanged={() => {
            options.reload()

            companies.reload()
          }}
        />
      )}
    </>
  )
}

function CompanyDetails({ row }: { row: Row }) {
  return (
    <>
      <DetailGrid
        row={row}
        fields={[
          ["name", "企业名称"],

          ["email", "管理员登录邮箱"],

          ["country", "国家"],

          ["province", "省 / 州"],

          ["city", "城市"],

          ["address", "详细地址"],

          ["postcode", "邮编"],

          ["contact_name", "联系人"],

          ["phone", "电话"],

          ["website", "官网"],

          ["registration_no", "商业注册号"],

          ["taxId", "税号"],

          ["system_scale", "系统规模"],

          ["service_description", "服务描述"],
        ]}
      />
      <p>
        企业类型：
        {row.companyTypes

          ?.map((c: string) => companyTypes.find(([v]) => v === c)?.[1] ?? c)

          .join("、")}
      </p>
      <p>
        权限包：
        {row.packages

          ?.map((p: Row) => `${p.name}${p.enabled ? "" : "（停用）"}`)

          .join("、")}
      </p>
    </>
  )
}

function CompanyDetail({
  id,

  manage,

  options,

  onClose,

  onChanged,
}: {
  id: number

  manage: boolean

  options: { packages: Row[] ;tags: Row[] }

  onClose: () => void

  onChanged: () => void
}) {
  const detail = useTenantQuery<Row>(`/platform/companies/${id}`),
    [edit, setEdit] = useState(false),
    [action, setAction] = useState(""),
    [section, setSection] = useState("")

  const r = detail.data

  const reload = () => {
    detail.reload()

    onChanged()
  }

  return (
    <TenantDialog title="企业详情" wide onClose={onClose}>
      <QueryState loading={detail.loading} error={detail.error} />
      {r && (
        <>
          <CompanyDetails row={r} />
          {manage && (
            <div className="tenant-toolbar">
              <Button onClick={() => setEdit(true)}>编辑资料</Button>
              <Button onClick={() => setAction("types")}>配置企业类型</Button>
              <Button onClick={() => setAction("packages")}>配置权限包</Button>
              {r.administrator_status === "invited" && (
                <Button onClick={() => setAction("invite")}>
                  重发管理员邀请
                </Button>
              )}
              <Button onClick={() => setAction("tags")}>设置标签</Button>
              <Button onClick={() => setAction("status")}>
                {r.enabled ? "停用企业" : "启用企业"}
              </Button>
            </div>
          )}
          <div className="tenant-member-section">
            <Button
              aria-expanded={section === "people"}
              onClick={() => setSection(section === "people" ? "" : "people")}
            >
              企业员工
            </Button>
            {section === "people" && (
              <CompanyResourceList id={id} kind="people" />
            )}
          </div>
          <div className="tenant-member-section">
            <Button
              aria-expanded={section === "stations"}
              onClick={() =>
                setSection(section === "stations" ? "" : "stations")
              }
            >
              企业电站
            </Button>
            {section === "stations" && (
              <CompanyResourceList id={id} kind="stations" />
            )}
          </div>
          {edit && (
            <CompanyEditor
              row={r}
              onClose={() => setEdit(false)}
              onSaved={reload}
            />
          )}{" "}
          {action && (
            <CompanyAction
              row={r}
              id={id}
              kind={action}
              options={options}
              onClose={() => setAction("")}
              onSaved={reload}
            />
          )}
        </>
      )}
    </TenantDialog>
  )
}

function CompanyResourceList({
  id,
  kind,
}: {
  id: number
  kind: "people" | "stations"
}) {
  const [query, setQuery] = useState("")

  const rows = useTenantQuery<Row[]>(
    `/platform/companies/${id}/${kind}?${new URLSearchParams({ query })}`,
  )

  return (
    <>
      <div className="tenant-toolbar">
        {kind === "stations" && (
          <input
            aria-label="搜索企业电站"
            placeholder="搜索电站名称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>
      <div className="tenant-card">
        <table className="tenant-table">
          <thead>
            <tr>
              {(kind === "stations"
                ? ["电站名称", "位置", "容量 (kWh)", "状态", "负责人"]
                : ["姓名 / 邮箱", "状态", "备注"]
              ).map((n) => (
                <th key={n}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.data?.map((r) => (
              <tr key={r.id}>
                {kind === "stations" ? (
                  <>
                    <td>
                      {r.name}
                      <small>{r.code}</small>
                    </td>
                    <td>{r.address || "—"}</td>
                    <td>{r.capacity_kwh ?? "—"}</td>
                    <td>{r.status || "未知"}</td>
                    <td>{r.manager || "—"}</td>
                  </>
                ) : (
                  <>
                    <td>
                      {r.display_name}
                      <small>{r.account}</small>
                    </td>
                    <td>{r.status}</td>
                    <td>{r.remarks || "—"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <QueryState
          loading={rows.loading}
          error={rows.error}
          empty={!rows.data?.length}
        />
      </div>
    </>
  )
}

function CompanyEditor({
  row,

  own = false,

  onClose,

  onSaved,
}: {
  row: Row

  own?: boolean

  onClose: () => void

  onSaved: () => void
}) {
  const [form, setForm] = useState(companyFrom(row))

  return (
    <TenantDialog
      title="编辑企业资料"
      wide
      onClose={onClose}
      onSave={async () => {
        if (!form.companyTypes.length || !form.businessScopes.length)
          throw new Error("请选择企业类型和业务范围")

        await send(
          own ? "/company/profile" : `/platform/companies/${row.tenant_id}`,

          "PUT",

          form,
        )

        onSaved()
      }}
    >
      <p className="tenant-notice">
        管理员登录邮箱：{row.email}，不可通过企业资料编辑修改。
      </p>
      <CompanyForm value={form} onChange={setForm} lockedRegistration />
    </TenantDialog>
  )
}

function CompanyAction({
  row,

  id,

  kind,

  options,

  onClose,

  onSaved,
}: {
  row: Row

  id: number

  kind: string

  options: { packages: Row[] ;tags: Row[] }

  onClose: () => void

  onSaved: () => void
}) {
  const [ids, setIds] = useState<string[]>(
    kind === "types"
      ? row.companyTypes
      : (kind === "packages" ? row.packages : row.tags).map((p: Row) =>
          String(p.id),
        ),
  )

  return (
    <TenantDialog
      title={
        kind === "types"
          ? "配置企业类型"
          : kind === "packages"
            ? "配置企业权限包"
            : kind === "tags"
              ? "设置企业标签"
              : kind === "invite"
                ? "重发管理员激活邀请"
                : "确认企业状态变更"
      }
      onClose={onClose}
      onSave={async () => {
        if (kind === "types") {
          await send(`/platform/companies/${id}/types`, "PUT", {
            companyTypes: ids,
          })
          onSaved()
          return
        }

        if (kind === "invite") {
          await send(
            `/platform/companies/${id}/reinvite-administrator`,
            "POST",
            { language: "en" },
          )
          onSaved()
          return
        }

        const body =
          kind === "status"
            ? { enabled: !row.enabled, confirmed: true }
            : kind === "packages"
              ? { packageIds: ids.map(Number), confirmed: true }
              : { tagIds: ids.map(Number) }

        await send(`/platform/companies/${id}/${kind}`, "PUT", body)

        onSaved()
      }}
    >
      {kind === "types" ? (
        <CheckList
          label="企业类型 *（可多选）"
          options={companyTypes}
          value={ids}
          onChange={setIds}
        />
      ) : kind === "invite" ? (
        <p className="tenant-notice">
          重发后原链接立即失效。邮件进入投递队列，管理员需要自行设置密码后激活。
        </p>
      ) : kind === "status" ? (
        <p className="tenant-notice">
          {row.enabled
            ? "停用将立即禁止该企业全部账号登录，并撤销全部设备会话。"
            : "启用后按当前角色和权限包重新计算能力。"}
        </p>
      ) : (
        <>
          <CheckList
            label={kind === "packages" ? "至少选择一个启用权限包" : "企业标签"}
            options={(kind === "packages" ? options.packages : options.tags)

              .map(
                (p) =>
                  [
                    String(p.id),

                    `${p.name}${p.enabled === false ? "（已停用）" : ""}`,
                  ] as const,
              )}
            value={ids}
            onChange={setIds}
          />
          {kind === "packages" && (
            <p className="tenant-notice">
              套餐移除后原角色配置保留，套餐外权限立即失效。企业必须至少保留一个分配包。
            </p>
          )}
        </>
      )}
    </TenantDialog>
  )
}

function TagsManager({
  onClose,

  onChanged,
}: {
  onClose: () => void

  onChanged: () => void
}) {
  const tags = useTenantQuery<Row[]>("/platform/company-tags"),
    [edit, setEdit] = useState<Row | null>(null),
    [remove, setRemove] = useState<Row | null>(null)

  const reload = () => {
    tags.reload()

    onChanged()
  }

  return (
    <TenantDialog title="企业标签" onClose={onClose}>
      <Button onClick={() => setEdit({ name: "" })}>新增标签</Button>
      <QueryState loading={tags.loading} error={tags.error} />
      {tags.data?.map((t) => (
        <div className="tenant-toolbar" key={t.id}>
          <span>{t.name}</span>
          <Button onClick={() => setEdit(t)}>编辑</Button>
          <Button onClick={() => setRemove(t)}>删除</Button>
        </div>
      ))}
      {edit && (
        <TagEditor row={edit} onClose={() => setEdit(null)} onSaved={reload} />
      )}{" "}
      {remove && (
        <TagRemoval
          row={remove}
          onClose={() => setRemove(null)}
          onSaved={reload}
        />
      )}
    </TenantDialog>
  )
}

function TagEditor({
  row,

  onClose,

  onSaved,
}: {
  row: Row

  onClose: () => void

  onSaved: () => void
}) {
  const [name, setName] = useState(row.name)

  return (
    <TenantDialog
      title="编辑标签"
      onClose={onClose}
      onSave={async () => {
        await send(
          row.id
            ? `/platform/company-tags/${row.id}`
            : "/platform/company-tags",

          row.id ? "PUT" : "POST",

          { name },
        )

        onSaved()
      }}
    >
      <Field label="标签名称">
        <input
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
    </TenantDialog>
  )
}

function TagRemoval({
  row,

  onClose,

  onSaved,
}: {
  row: Row

  onClose: () => void

  onSaved: () => void
}) {
  const impact = useTenantQuery<Row>(`/platform/company-tags/${row.id}/impact`)

  return (
    <TenantDialog
      title="确认删除标签"
      onClose={onClose}
      onSave={async () => {
        if (!impact.data) throw new Error("正在读取影响范围")

        await send(`/platform/company-tags/${row.id}?confirmed=true`, "DELETE")

        onSaved()
      }}
    >
      <QueryState loading={impact.loading} error={impact.error} />
      <p>
        标签“{row.name}”关联 {impact.data?.companies ?? "—"} 个企业、
        {impact.data?.applications ?? "—"} 个申请。删除将清除全部标签关联。
      </p>
    </TenantDialog>
  )
}
