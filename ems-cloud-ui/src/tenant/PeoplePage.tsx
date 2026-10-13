import { useState } from "react"

import { send } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { useDisplayPreferences } from "@/preferences/PreferencesProvider"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import {
  Field,
  TenantDialog,
  QueryState,
  Pagination,
  date,
  statusLabel,
  useTenantQuery,
} from "./shared"

import MemberGrantsPanel from "./MemberGrantsPanel"

import type { Row, PageRows } from "./types"

export default function PeoplePage({ grantOnly = false }: {
  grantOnly?: boolean
} = {}) {
  const { user } = useAuth()

  const { language } = useDisplayPreferences()

  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [role, setRole] = useState(""),
    [offset, setOffset] = useState(0),
    [edit, setEdit] = useState<Row | null>(null),
    [grants, setGrants] = useState<Row | null>(null),
    [action, setAction] = useState<{ row: Row ;kind: string } | null>(null)

  const people = useTenantQuery<PageRows>(
    `/company/${
      grantOnly ? "grant-members" : "people"
    }?${new URLSearchParams({ query, status, role, offset: String(offset) })}`,
  )

  const roleOptions = useTenantQuery<string[]>(
    grantOnly ? null : "/company/people/role-options",
  )

  const platform = user?.tenant?.kind === "platform"

  const manage =
      !grantOnly && !!user?.permissions.includes("company.people.manage"),
    canGrant = !!user?.permissions.includes("company.grant.manage")

  return (
    <>
      <PageHeader
        title={
          grantOnly
            ? "站点授权"
            : user?.tenant?.kind === "platform"
              ? "平台员工"
              : "员工管理"
        }
        description="同一邮箱只属于一个租户。新员工通过一次性链接设置密码后激活。"
        actions={
          manage && (
            <Button
              variant="primary"
              onClick={() => setEdit({ name: "", email: "", remarks: "" })}
            >
              邀请员工
            </Button>
          )
        }
      />
      <div className="tenant-toolbar">
        <input
          aria-label="搜索姓名或邮箱"
          placeholder="搜索姓名 / 邮箱"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)

            setOffset(0)
          }}
        />
        {!grantOnly && (
          <select
            aria-label="员工角色"
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setOffset(0)
            }}
          >
            <option value="">全部角色</option>
            <option value="administrator">Super Admin · 系统身份</option>
            {roleOptions.data?.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="员工状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)

            setOffset(0)
          }}
        >
          <option value="">全部状态</option>
          {["active", "invited", "disabled"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <Button onClick={people.reload}>刷新</Button>
      </div>
      <section className="tenant-card">
        <table className="tenant-table">
          <thead>
            <tr>
              {[
                "姓名 / 邮箱",

                "角色",

                "状态",

                platform ? "备注" : "负责站点",

                "修改时间",

                "操作",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.data?.items.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.display_name}
                  <small>{row.account}</small>
                </td>
                <td>
                  {row.administrator ? (
                    <Badge>Super Admin · 系统身份</Badge>
                  ) : (
                    row.roles?.map((r: Row) => (
                      <div key={r.id}>
                        {r.name}{" "}
                        <Badge>
                          {r.source === "template" ? "预制" : "自定义"}
                        </Badge>
                      </div>
                    ))
                  )}
                </td>
                <td>
                  <Badge
                    tone={
                      row.status === "active"
                        ? "success"
                        : row.status === "invited"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {statusLabel(row.status)}
                  </Badge>
                </td>
                <td>
                  {platform
                    ? row.remarks || "—"
                    : row.managedStations?.map((s: Row) => s.name).join("、") ||
                      "—"}
                </td>
                <td>{date(row.updated_at)}</td>
                <td>
                  {canGrant && (
                    <Button variant="ghost" onClick={() => setGrants(row)}>
                      {row.administrator ? "查看身份" : "配置授权"}
                    </Button>
                  )}
                  {manage && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEdit({
                            ...row,

                            name: row.display_name,

                            email: row.account,
                          })
                        }
                      >
                        编辑
                      </Button>
                      {row.status === "invited" && (
                        <Button
                          variant="ghost"
                          onClick={() => setAction({ row, kind: "reinvite" })}
                        >
                          重发邀请
                        </Button>
                      )}
                      {!row.administrator && (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setAction({
                                row,

                                kind:
                                  row.status === "disabled"
                                    ? "enable"
                                    : "disable",
                              })
                            }
                          >
                            {row.status === "disabled" ? "启用" : "停用"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setAction({ row, kind: "delete" })}
                          >
                            删除
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <QueryState
          loading={people.loading}
          error={people.error}
          empty={!people.data?.items.length}
        />
        {people.data && (
          <Pagination
            total={people.data.total}
            offset={offset}
            onChange={setOffset}
          />
        )}
      </section>
      {edit && (
        <PersonEditor
          row={edit}
          language={language === "English" ? "en" : "zh-CN"}
          onClose={() => setEdit(null)}
          onSaved={people.reload}
        />
      )}{" "}
      {grants && (
        <MemberGrantsPanel member={grants} onClose={() => setGrants(null)} />
      )}{" "}
      {action && (
        <PersonAction
          row={action.row}
          kind={action.kind}
          language={language === "English" ? "en" : "zh-CN"}
          onClose={() => setAction(null)}
          onSaved={people.reload}
        />
      )}
    </>
  )
}

function PersonEditor({
  row,

  language,

  onClose,

  onSaved,
}: {
  row: Row

  language: string

  onClose: () => void

  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: row.name,

    email: row.email,

    remarks: row.remarks ?? "",
  })

  return (
    <TenantDialog
      title={row.id ? "编辑员工" : "邀请新员工"}
      onClose={onClose}
      onSave={async () => {
        await send(
          row.id ? `/company/people/${row.id}` : "/company/people",

          row.id ? "PUT" : "POST",

          row.id
            ? { name: form.name, remarks: form.remarks }
            : { ...form, language },
        )

        onSaved()
      }}
    >
      <div className="tenant-form-grid">
        <Field label="显示名称 *">
          <input
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="登录邮箱 *">
          <input
            required
            type="email"
            maxLength={254}
            readOnly={!!row.id}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="备注" wide>
          <textarea
            maxLength={2000}
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
          />
        </Field>
      </div>
      {!row.id && (
        <p className="tenant-notice">
          邀请创建后邮件进入投递队列，未激活账号不能登录业务页。请在员工列表中另行配置角色和站点范围。
        </p>
      )}
    </TenantDialog>
  )
}

function PersonAction({
  row,

  kind,

  language,

  onClose,

  onSaved,
}: {
  row: Row

  kind: string

  language: string

  onClose: () => void

  onSaved: () => void
}) {
  const moving = ["delete", "disable"].includes(kind),
    options = useTenantQuery<Row[]>(
      moving ? `/company/people/${row.id}/transfer-options` : null,
    )

  const [replacement, setReplacement] = useState("")

  const candidates = (options.data?.[0]?.candidates ?? []).filter((u: Row) =>
    options.data?.every((s) => s.candidates.some((c: Row) => c.id === u.id)),
  )

  return (
    <TenantDialog
      title={
        ({
          delete: "删除员工",

          disable: "停用员工",

          enable: "启用员工",

          reinvite: "重发激活邀请",
        } as Record<string, string>)[kind]
      }
      onClose={onClose}
      onSave={async () => {
        if (moving && options.loading)
          throw new Error("正在读取负责站点，请稍候")

        if (options.error) throw new Error(options.error)

        const replacementUserId = replacement ? Number(replacement) : null

        if (kind === "reinvite")
          await send(`/company/people/${row.id}/reinvite`, "POST", { language })
        else if (kind === "delete")
          await send(`/company/people/${row.id}`, "DELETE", {
            replacementUserId,
          })
        else
          await send(`/company/people/${row.id}/status`, "PUT", {
            enabled: kind === "enable",

            replacementUserId,
          })

        onSaved()
      }}
    >
      <p>
        员工：{row.display_name} · {row.account}
      </p>
      {kind === "reinvite" ? (
        <p className="tenant-notice">
          重发后原激活链接立即失效。已激活账号不能通过此功能重置密码。
        </p>
      ) : kind === "enable" ? (
        <p>未完成密码设置的账号恢复后仍需激活，不能直接登录。</p>
      ) : (
        <>
          <p className="tenant-notice">
            将撤销全部设备会话。员工负责的站点须在本企业内移交，历史审计保留。
          </p>
          <QueryState loading={options.loading} error={options.error} />
          {!!options.data?.length && (
            <>
              <p>负责站点：{options.data.map((s) => s.name).join("、")}</p>
              <Field label="站点接收人">
                <select
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                >
                  <option value="">由本企业受保护管理员接收</option>
                  {candidates.map((u: Row) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} · {u.account}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </>
      )}
    </TenantDialog>
  )
}
